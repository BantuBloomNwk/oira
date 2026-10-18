// Seeker Genesis Token (SGT) verification, the full 3-part check per Solana Mobile's own
// guidance (docs/SEEKER-SEED-VAULT-AND-GENESIS.md §3), not just "does some wallet hold an
// NFT called Genesis":
//   1. the connected wallet owns a real SGT (3-property mint check: mint authority,
//      metadata pointer, token group member, all forgeable individually, not together)
//   2. she proves ownership of that wallet by signing a server-issued nonce (NOT just
//      trusting a bare pubkey string sent over HTTP, MWA's authorize() proves control to
//      the WALLET app, not to us; we still need our own signature check)
//   3. that SGT's mint address has not already been used to claim this reward (anti-replay
//, an SGT can move between a user's own Seed Vault accounts, mint stays constant)
//
// HONEST STATUS: written against Solana Mobile's documented Genesis Token addresses and
// @solana/spl-token's actual (checked, not guessed) Token-2022 extension API. Requires
// HELIUS_API_KEY to be configured (same pattern as BASE_RPC/TEE_RPC in oira-chain.mjs),
// without it, verify() fails closed with a clear config error rather than silently passing.
// Not yet exercised against a real SGT on mainnet (no key configured in this environment).
import { Connection, PublicKey } from '@solana/web3.js';
import { unpackMint, getMetadataPointerState, getTokenGroupMemberState, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import nacl from 'tweetnacl';
import { isRedeemed, claim } from './genesis-store.mjs';

const SGT_MINT_AUTHORITY = 'GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4';
const SGT_METADATA_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';
const SGT_GROUP_MINT_ADDRESS = 'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te';

// SGTs are minted on Solana MAINNET (Seeker is real hardware), unlike the rest of Oira's
// current devnet-only deployment, this is intentionally the one mainnet-reading path.
function heliusRpc() {
  const key = process.env.HELIUS_API_KEY;
  if (!key) throw new Error('HELIUS_API_KEY not configured, Genesis Token check cannot run.');
  return `https://mainnet.helius-rpc.com/?api-key=${key}`;
}

// ---- step 2: nonce challenge/verify (in-memory, short-lived; a single-box deploy concern,
// same tradeoff already accepted by genesis-store.mjs / campaign-store.mjs) ----
const CHALLENGES = new Map(); // pubkey -> { nonce, expiresAt }
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

export function createChallenge(pubkeyB58) {
  const nonce = Buffer.from(nacl.randomBytes(32)).toString('base64');
  CHALLENGES.set(pubkeyB58, { nonce, expiresAt: Date.now() + CHALLENGE_TTL_MS });
  return { nonce, message: `Oira Seeker Wallet verification: ${nonce}` };
}

function verifySignedChallenge(pubkeyB58, signatureB64) {
  const entry = CHALLENGES.get(pubkeyB58);
  if (!entry || entry.expiresAt < Date.now()) return false;
  CHALLENGES.delete(pubkeyB58); // one-shot
  const message = Buffer.from(`Oira Seeker Wallet verification: ${entry.nonce}`, 'utf8');
  const signature = Buffer.from(signatureB64, 'base64');
  const pubkeyBytes = new PublicKey(pubkeyB58).toBytes();
  try { return nacl.sign.detached.verify(message, signature, pubkeyBytes); } catch { return false; }
}

// ---- step 1: does this wallet hold a real SGT (paginate + validate) ----
async function fetchAllToken2022Mints(ownerB58) {
  const url = heliusRpc();
  const mints = [];
  let paginationKey;
  for (;;) {
    const options = { encoding: 'jsonParsed', limit: 1000 };
    if (paginationKey) options.paginationKey = paginationKey;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'getTokenAccountsByOwnerV2', params: [ownerB58, { programId: TOKEN_2022_PROGRAM_ID.toBase58() }, options] }),
    });
    const j = await res.json();
    if (j.error) throw new Error(`getTokenAccountsByOwnerV2: ${JSON.stringify(j.error)}`);
    const value = j.result && j.result.value;
    const accounts = Array.isArray(value) ? value : [];
    if (!accounts.length) break;
    for (const a of accounts) { const m = a.account && a.account.data && a.account.data.parsed && a.account.data.parsed.info && a.account.data.parsed.info.mint; if (m) mints.push(m); }
    paginationKey = j.result && j.result.paginationKey;
    if (!paginationKey) break;
  }
  return [...new Set(mints)];
}

async function findValidSgtMint(ownerB58) {
  const mints = await fetchAllToken2022Mints(ownerB58);
  if (!mints.length) return null;
  const connection = new Connection(heliusRpc(), 'confirmed');
  // batch of up to 100, per the documented flow
  for (let i = 0; i < mints.length; i += 100) {
    const batch = mints.slice(i, i + 100).map((m) => new PublicKey(m));
    const infos = await connection.getMultipleAccountsInfo(batch);
    for (let j = 0; j < batch.length; j++) {
      const info = infos[j];
      if (!info) continue;
      let mint;
      try { mint = unpackMint(batch[j], info, TOKEN_2022_PROGRAM_ID); } catch { continue; }
      const mintAuthorityOk = mint.mintAuthority && mint.mintAuthority.toBase58() === SGT_MINT_AUTHORITY;
      if (!mintAuthorityOk) continue;
      const mp = getMetadataPointerState(mint);
      const metadataOk = mp && mp.metadataAddress && mp.metadataAddress.toBase58() === SGT_METADATA_ADDRESS && mp.authority && mp.authority.toBase58() === SGT_MINT_AUTHORITY;
      if (!metadataOk) continue;
      const gm = getTokenGroupMemberState(mint);
      const groupOk = gm && gm.group && gm.group.toBase58() === SGT_GROUP_MINT_ADDRESS;
      if (!groupOk) continue;
      return batch[j].toBase58(); // all three checks passed
    }
  }
  return null;
}

// Full verification: all 3 parts. Returns { holder: boolean, mint?, alreadyClaimed?, error? }.
export async function verifyAndClaim({ pubkey, signature }) {
  if (!pubkey || !signature) return { holder: false, error: 'missing pubkey or signature' };
  if (!verifySignedChallenge(pubkey, signature)) return { holder: false, error: 'signature verification failed (bad, reused, or expired challenge)' };
  const mint = await findValidSgtMint(pubkey);
  if (!mint) return { holder: false };
  if (isRedeemed(mint)) return { holder: true, mint, alreadyClaimed: true };
  claim(mint, { wallet: pubkey });
  return { holder: true, mint, alreadyClaimed: false };
}
