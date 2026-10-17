// Oira chain bridge — the proven seal + private-payout flows as callable functions.
// Reuses exactly what client/e2e/per-palette-e2e.mjs and client/e2e/payout-e2e.mjs proved on devnet.
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js';
import {
  getAuthToken, permissionPdaFromAccount, deriveVault, deriveEphemeralAta,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram, delegationRecordPdaFromDelegatedAccount, delegationMetadataPdaFromDelegatedAccount,
  initVaultIx, initVaultAtaIx, initEphemeralAtaIx, createEataPermissionIx, transferToVaultIx, delegateEphemeralAtaIx, delegateEataPermissionIx, withdrawSplIx, undelegateIx as eataUndelegateIx,
  EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, PERMISSION_PROGRAM_ID, DELEGATION_PROGRAM_ID, TOKEN_PROGRAM_ID,
  createTopUpEscrowInstruction, escrowPdaFromEscrowAuthority,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, createMintToInstruction, unpackAccount } from '@solana/spl-token';
import { createHash, randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import fs from 'fs';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const TEE_VALIDATOR = new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
const TEE_RPC = process.env.OIRA_TEE_RPC || 'https://devnet-tee.magicblock.app';
// BASE_RPC is env-overridable so a hosted deploy can point at a paid/dedicated devnet RPC
// (a private endpoint removes the public-RPC 429s that plague the demo flows entirely).
const BASE_RPC = process.env.OIRA_BASE_RPC || 'https://api.devnet.solana.com';
const SYS = new PublicKey('11111111111111111111111111111111');
const MINT = new PublicKey(JSON.parse(fs.readFileSync(new URL('./payout-config.json', import.meta.url))).mint);
// Deployer secret: prefer OIRA_DEPLOYER_KEY (JSON array of bytes) for hosted/serverless
// deploys where there is no file on disk; fall back to the local gitignored key file.
function loadDeployer() {
  const env = process.env.OIRA_DEPLOYER_KEY;
  if (env) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env)));
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(new URL('../keys/oira-deployer.json', import.meta.url)))));
}
const deployer = loadDeployer();
const EX = (v) => `https://explorer.solana.com/address/${v}?cluster=devnet`;
const TX = (s) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const bBytes = (b) => { const l = Buffer.alloc(4); l.writeUInt32LE(b.length, 0); return Buffer.concat([l, Buffer.from(b)]); };
const base = new Connection(BASE_RPC, 'confirmed');
const opts = { commitment: 'confirmed', maxRetries: 5 };
// The public devnet RPC rate-limits hard, and web3.js leaks a 429 from its detached background
// rebroadcast loop as an UNHANDLED rejection — not catchable by any await — which otherwise crashes
// the whole process, i.e. the bridge mid-seal (a woman's seal dying on a transient RPC hiccup). This
// module runs both the long-lived bridge server and the one-shot e2e scripts, so: swallow transient
// ones and stay up; log anything else without exiting. A private endpoint via OIRA_BASE_RPC removes
// the 429s at the source — this is the code-level safety net for when it isn't set.
const isTransient = (err) => /429|Too Many Requests|Timed out|fetch failed|ETIMEDOUT|ECONNRESET|502|503|Blockhash not found/i.test(String(err && (err.message || err)));
process.on('unhandledRejection', (err) => { if (isTransient(err)) return; console.error('oira-chain unhandledRejection:', err && (err.message || err)); });

// Bridge health snapshot for /api/health — deployer SOL balance + whether base RPC and the TEE
// are reachable. Cached and refreshed in the BACKGROUND so a slow/throttled RPC can never hang the
// health endpoint (uptime probes must stay instant). Returns the last known values immediately.
let _status = { at: 0, deployerSol: null, rpcOk: null, teeOk: null }, _refreshing = false;
async function _refreshStatus() {
  if (_refreshing) return; _refreshing = true;
  const out = { at: Date.now(), deployerSol: _status.deployerSol, rpcOk: false, teeOk: false };
  try { const lamports = await base.getBalance(deployer.publicKey); out.deployerSol = +(lamports / 1e9).toFixed(3); out.rpcOk = true; } catch {}
  try { const r = await fetch(TEE_RPC.replace(/\?.*/, ''), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getVersion' }) }); out.teeOk = !!r && r.ok; } catch {}
  _status = out; _refreshing = false;
}
export function bridgeStatus() {
  if (Date.now() - _status.at > 60_000) _refreshStatus(); // fire-and-forget refresh when stale
  return { deployerSol: _status.deployerSol, rpcOk: _status.rpcOk, teeOk: _status.teeOk };
}
_refreshStatus(); // warm the cache at startup
// sealPalette() mints a fresh, fully valid, on-chain Palette from a server-generated random
// keypair, no passkey, no liveness, no client proof of humanity. It exists as the "Model A"
// no-setup demo path. runOffer() and matchCampaign() below both fall back to it silently when
// no real (passkey-sealed) identity is on the session, "so the demo always resolves" — and
// matchCampaign's fallback seals with traits set to EXACTLY the campaign's own target, i.e. an
// unauthenticated caller can fabricate a perfect-match identity and drain that campaign's escrow
// in one request. Gate the fallback behind an explicit opt-in so it can't happen by default in
// production; a real demo session that wants the old no-setup behaviour sets this once.
export function assertSelfSealAllowed(where) {
  if (process.env.OIRA_ALLOW_SELF_SEAL !== '1') {
    throw new Error(`${where}: no sealed Palette on this session, and self-seal fallback is disabled (set OIRA_ALLOW_SELF_SEAL=1 to allow it for a demo)`);
  }
}
async function freshTee(a) { const { token } = await getAuthToken(TEE_RPC, a.publicKey, (m) => Promise.resolve(nacl.sign.detached(m, a.secretKey))); return new Connection(`${TEE_RPC}?token=${token}`, 'confirmed'); }
async function sendOnEr(tee, ixs, signers, feePayer) {
  const tx = new Transaction().add(...ixs); tx.feePayer = feePayer.publicKey;
  const w = new Set([feePayer.publicKey.toBase58()]); for (const ix of tx.instructions) for (const k of ix.keys) if (k.isWritable) w.add(k.pubkey.toBase58());
  const r = await (await fetch(tee.rpcEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhashForAccounts', params: [[...w]] }) })).json();
  const bh = r.result.value; tx.recentBlockhash = bh.blockhash; tx.lastValidBlockHeight = bh.lastValidBlockHeight; tx.sign(...signers);
  const sig = await tee.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const c = await tee.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
  if (c.value?.err) throw new Error('ER tx failed ' + JSON.stringify(c.value.err));
  return sig;
}
const usdc = async (owner) => { try { const a = getAssociatedTokenAddressSync(MINT, owner, true); const i = await base.getAccountInfo(a); return i ? Number(unpackAccount(a, i).amount) / 1e6 : 0; } catch { return 0; } };
const bU64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };
const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');

const bU32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
const sha = (...b) => createHash('sha256').update(Buffer.concat(b)).digest();
async function fund(kp, lamports) { await sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: kp.publicKey, lamports })), [deployer], opts); }
// PaletteVault: disc8 owner32 enc(4+n) root32 | query_count4 lifetime4 epoch4 is_private1 last_verdict1 last_nonce16
// updated_at8 min_payout8 max_q_per_brand1 blocked_cats4 rules_active1 lifetime_cap4 epoch_cap4 agent32 …
function decodePalette(buf) { let o = 8; o += 32; const n = buf.readUInt32LE(o); o += 4; o += n; o += 32;
  o += 4; const lifetime = buf.readUInt32LE(o); o += 4; o += 4; const is_private = buf.readUInt8(o); o += 1;
  const last_verdict = buf.readUInt8(o); o += 1; const last_nonce = Buffer.from(buf.subarray(o, o + 16)); o += 16;
  o += 8; const min_payout = buf.readBigUInt64LE(o); o += 8; const max_q_per_brand = buf.readUInt8(o); o += 1;
  const blocked_cats = buf.readUInt32LE(o); o += 4; const rules_active = buf.readUInt8(o) === 1; o += 1;
  o += 4 + 4; const agent = new PublicKey(buf.subarray(o, o + 32));
  return { lifetime, is_private, last_verdict, last_nonce, agent, min_payout, max_q_per_brand, blocked_cats, rules_active }; }

// PROOF OF PRIVACY — a live, human-legible chain read so ANYONE (crypto or not) can confirm her
// palette is sealed. Returns the plain-language summary + the raw facts + the public explorer link
// so a normal person trusts the words and a skeptic clicks through to the ledger itself.
export async function privacyProof({ ownerPubkey } = {}) {
  const owner = new PublicKey(ownerPubkey);
  const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), owner.toBuffer()], PROGRAM)[0];
  const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), owner.toBuffer()], PROGRAM)[0];
  const info = await base.getAccountInfo(palettePda);
  const at = new Date().toISOString();
  if (!info) return { sealed: false, verifiedAt: at, network: 'Solana devnet', explorer: EX(palettePda.toBase58()) };
  // decode the two public facts: the ciphertext blob length and the 256-bit commitment hash
  let o = 8 + 32; const encLen = info.data.readUInt32LE(o); o += 4; o += encLen;
  const root = Buffer.from(info.data.subarray(o, o + 32)); o += 32; o += 12; const isPrivate = info.data.readUInt8(o) === 1;
  const tInfo = await base.getAccountInfo(traitsPda);
  const traitsDelegated = !!tInfo && tInfo.owner.equals(DELEGATION_PROGRAM_ID);
  // the ONLY way plaintext could leak is a program-owned, populated traits account on base
  const exposedOnChain = !!tInfo && tInfo.owner.equals(PROGRAM) && tInfo.data.length >= 44 && tInfo.data.readUInt8(8 + 32 + 3) === 1;
  return {
    sealed: true,
    verifiedAt: at,
    network: 'Solana devnet',
    // what the whole world can see about her, in her own terms
    publicCanSee: {
      scrambledBlob: `${encLen} bytes of scrambled data`,
      fingerprint: '0x' + root.toString('hex').slice(0, 12) + '…',
      fingerprintFull: '0x' + root.toString('hex'),
      isPrivate,
    },
    // what never appears on the public chain
    staysPrivate: ['your season and undertone', 'your secret key (salt)', "each brand's yes/no answer"],
    traitsDelegated,
    exposedOnChain,
    holds: exposedOnChain === false,
    explorer: EX(palettePda.toBase58()),
  };
}

// ---- MODEL B OFFER: a brand commits its target shade + escrow, co-delegates the campaign into
// her ER, the AGENT matches it in-enclave (owner offline), and — only on a real match — settles
// her payout from escrow against the private receipt. Ports client/e2e/model-b-e2e.mjs. ----
export async function runOffer({ ownerSecret, ownerPubkey, agentSecret, salt, traits, payout = 5, category = 0, target: targetArg } = {}) {
  // Runs against HER real palette from her owner PUBKEY + the bounded agent key + her confirmed
  // traits. Her owner SECRET is never needed here — the agent matches in-enclave and settle pays
  // her ATA. Self-seals a fresh palette only if she has not sealed on this bridge.
  if ((!ownerPubkey && !ownerSecret) || !agentSecret || !traits) { assertSelfSealAllowed('runOffer'); const s = await sealPalette({ traits }); ownerSecret = s.owner; agentSecret = s.agent; salt = s.salt; traits = s.traits; ownerPubkey = null; }
  const ownerPk = ownerPubkey ? new PublicKey(ownerPubkey) : Keypair.fromSecretKey(Uint8Array.from(ownerSecret)).publicKey;
  const owner = { publicKey: ownerPk }; // only her public key is used below (never her secret)
  const agent = Keypair.fromSecretKey(Uint8Array.from(agentSecret));
  const brand = Keypair.generate();
  const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), owner.publicKey.toBuffer()], PROGRAM)[0];
  const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), owner.publicKey.toBuffer()], PROGRAM)[0];
  const offerId = BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6));
  const oidLe = Buffer.alloc(8); oidLe.writeBigUInt64LE(offerId, 0);
  const [campaign] = PublicKey.findProgramAddressSync([Buffer.from('campaign'), brand.publicKey.toBuffer(), oidLe], PROGRAM);
  const [escrow] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), campaign.toBuffer()], PROGRAM);
  const brandAta = getAssociatedTokenAddressSync(MINT, brand.publicKey);
  const herAta = getAssociatedTokenAddressSync(MINT, owner.publicKey, true);
  // The brand commits a target shade. Default hunts HER colour so the overnight resolves to a match
  // in the demo; a real campaign passes its own {tu,td,ts,tol}. Leak-fixed ABI: base stores only
  // target_hash = sha256(offer_salt‖[tu,td,ts,tol]); the shade + salt are opened in-enclave at match.
  const target = targetArg || { tu: traits.undertone, td: traits.depth, ts: traits.season, tol: 1 };
  const offerSalt = randomBytes(16);
  const targetHash = sha(offerSalt, Buffer.from([target.tu, target.td, target.ts, target.tol]));
  const perAccept = BigInt(Math.round(payout * 1e6)), escrowAmt = perAccept + 15_000_000n;

  await fund(brand, 220_000_000);
  await sendAndConfirmTransaction(base, new Transaction()
    .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brand.publicKey, MINT))
    .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, herAta, owner.publicKey, MINT))
    .add(createMintToInstruction(MINT, brandAta, deployer.publicKey, Number(escrowAmt))), [deployer], opts);
  // brand commits its target shade (here: hunting HER colour so the overnight resolves to a match) + escrow
  const createIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: MINT, isSigner: false, isWritable: false },
    { pubkey: campaign, isSigner: false, isWritable: true }, { pubkey: escrow, isSigner: false, isWritable: true },
    { pubkey: brandAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: RENT, isSigner: false, isWritable: false }],
    data: Buffer.concat([disc('create_campaign'), bU64(Number(offerId)), Buffer.from([category]), bU64(100_000), bU64(Number(perAccept)), Buffer.from(targetHash), bU64(Number(escrowAmt))]) });
  const createSig = await sendAndConfirmTransaction(base, new Transaction().add(createIx), [brand], opts);
  const delCampIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: brand.publicKey, isSigner: false, isWritable: false },
    { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(campaign, PROGRAM), isSigner: false, isWritable: true },
    { pubkey: delegationRecordPdaFromDelegatedAccount(campaign), isSigner: false, isWritable: true },
    { pubkey: delegationMetadataPdaFromDelegatedAccount(campaign), isSigner: false, isWritable: true },
    { pubkey: campaign, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
    { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: Buffer.concat([disc('delegate_campaign'), bU64(Number(offerId))]) });
  await sendAndConfirmTransaction(base, new Transaction().add(delCampIx), [brand], opts);
  // The agent is the bridge's server-held session key. In the RELAYED seal path (sealPaletteRelay)
  // it is never funded — only the owner signs the seal's ER txs — so its base wallet arrives here
  // near-empty and the escrow top-up below dies with "insufficient lamports". Ensure it can cover
  // the top-up (+ the escrow's own rent the FIRST time this offer creates it, + a leftover margin
  // above the rent floor). topUpOwnerTo funds only the shortfall, so a reused, still-funded agent
  // costs nothing. The agent is deployer-funded infra by design (not "her" wallet), see the
  // sponsorship gate above.
  await topUpOwnerTo(agent.publicKey, 20_000_000 + ESCROW_RENT + TOPUP_MARGIN);
  // top up the agent's ER fee escrow, then the AGENT matches in-enclave (owner offline)
  await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(agent.publicKey, 255), agent.publicKey, agent.publicKey, 20_000_000, 255)), [agent], opts);
  const matchIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: agent.publicKey, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true },
    { pubkey: traitsPda, isSigner: false, isWritable: false }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
    { pubkey: campaign, isSigner: false, isWritable: true }], data: Buffer.concat([disc('match_query'), Buffer.from([target.tu, target.td, target.ts, target.tol]), offerSalt]) });
  const teeA = await freshTee(agent);
  await sendOnEr(teeA, [matchIx], [agent], agent);
  const pv = decodePalette((await teeA.getAccountInfo(palettePda)).data);
  const verdict = pv.last_verdict, nonce = pv.last_nonce, matched = verdict === 1;
  const undelCampIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: agent.publicKey, isSigner: true, isWritable: true }, { pubkey: campaign, isSigner: false, isWritable: true },
    { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }], data: disc('undelegate_campaign') });
  await sendOnEr(teeA, [undelCampIx], [agent], agent);
  for (let i = 0; i < 30; i++) { const inf = await base.getAccountInfo(campaign); if (inf && inf.owner.equals(PROGRAM)) break; await new Promise((r) => setTimeout(r, 2000)); }
  let settleSig = null;
  if (matched) {
    const settleIx = new TransactionInstruction({ programId: PROGRAM, keys: [
      { pubkey: brand.publicKey, isSigner: true, isWritable: false }, { pubkey: campaign, isSigner: false, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true }, { pubkey: herAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc('settle_offer'), Buffer.from(targetHash), Buffer.from([1]), Buffer.from(nonce)]) });
    settleSig = await sendAndConfirmTransaction(base, new Transaction().add(settleIx), [brand], opts);
  }
  return { matched, verdict, amount: matched ? payout : 0, herBalance: await usdc(owner.publicKey), campaign: campaign.toBase58(), createSig, settleSig, explorer: settleSig ? TX(settleSig) : EX(campaign.toBase58()), campaignExplorer: EX(campaign.toBase58()) };
}

// ---- MODEL B SEAL: her Palette + Traits, sealed private, and they STAY in the enclave ----
// Ports the flow proven in client/e2e/model-b-e2e.mjs. DEMO NOTE: the bridge holds her owner+agent
// keys; in production owner = her passkey / Seed Vault and set_traits is signed on her device.
export async function sealPalette({ traits = { undertone: 2, depth: 8, season: 3 }, encBlob, lifetimeCap = 0 } = {}) {
  const owner = Keypair.generate(), agent = Keypair.generate();
  const enc = encBlob && encBlob.length ? Buffer.from(encBlob) : randomBytes(96);
  const salt = randomBytes(32);
  const commitmentRoot = sha(salt, Buffer.from([traits.undertone, traits.depth, traits.season]));
  const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), owner.publicKey.toBuffer()], PROGRAM)[0];
  const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), owner.publicKey.toBuffer()], PROGRAM)[0];
  const permP = permissionPdaFromAccount(palettePda), permT = permissionPdaFromAccount(traitsPda);
  await fund(owner, 400_000_000); await fund(agent, 120_000_000);
  const initP = new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: Buffer.concat([disc('init_palette'), bBytes(enc), commitmentRoot]) });
  const initT = new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: disc('init_traits') });
  const initSig = await sendAndConfirmTransaction(base, new Transaction().add(initP).add(initT), [owner], opts);
  if (lifetimeCap > 0) { const nr = new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: true }], data: Buffer.concat([disc('set_night_rules'), bU64(0), Buffer.from([0]), bU32(0), Buffer.from([0]), bU32(lifetimeCap), bU32(0)]) }); await sendAndConfirmTransaction(base, new Transaction().add(nr), [owner], opts); }
  await sendAndConfirmTransaction(base, new Transaction()
    .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: palettePda, lamports: 10_000_000 }))
    .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: traitsPda, lamports: 10_000_000 })), [owner], opts);
  const delIx = (pda, name) => new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
    { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(pda, PROGRAM), isSigner: false, isWritable: true },
    { pubkey: delegationRecordPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: delegationMetadataPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
    { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: disc(name) });
  const delegateSig = await sendAndConfirmTransaction(base, new Transaction().add(delIx(palettePda, 'delegate_palette')), [owner], opts);
  await sendAndConfirmTransaction(base, new Transaction().add(delIx(traitsPda, 'delegate_traits')), [owner], opts);
  for (const kp of [owner, agent]) await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(kp.publicKey, 255), kp.publicKey, kp.publicKey, 40_000_000, 255)), [kp], opts);
  const privIx = (pda, perm, name) => new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: perm, isSigner: false, isWritable: true },
    { pubkey: EPHEMERAL_VAULT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: PERMISSION_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc(name), agent.publicKey.toBuffer(), Buffer.from([1])]) });
  const setTraitsIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: owner.publicKey, isSigner: true, isWritable: false }, { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: false }], data: Buffer.concat([disc('set_traits'), Buffer.from([traits.undertone, traits.depth, traits.season]), salt]) });
  const tee = await freshTee(owner);
  await sendOnEr(tee, [privIx(palettePda, permP, 'set_palette_privacy')], [owner], owner);
  await sendOnEr(tee, [privIx(traitsPda, permT, 'set_traits_privacy')], [owner], owner);
  const sealSig = await sendOnEr(tee, [setTraitsIx], [owner], owner);
  return { owner: [...owner.secretKey], agent: [...agent.secretKey], salt: [...salt], traits, her: owner.publicKey.toBase58(), palette: palettePda.toBase58(), initSig, delegateSig, sealSig, explorer: EX(palettePda.toBase58()) };
}

// ---- MODEL B SEAL, RELAYED: her owner key lives ONLY on her device ----
// Identical Model B seal to sealPalette, but the owner SECRET is never constructed here —
// every owner signature comes from `sign(msgBytes)` (her passkey-derived key, on-device).
// The agent stays a bounded, server-held session key by design. Proven headlessly by
// client/e2e/relay-seal-e2e.mjs (a local keypair stands in for the device); the browser passes
// `sign` from window.OiraCustody.
//
// SPONSORED FEE PAYER: the relay (deployer), not her, pays the network's per-signature fee.
// She still signs as the required authority over her own instructions (Anchor's owner/Signer
// checks don't change — this only changes who is billed the ~5000-lamport tx fee). `sponsor`
// defaults to the deployer and co-signs via partialSign after her signature is attached; the
// message bytes she signs already have the sponsor as feePayer (set before serializeMessage),
// so this is fully compatible with the existing WS sign() round trip — she is just never asked
// to hold SOL for it. NOTE: this only covers BASE-layer txs. sendOnErRelayed (below) deliberately
// keeps her as fee payer on the Ephemeral Rollup — the ER's fee escrow is keyed to whichever
// pubkey is the tx's fee payer (escrowPdaFromEscrowAuthority(ownerPk,...)), and there is no
// documented way to have a third party's escrow cover another pubkey's ER tx without risking the
// ER simply rejecting the tx outright. That fee is already paid for out of her own pre-funded
// escrow either way, so sponsoring it would not remove any idle balance — only real protocol risk.
async function sendRelayedBase(tx, ownerSigner, sponsor = deployer) {
  tx.feePayer = sponsor.publicKey;
  const { blockhash, lastValidBlockHeight } = await base.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  const sig = await ownerSigner.sign(tx.serializeMessage());
  tx.addSignature(ownerSigner.publicKey, Buffer.from(sig));
  tx.partialSign(sponsor);
  const txid = await base.sendRawTransaction(tx.serialize(), opts);
  await base.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');
  return txid;
}
async function sendOnErRelayed(tee, ixs, ownerSigner) {
  const tx = new Transaction().add(...ixs); tx.feePayer = ownerSigner.publicKey;
  const w = new Set([ownerSigner.publicKey.toBase58()]); for (const ix of tx.instructions) for (const k of ix.keys) if (k.isWritable) w.add(k.pubkey.toBase58());
  const r = await (await fetch(tee.rpcEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhashForAccounts', params: [[...w]] }) })).json();
  const bh = r.result.value; tx.recentBlockhash = bh.blockhash; tx.lastValidBlockHeight = bh.lastValidBlockHeight;
  const sig = await ownerSigner.sign(tx.serializeMessage());
  tx.addSignature(ownerSigner.publicKey, Buffer.from(sig));
  const txid = await tee.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const c = await tee.confirmTransaction({ signature: txid, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
  if (c.value?.err) throw new Error('ER tx failed ' + JSON.stringify(c.value.err));
  return txid;
}
async function freshTeeRelayed(ownerSigner) {
  const { token } = await getAuthToken(TEE_RPC, ownerSigner.publicKey, (m) => ownerSigner.sign(m));
  return new Connection(`${TEE_RPC}?token=${token}`, 'confirmed');
}

// Deterministic per-owner agent key (same construction as brandKeyFor below): the on-chain
// reader whitelisted by set_palette_privacy/set_traits_privacy is bound via a CREATE-only CPI
// (ephemeral-rollups-sdk's CreateEphemeralPermissionCpi — there is no "recreate with a new
// reader" affordance), so a re-seal MUST present the same agent as her first seal or the CPI
// dies with InvalidAccountData on the already-created permission account. A fresh random agent
// every call (the old behaviour) made every re-seal fail this way; deriving it from her owner
// pubkey instead makes it naturally stable across seals without persisting a secret anywhere.
function agentKeyFor(ownerPk) {
  const seed = sha(Buffer.from(deployer.secretKey.slice(0, 32)), Buffer.from('oira-agent-v1'), ownerPk.toBuffer()).slice(0, 32);
  return Keypair.fromSeed(Uint8Array.from(seed));
}

// She should never hold idle spendable SOL — only exactly what her OWN instructions are about
// to debit (Anchor's `payer = owner` on init_palette/init_traits, and the explicit
// `fromPubkey: ownerPk` transfers below draw straight from her wallet regardless of who pays the
// network tx fee — sponsoring the fee payer, above, does not touch these). Computed live off the
// real account sizes instead of a padded flat guess: PaletteVault (952B) + TraitsSession (76B)
// rent, the two 10M "rent-float" transfers into those PDAs, the two delegation record+metadata
// pairs (~96-100B each, one pair per delegated account), and her ER fee-escrow prepayment.
const RENT_FLOAT = 10_000_000; // per account (palette, traits) — pre-ER-delegation balance buffer
const ESCROW_TOPUP = 40_000_000; // her ER fee-escrow prepayment (spendable, not rent)
// createTopUpEscrowInstruction debits the payer for the requested `amount` PLUS the escrow
// account's own rent-exemption SEPARATELY when the escrow doesn't exist yet (confirmed live: a
// 40,000,000 topup on a fresh escrow actually costs 40,890,880 — verified by underfunding the
// agent by exactly this much on a real devnet run and watching it fail with "insufficient
// lamports 39114120, need 40000000"). Only matters the FIRST time each escrow is created.
const ESCROW_RENT = 890_880; // getMinimumBalanceForRentExemption(0) — a 0-data System account
// Solana requires every account a transaction TOUCHES to end at exactly 0 or >= its rent-exempt
// minimum — never a dust amount in between ("insufficient funds for rent"). A wallet is itself a
// 0-byte System account, so ANY leftover after a "top up to exactly what's about to be spent" is
// itself subject to that floor (890,880). Found live: funding the agent to the exact spend + a
// 10,000-lamport fee margin left it holding 5,000 lamports after the topup tx — a real devnet
// SendTransactionError, not a theoretical concern. Every margin below is sized above ESCROW_RENT
// so any leftover safely clears the floor; it is never left in the forbidden dust zone.
const TOPUP_MARGIN = 2_000_000;
const OWNER_MARGIN = TOPUP_MARGIN; // covers minor delegation-metadata size variance + rounding
// What the delegation program takes from her for one delegated account's record + metadata.
// NOT read from the RPC: devnet cut its rent rate in October 2026 (rent(0) 890,880 -> 650,240)
// and our program's accounts follow the new rate, but the delegation program still charged the
// old one (6,284,880 for both accounts against 4,592,320 from the RPC). The 1.69M gap ate the
// margin and the escrow top-up then failed on the rent floor. A fixed bound above the old rate
// holds under either.
const DELEGATION_RENT_PER_ACCOUNT = 3_200_000;
async function estimateOwnerFirstSealCost() {
  const [palette, traits] = await Promise.all([
    base.getMinimumBalanceForRentExemption(952), // PaletteVault::SPACE
    base.getMinimumBalanceForRentExemption(76),  // TraitsSession::SPACE
  ]);
  return palette + traits + RENT_FLOAT * 2 + DELEGATION_RENT_PER_ACCOUNT * 2 + ESCROW_TOPUP + ESCROW_RENT + OWNER_MARGIN;
}
// Top up ownerPk's BASE wallet to exactly `need` lamports — tops up only the shortfall against
// her CURRENT balance (never a flat lump), so a re-seal that needs a small top-up (e.g. to finish
// an interrupted delegation, or refill her ER escrow) funds only that, not another full amount.
async function topUpOwnerTo(ownerPk, need) {
  const bal = await base.getBalance(ownerPk);
  if (bal < need) await fund({ publicKey: ownerPk }, need - bal);
}
// SPONSORSHIP GATE. A passkey/device-key sign-in has NO other way to get SOL — her key was just
// derived on-device — so the app sponsors her exact shortfall (topUpOwnerTo, unchanged behaviour).
// A connected WALLET already has its own funds and its own faucet access, so the deployer never
// transfers into it: if her wallet can't cover what her own instructions are about to debit, fail
// LOUDLY with an amount + address she can act on, instead of either silently gifting her SOL or
// letting the tx die later with a cryptic "insufficient lamports" from the runtime.
const fmtSol = (l) => (l / 1e9).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
async function ensureOwnerFunds(ownerPk, need, selfFunded, beforeSponsor) {
  if (!selfFunded) {
    // Charge the sponsorship budget only when the deployer is really about to send SOL. A retry
    // that finds her wallet already holding enough costs nothing and is not counted.
    const bal = await base.getBalance(ownerPk);
    if (bal >= need) return;
    if (beforeSponsor) await beforeSponsor(need - bal);
    return fund({ publicKey: ownerPk }, need - bal);
  }
  const bal = await base.getBalance(ownerPk);
  if (bal < need) throw new Error(
    `Your connected wallet needs about ${fmtSol(need)} SOL (devnet) for this step, but it holds ${fmtSol(bal)}. ` +
    `Oira only sponsors device-key sign-ins — please add at least ${fmtSol(need - bal)} SOL to ${ownerPk.toBase58()} and try again.`);
}

export async function sealPaletteRelay({ ownerPubkey, traits = { undertone: 2, depth: 8, season: 3 }, encBlob, lifetimeCap = 0, salt: saltArg, sign, assurance, beforeSponsor } = {}) {
  if (!ownerPubkey || typeof sign !== 'function') throw new Error('sealPaletteRelay needs ownerPubkey + sign()');
  // 'wallet' = she signed in with her own external wallet => she funds herself (see the gate
  // above). Anything else ('passkey', 'fallback', or absent — the headless e2e harnesses and any
  // older client that doesn't send the field) keeps the sponsored device-key behaviour.
  const selfFunded = assurance === 'wallet';
  const ownerPk = new PublicKey(ownerPubkey);
  const ownerSigner = { publicKey: ownerPk, sign: async (m) => Uint8Array.from(await sign(m)) };
  const agent = agentKeyFor(ownerPk); // bounded server-derived session key (safe by design)
  const enc = encBlob && encBlob.length ? Buffer.from(encBlob) : randomBytes(96);
  // Her salt is device-derived (from her passkey) and passed in — the server never originates
  // it. Fall back to random only for the headless harnesses that don't supply one.
  const salt = saltArg && saltArg.length ? Buffer.from(saltArg) : randomBytes(32);
  const commitmentRoot = sha(salt, Buffer.from([traits.undertone, traits.depth, traits.season]));
  const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), ownerPk.toBuffer()], PROGRAM)[0];
  const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), ownerPk.toBuffer()], PROGRAM)[0];
  const permP = permissionPdaFromAccount(palettePda), permT = permissionPdaFromAccount(traitsPda);
  const delIx = (pda, name) => new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: ownerPk, isSigner: true, isWritable: true }, { pubkey: ownerPk, isSigner: false, isWritable: false },
    { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(pda, PROGRAM), isSigner: false, isWritable: true },
    { pubkey: delegationRecordPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: delegationMetadataPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
    { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: disc(name) });
  // Her PDAs are deterministic per owner, so a SECOND seal from the same device lands on the
  // SAME Palette account — re-running init_palette dies with "already in use" (0x0). Probe once:
  // init_palette+init_traits go in ONE atomic tx below, so palette existing ⇒ traits exists too.
  // On a re-seal both accounts normally already live delegated in the ER (nothing in the seal
  // flow undelegates them; traits NEVER undelegates by design), so the update is just the ER
  // tail: owner-signed set_traits, which the program re-binds against the original commitment
  // root (her salt is passkey-derived, so a same-device re-seal reproduces it).
  const paletteInfo = await base.getAccountInfo(palettePda);
  const traitsInfo = paletteInfo && await base.getAccountInfo(traitsPda);
  let initSig = null, delegateSig = null;
  if (!paletteInfo) {
    // Fund her wallet with EXACTLY what her own instructions below are about to debit (rent for
    // the two PDAs, the rent-float, her delegation record/metadata pairs, her ER escrow) — not a
    // padded flat guess. The tx-fee sponsorship in sendRelayedBase means she doesn't need slack
    // for network fees either; the only real requirement left is the money her Signer role
    // literally transfers (Anchor's payer=owner, and the explicit fromPubkey:ownerPk transfers).
    await ensureOwnerFunds(ownerPk, await estimateOwnerFirstSealCost(), selfFunded, beforeSponsor);
    const initP = new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: ownerPk, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: Buffer.concat([disc('init_palette'), bBytes(enc), commitmentRoot]) });
    const initT = new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: ownerPk, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: disc('init_traits') });
    initSig = await sendRelayedBase(new Transaction().add(initP).add(initT), ownerSigner);
    if (lifetimeCap > 0) { const nr = new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: ownerPk, isSigner: true, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: true }], data: Buffer.concat([disc('set_night_rules'), bU64(0), Buffer.from([0]), bU32(0), Buffer.from([0]), bU32(lifetimeCap), bU32(0)]) }); await sendRelayedBase(new Transaction().add(nr), ownerSigner); }
    await sendRelayedBase(new Transaction()
      .add(SystemProgram.transfer({ fromPubkey: ownerPk, toPubkey: palettePda, lamports: RENT_FLOAT }))
      .add(SystemProgram.transfer({ fromPubkey: ownerPk, toPubkey: traitsPda, lamports: RENT_FLOAT })), ownerSigner);
    delegateSig = await sendRelayedBase(new Transaction().add(delIx(palettePda, 'delegate_palette')), ownerSigner);
    await sendRelayedBase(new Transaction().add(delIx(traitsPda, 'delegate_traits')), ownerSigner);
    await sendRelayedBase(new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(ownerPk, 255), ownerPk, ownerPk, ESCROW_TOPUP, 255)), ownerSigner);
  } else {
    // RE-SEAL. Delegation ran as two separate txs on the first seal, so a seal interrupted
    // mid-flow can leave either account still program-owned on base — finish delegating just
    // that one (its rent-float transfer included; already-delegated accounts keep theirs). Both
    // this and the escrow refill below top her up ONLY the exact shortfall for the step that is
    // actually about to run — the steady-state re-seal (nothing incomplete, escrow still funded)
    // spends nothing from her wallet and funds her nothing at all.
    for (const [pda, info, name] of [[palettePda, paletteInfo, 'delegate_palette'], [traitsPda, traitsInfo, 'delegate_traits']]) {
      if (info && info.owner.equals(PROGRAM)) {
        await ensureOwnerFunds(ownerPk, RENT_FLOAT + DELEGATION_RENT_PER_ACCOUNT + TOPUP_MARGIN, selfFunded, beforeSponsor);
        await sendRelayedBase(new Transaction()
          .add(SystemProgram.transfer({ fromPubkey: ownerPk, toPubkey: pda, lamports: RENT_FLOAT }))
          .add(delIx(pda, name)), ownerSigner);
      }
    }
    // her ER fee escrow was topped on the first seal; refill only if it ran dry
    if ((await base.getBalance(escrowPdaFromEscrowAuthority(ownerPk, 255))) < 20_000_000) {
      // her escrow already exists by this point in every real case, so this is really just
      // ESCROW_TOPUP + fee — but fund for a from-scratch creation too so a wiped-clean edge case
      // (e.g. a test harness resetting only the escrow) never underfunds like the agent bug above.
      await ensureOwnerFunds(ownerPk, ESCROW_TOPUP + ESCROW_RENT + TOPUP_MARGIN, selfFunded, beforeSponsor);
      await sendRelayedBase(new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(ownerPk, 255), ownerPk, ownerPk, ESCROW_TOPUP, 255)), ownerSigner);
    }
  }
  // AGENT: guarded exactly like her escrow above — fund + top up ONLY when its own ER fee escrow
  // is actually low. First seal included: the escrow starts at zero there, so this guard fires
  // naturally without a separate first-seal-only code path. Previously this ran UNCONDITIONALLY
  // on every single seal AND re-seal (fund(agent, 120_000_000) plus a 40,000,000 escrow top-up,
  // every call, no check) — measured over this debugging session's repeated re-seals, the escrow
  // balance kept accumulating far faster than anything ever drew it down (four straight top-ups
  // left it sitting at ~4x a single top-up's worth). The agent's wallet has no other spend in this
  // flow — the one topup tx below is the only thing it ever signs — so it needs no standing balance.
  const agentEscrow = escrowPdaFromEscrowAuthority(agent.publicKey, 255);
  if ((await base.getBalance(agentEscrow)) < 20_000_000) {
    // First creation of this escrow costs amount + its own rent (see ESCROW_RENT above); a later
    // refill (escrow already exists, just below the threshold) only costs the amount + fee — fund
    // for the worst case (fresh creation) so this never underfunds, the harmless case being a few
    // hundred thousand idle lamports on the rare refill-not-create path.
    await fund(agent, ESCROW_TOPUP + ESCROW_RENT + TOPUP_MARGIN);
    await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(agentEscrow, agent.publicKey, agent.publicKey, ESCROW_TOPUP, 255)), [agent], opts);
  }
  const privIx = (pda, perm, name) => new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: ownerPk, isSigner: true, isWritable: true }, { pubkey: ownerPk, isSigner: false, isWritable: false },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: perm, isSigner: false, isWritable: true },
    { pubkey: EPHEMERAL_VAULT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: PERMISSION_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc(name), agent.publicKey.toBuffer(), Buffer.from([1])]) });
  const setTraitsIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: ownerPk, isSigner: true, isWritable: false }, { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: false }], data: Buffer.concat([disc('set_traits'), Buffer.from([traits.undertone, traits.depth, traits.season]), salt]) });
  const tee = await freshTeeRelayed(ownerSigner);
  // The privacy instructions are CREATE-OR-UPDATE in the program now: her first seal creates
  // the permission group, and any later seal updates it (re-pointing the sole reader at the
  // current deterministic agent). That update path is also the REPAIR path for palettes sealed
  // before the deterministic-agent fix, whose group was bound to a lost random per-call agent.
  //
  // The probe below is only a fast-path: when the ER's live palette already shows our agent as
  // the bound reader, the two privacy txs are pure no-ops and can be skipped. It reads via the
  // AGENT's ER session because a private account can only be read back by a whitelisted member
  // — the owner's own tee connection above is for SENDING owner-signed txs and is correctly
  // refused a read, same as any other non-member. On a legacy palette (old random agent) this
  // read is refused too, which is FINE now: we fall through and the update CPI rebinds it.
  // The probe must never fail the seal — any error just means "run the privacy txs".
  let alreadyPrivate = false;
  if (paletteInfo) {
    try {
      const agentTee = await freshTee(agent);
      const live = await agentTee.getAccountInfo(palettePda);
      if (live) { const p = decodePalette(live.data); alreadyPrivate = p.is_private && p.agent.equals(agent.publicKey); }
    } catch (e) { console.warn('oira: alreadyPrivate probe failed (continuing with privacy txs):', e.message); }
  }
  if (!alreadyPrivate) {
    try {
      await sendOnErRelayed(tee, [privIx(palettePda, permP, 'set_palette_privacy')], ownerSigner);
      await sendOnErRelayed(tee, [privIx(traitsPda, permT, 'set_traits_privacy')], ownerSigner);
    } catch (e) {
      // Belt-and-suspenders for a RE-seal racing an ER that still runs the pre-update program:
      // InvalidAccountData from these two instructions has exactly one meaning — the permission
      // group already exists (the create CPI hit an existing account), i.e. the account is
      // already private from her first seal. Sealing must not die on that; the palette is in
      // the state the instruction was trying to reach. Anything else, and any failure on a
      // FIRST seal, is a real error and still propagates.
      if (!(paletteInfo && /InvalidAccountData/.test(String(e && e.message)))) throw e;
      console.warn('oira: privacy already set on-chain (create-only wall) — continuing re-seal');
    }
  }
  const sealSig = await sendOnErRelayed(tee, [setTraitsIx], ownerSigner);
  return { agent: [...agent.secretKey], salt: [...salt], traits, her: ownerPk.toBase58(), palette: palettePda.toBase58(), initSig, delegateSig, sealSig, explorer: EX(palettePda.toBase58()) };
}

// ---- PRIVATE PAYOUT: a brand privately pays `her` USDC inside the enclave ----
export async function privatePayout(herSecret, amountUi = 5) {
  const her = Keypair.fromSecretKey(Uint8Array.from(herSecret));
  const brand = Keypair.generate();
  const amt = BigInt(amountUi * 1e6);
  const [vault] = deriveVault(MINT); const vaultAta = getAssociatedTokenAddressSync(MINT, vault, true, TOKEN_PROGRAM_ID);
  const [brandEata] = deriveEphemeralAta(brand.publicKey, MINT); const [herEata] = deriveEphemeralAta(her.publicKey, MINT);
  const brandAta = getAssociatedTokenAddressSync(MINT, brand.publicKey); const herAta = getAssociatedTokenAddressSync(MINT, her.publicKey, true);
  await sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: brand.publicKey, lamports: 200_000_000 })).add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: her.publicKey, lamports: 60_000_000 })), [deployer], opts);
  await sendAndConfirmTransaction(base, new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brand.publicKey, MINT)).add(createMintToInstruction(MINT, brandAta, deployer.publicKey, 100_000_000)), [deployer], opts);
  const setup = new Transaction();
  if (!(await base.getAccountInfo(vaultAta))) setup.add(initVaultIx(vault, MINT, brand.publicKey), initVaultAtaIx(brand.publicKey, vaultAta, vault, MINT));
  setup.add(createAssociatedTokenAccountIdempotentInstruction(brand.publicKey, herAta, her.publicKey, MINT));
  if (!(await base.getAccountInfo(herEata))) setup.add(initEphemeralAtaIx(herEata, her.publicKey, MINT, brand.publicKey), createEataPermissionIx(herEata, brand.publicKey));
  if (!(await base.getAccountInfo(brandEata))) setup.add(initEphemeralAtaIx(brandEata, brand.publicKey, MINT, brand.publicKey), createEataPermissionIx(brandEata, brand.publicKey));
  setup.add(transferToVaultIx(brandEata, vault, MINT, brandAta, vaultAta, brand.publicKey, amt));
  await sendAndConfirmTransaction(base, setup, [brand], opts);
  await sendAndConfirmTransaction(base, new Transaction().add(delegateEphemeralAtaIx(brand.publicKey, brandEata, TEE_VALIDATOR), delegateEataPermissionIx(brand.publicKey, brandEata, TEE_VALIDATOR), delegateEphemeralAtaIx(brand.publicKey, herEata, TEE_VALIDATOR), delegateEataPermissionIx(brand.publicKey, herEata, TEE_VALIDATOR)), [brand], opts);
  for (const kp of [brand, her]) await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(kp.publicKey, 255), kp.publicKey, kp.publicKey, 30_000_000, 255)), [kp], opts);
  const t1 = await freshTee(brand); const transferSig = await sendOnEr(t1, [createTransferCheckedInstruction(brandAta, MINT, herAta, brand.publicKey, amt, 6)], [brand], brand);
  const t2 = await freshTee(her); await sendOnEr(t2, [eataUndelegateIx(her.publicKey, MINT)], [her], her);
  await new Promise((r) => setTimeout(r, 7000));
  await sendAndConfirmTransaction(base, new Transaction().add(withdrawSplIx(her.publicKey, MINT, amt)), [her], opts);
  await new Promise((r) => setTimeout(r, 2500));
  return { amount: amountUi, herBalance: await usdc(her.publicKey), transferSig, explorer: TX(transferSig) };
}

// ═══════════ MARKETPLACE: post a campaign now, match it later ═══════════
// runOffer does the whole loop atomically for the one-shot demo. The marketplace splits it:
// a brand POSTS a campaign (create + delegate, escrow funded) that persists, and her overnight
// MATCHES posted campaigns when she is offline. Same proven instructions, decoupled in time.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Deterministic per-campaign brand key from the offerId, so we never store a secret: the same
// key is regenerated at settle time. (Demo custody — real brands sign with their own wallet.)
function brandKeyFor(offerId) {
  const seed = sha(Buffer.from(deployer.secretKey.slice(0, 32)), Buffer.from('oira-brand-v1'), bU64(Number(offerId))).slice(0, 32);
  return Keypair.fromSeed(Uint8Array.from(seed));
}

// Campaign account layout (after 8-byte disc): brand32 mint32 offer_id8 category1 per_query8
// per_accept8 target_hash32 escrowed8 spent8 paid8 queries4 accepts4 active1 bump1 answered1 …
function decodeCampaign(b) {
  return {
    perAccept: Number(b.readBigUInt64LE(89)) / 1e6,
    escrowed: Number(b.readBigUInt64LE(129)) / 1e6,
    spent: Number(b.readBigUInt64LE(137)) / 1e6,
    paid: Number(b.readBigUInt64LE(145)) / 1e6,
    queries: b.readUInt32LE(153),
    accepts: b.readUInt32LE(157),
    active: b.readUInt8(161) === 1,
    answered: b.readUInt8(163) === 1,
  };
}

// A brand posts a campaign: commit a target shade + escrow, delegate into the ER for matching.
// Returns everything her overnight needs later (offerSalt + target are the opening of the commitment).
export async function postCampaign({ target, payout = 5, category = 0, label = 'Brand', perQuery = 0.1, brandSeed } = {}) {
  if (!target || ![target.tu, target.td, target.ts, target.tol].every(Number.isInteger)) throw new Error('postCampaign needs target {tu,td,ts,tol}');
  const offerId = BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6));
  const oidLe = Buffer.alloc(8); oidLe.writeBigUInt64LE(offerId, 0);
  /* One key per brand when a seed is given, so her per-brand limit counts the brand and not
     each separate question. Without one, a fresh key per campaign as before. */
  const brand = brandKeyFor(brandSeed ?? offerId);
  const [campaign] = PublicKey.findProgramAddressSync([Buffer.from('campaign'), brand.publicKey.toBuffer(), oidLe], PROGRAM);
  const [escrow] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), campaign.toBuffer()], PROGRAM);
  const brandAta = getAssociatedTokenAddressSync(MINT, brand.publicKey);
  const offerSalt = randomBytes(16);
  const targetHash = sha(offerSalt, Buffer.from([target.tu, target.td, target.ts, target.tol]));
  const perAccept = BigInt(Math.round(payout * 1e6)), perQueryU = BigInt(Math.round(perQuery * 1e6)), escrowAmt = perAccept + 15_000_000n;
  await topUpOwnerTo(brand.publicKey, 120_000_000);
  await sendAndConfirmTransaction(base, new Transaction()
    .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brand.publicKey, MINT))
    .add(createMintToInstruction(MINT, brandAta, deployer.publicKey, Number(escrowAmt))), [deployer], opts);
  const createIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: MINT, isSigner: false, isWritable: false },
    { pubkey: campaign, isSigner: false, isWritable: true }, { pubkey: escrow, isSigner: false, isWritable: true },
    { pubkey: brandAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: RENT, isSigner: false, isWritable: false }],
    data: Buffer.concat([disc('create_campaign'), bU64(Number(offerId)), Buffer.from([category]), bU64(Number(perQueryU)), bU64(Number(perAccept)), Buffer.from(targetHash), bU64(Number(escrowAmt))]) });
  const createSig = await sendAndConfirmTransaction(base, new Transaction().add(createIx), [brand], opts);
  const delCampIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: brand.publicKey, isSigner: false, isWritable: false },
    { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(campaign, PROGRAM), isSigner: false, isWritable: true },
    { pubkey: delegationRecordPdaFromDelegatedAccount(campaign), isSigner: false, isWritable: true },
    { pubkey: delegationMetadataPdaFromDelegatedAccount(campaign), isSigner: false, isWritable: true },
    { pubkey: campaign, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
    { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: Buffer.concat([disc('delegate_campaign'), bU64(Number(offerId))]) });
  await sendAndConfirmTransaction(base, new Transaction().add(delCampIx), [brand], opts);
  return { brandSeed: brandSeed ?? null, campaign: campaign.toBase58(), offerId: offerId.toString(), brand: brand.publicKey.toBase58(), target, offerSalt: [...offerSalt], payout, perQuery, category, label, escrowUi: Number(escrowAmt) / 1e6, createSig, explorer: EX(campaign.toBase58()) };
}

// Live status of a posted campaign, read from the public base layer (nothing about WHO matched).
export async function campaignStatus(campaignPk) {
  const info = await base.getAccountInfo(new PublicKey(campaignPk));
  if (!info) return { exists: false };
  if (!info.owner.equals(PROGRAM)) return { exists: true, phase: 'matching' }; // delegated in the ER right now
  return { exists: true, phase: 'settled', ...decodeCampaign(info.data) };
}

// Her overnight matches a posted campaign in-enclave and, only on a real match, settles her payout.
// Her palette/traits stay sealed in the ER (only the campaign undelegates for settle). Self-seals a
// matching palette if she has not sealed on this bridge, so the brand board always resolves in a demo.
export async function matchCampaign({ campaignRec, ownerPubkey, agentSecret, traits } = {}) {
  const rec = campaignRec; if (!rec || !rec.offerId || !rec.offerSalt || !rec.target) throw new Error('matchCampaign needs a stored campaign record');
  const target = rec.target;
  if (ownerPubkey && !agentSecret) agentSecret = [...agentKeyFor(new PublicKey(ownerPubkey)).secretKey];
  if (!ownerPubkey) { assertSelfSealAllowed('matchCampaign'); const s = await sealPalette({ traits: { undertone: target.tu, depth: target.td, season: target.ts } }); ownerPubkey = s.her; agentSecret = s.agent; traits = s.traits; }
  const offerId = BigInt(rec.offerId);
  const ownerPk = new PublicKey(ownerPubkey);
  const agent = Keypair.fromSecretKey(Uint8Array.from(agentSecret));
  const campaign = new PublicKey(rec.campaign);
  const [escrow] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), campaign.toBuffer()], PROGRAM);
  const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), ownerPk.toBuffer()], PROGRAM)[0];
  const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), ownerPk.toBuffer()], PROGRAM)[0];
  const herAta = getAssociatedTokenAddressSync(MINT, ownerPk, true);
  const brand = brandKeyFor(rec.brandSeed ?? offerId);
  const offerSalt = Buffer.from(rec.offerSalt);
  const targetHash = sha(offerSalt, Buffer.from([target.tu, target.td, target.ts, target.tol]));
  /* The agent's ER fee escrow. The relayed seal already prepays it (ESCROW_TOPUP) and leaves
     the agent's own wallet nearly empty, so an unconditional top-up here, paid by the agent,
     failed with "insufficient lamports" on every match after a real phone seal (found in the
     2026-10-06 dry run; the older self-seal path had funded the agent generously, which hid
     it). Same rule as the seal: only when the escrow is low, and the deployer funds the agent
     first. */
  const agentEscrow = escrowPdaFromEscrowAuthority(agent.publicKey, 255);
  if ((await base.getBalance(agentEscrow)) < 20_000_000) {
    await fund(agent, ESCROW_TOPUP + ESCROW_RENT + TOPUP_MARGIN);
    await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(agentEscrow, agent.publicKey, agent.publicKey, ESCROW_TOPUP, 255)), [agent], opts);
  }
  // her payout ATA must exist for settle_offer to land (self-seal path never created one)
  await sendAndConfirmTransaction(base, new Transaction().add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, herAta, ownerPk, MINT)), [deployer], opts);
  const matchIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: agent.publicKey, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true },
    { pubkey: traitsPda, isSigner: false, isWritable: false }, { pubkey: ownerPk, isSigner: false, isWritable: false },
    { pubkey: campaign, isSigner: false, isWritable: true }], data: Buffer.concat([disc('match_query'), Buffer.from([target.tu, target.td, target.ts, target.tol]), offerSalt]) });
  const teeA = await freshTee(agent);
  await sendOnEr(teeA, [matchIx], [agent], agent);
  const pv = decodePalette((await teeA.getAccountInfo(palettePda)).data);
  const matched = pv.last_verdict === 1, nonce = pv.last_nonce;
  const undelCampIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: agent.publicKey, isSigner: true, isWritable: true }, { pubkey: campaign, isSigner: false, isWritable: true },
    { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }], data: disc('undelegate_campaign') });
  await sendOnEr(teeA, [undelCampIx], [agent], agent);
  for (let i = 0; i < 30; i++) { const inf = await base.getAccountInfo(campaign); if (inf && inf.owner.equals(PROGRAM)) break; await sleep(2000); }
  let settleSig = null;
  if (matched) {
    const settleIx = new TransactionInstruction({ programId: PROGRAM, keys: [
      { pubkey: brand.publicKey, isSigner: true, isWritable: false }, { pubkey: campaign, isSigner: false, isWritable: true },
      { pubkey: escrow, isSigner: false, isWritable: true }, { pubkey: herAta, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc('settle_offer'), Buffer.from(targetHash), Buffer.from([1]), Buffer.from(nonce)]) });
    settleSig = await sendAndConfirmTransaction(base, new Transaction().add(settleIx), [brand], opts);
  }
  return { matched, amount: matched ? rec.payout : 0, campaign: rec.campaign, herBalance: await usdc(ownerPk), settleSig, explorer: settleSig ? TX(settleSig) : EX(campaign.toBase58()) };
}

// ---- ONE BRAND QUESTION TO ONE WOMAN, as her agent ----
// The server holds only her palette address and derives her agent key, which is the one key the
// program lets ask her. Her own rules are read from her palette first, so a question she would
// refuse costs nothing. Anything the program refuses on her limits is recorded as turned away.
const RULE_REFUSALS = { 6008: 'Her limit for this week is used up.', 6009: 'She has answered as many questions as she allows.', 6010: 'This brand has asked her as many times as she allows.' };
export function brandSeedFor(label) { return Number(sha(Buffer.from('oira-brand-label-v1'), Buffer.from(String(label).toLowerCase().trim())).readUIntBE(0, 6)); }
export async function askHer({ brief, ownerPubkey }) {
  const ownerPk = new PublicKey(ownerPubkey);
  const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), ownerPk.toBuffer()], PROGRAM)[0];
  const onBase = await base.getAccountInfo(palettePda);
  if (!onBase || !onBase.owner.equals(DELEGATION_PROGRAM_ID)) return { outcome: 'unavailable' };
  const agent = agentKeyFor(ownerPk);
  const tee = await freshTee(agent);
  const live = await tee.getAccountInfo(palettePda);
  if (!live) return { outcome: 'unavailable' };
  const p = decodePalette(live.data);
  if (!p.agent.equals(agent.publicKey)) return { outcome: 'unavailable' };
  const payoutMicro = BigInt(Math.round(brief.payout * 1e6));
  if (p.rules_active && p.min_payout > 0n && payoutMicro < p.min_payout) return { outcome: 'declined', reason: 'Under her minimum.' };
  if (p.rules_active && (p.blocked_cats & (1 << brief.category))) return { outcome: 'declined', reason: 'She does not take questions in this category.' };
  const rec = await postCampaign({ target: brief.target, payout: brief.payout, category: brief.category, label: brief.label, brandSeed: brief.brandSeed });
  try {
    const r = await matchCampaign({ campaignRec: rec, ownerPubkey, agentSecret: [...agent.secretKey] });
    return { outcome: r.matched ? 'yes' : 'no', amount: r.amount, campaign: rec.campaign, settleSig: r.settleSig || null, explorer: r.explorer };
  } catch (e) {
    const code = Number((String(e.message || e).match(/Custom"?:\s*(\d+)/) || [])[1]);
    if (RULE_REFUSALS[code]) return { outcome: 'declined', reason: RULE_REFUSALS[code], campaign: rec.campaign };
    throw e;
  }
}

// ---- HER RULES, WRITTEN TO HER PALETTE ----
// The rules she sets in the app (her minimum and how often one brand may ask) only count once
// they are on her palette, where her agent and the program read them. Her own key signs, on her
// phone; the server builds the transaction and never holds the key.
export async function setRulesRelay({ ownerPubkey, minPayout, maxPerBrand, sign }) {
  if (!ownerPubkey || typeof sign !== 'function') throw new Error('setRulesRelay needs ownerPubkey + sign()');
  const ownerPk = new PublicKey(ownerPubkey);
  const ownerSigner = { publicKey: ownerPk, sign: async (m) => Uint8Array.from(await sign(m)) };
  const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), ownerPk.toBuffer()], PROGRAM)[0];
  const onBase = await base.getAccountInfo(palettePda);
  if (!onBase || !onBase.owner.equals(DELEGATION_PROGRAM_ID)) throw new Error('Your Palette is not sealed yet.');
  const minMicro = BigInt(Math.max(0, Math.round(Number(minPayout) * 1e6)));
  const perBrand = Math.max(0, Math.min(255, Math.floor(Number(maxPerBrand) || 0)));
  const u64 = Buffer.alloc(8); u64.writeBigUInt64LE(minMicro);
  const ix = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: ownerPk, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true }],
    data: Buffer.concat([disc('set_night_rules'), u64, Buffer.from([perBrand]), Buffer.alloc(4), Buffer.from([1]), Buffer.alloc(4), Buffer.alloc(4)]) });
  const tee = await freshTeeRelayed(ownerSigner);
  await sendOnErRelayed(tee, [ix], ownerSigner);
  return { minPayout: Number(minMicro) / 1e6, maxPerBrand: perBrand };
}
