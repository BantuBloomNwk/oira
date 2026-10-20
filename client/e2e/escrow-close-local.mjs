// Escrow close-before-settle, on a local validator.
//
// A brand used to be able to close a campaign after her match and take the payout back, because
// settle_offer needed the brand's signature and close_campaign never looked at the match. This test
// loads the freshly built program into solana-test-validator next to campaigns in every state that
// matters (fresh match, old match, no-match, unanswered) and checks:
//   - close is refused while a fresh match is unpaid
//   - anyone holding her nonce can settle, with no brand signature, and only her wallet is paid
//   - a wrong wallet or a swapped brand account is refused
//   - once she's paid, or the claim window has passed, or there was no match, close works
//
// No devnet, no ER: the answered campaign state is written straight into the accounts, because
// close and settle only ever run on base.
//
//   node e2e/escrow-close-local.mjs            (needs program/target/deploy/oira_palette.so)

import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, AccountLayout, MintLayout, ACCOUNT_SIZE, MINT_SIZE } from '@solana/spl-token';
import { createHash, randomBytes } from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const TREASURY = new PublicKey('6wWrCWZ3y9UveFG1t5GzupJ1qkWn5r4QPWg8EmELA8Xz');
const SO = process.env.OIRA_SO || new URL('../../program/target/deploy/oira_palette.so', import.meta.url).pathname;
const WINDOW = 7 * 86_400;
const RPC_PORT = 18899;

const sha = (...p) => createHash('sha256').update(Buffer.concat(p.map((x) => Buffer.from(x)))).digest();
const disc = (n) => sha(`global:${n}`).subarray(0, 8);
const accDisc = (n) => sha(`account:${n}`).subarray(0, 8);
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const i64 = (n) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(n)); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };

let pass = 0, fail = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); ok ? pass++ : fail++; };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oira-escrow-'));
const preload = [];
function account(pubkey, owner, data, lamports = 10 * LAMPORTS_PER_SOL / 100) {
  const f = path.join(dir, `${pubkey.toBase58()}.json`);
  fs.writeFileSync(f, JSON.stringify({ pubkey: pubkey.toBase58(), account: {
    lamports, data: [Buffer.from(data).toString('base64'), 'base64'], owner: owner.toBase58(), executable: false, rentEpoch: 0, space: data.length } }));
  preload.push('--account', pubkey.toBase58(), f);
}
function tokenAccount(pubkey, mint, owner, amount) {
  const d = Buffer.alloc(ACCOUNT_SIZE);
  AccountLayout.encode({ mint, owner, amount: BigInt(amount), delegateOption: 0, delegate: PublicKey.default, state: 1,
    isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: PublicKey.default }, d);
  account(pubkey, TOKEN_PROGRAM_ID, d);
}

// ---- the cast ----
const brand = Keypair.generate();
const her = Keypair.generate();
const stranger = Keypair.generate();
const mint = Keypair.generate().publicKey;
{
  const d = Buffer.alloc(MINT_SIZE);
  MintLayout.encode({ mintAuthorityOption: 1, mintAuthority: brand.publicKey, supply: 10n ** 12n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: PublicKey.default }, d);
  account(mint, TOKEN_PROGRAM_ID, d);
}
const herToken = Keypair.generate().publicKey; tokenAccount(herToken, mint, her.publicKey, 0);
const strangerToken = Keypair.generate().publicKey; tokenAccount(strangerToken, mint, stranger.publicKey, 0);
const brandToken = Keypair.generate().publicKey; tokenAccount(brandToken, mint, brand.publicKey, 0);
const treasuryToken = Keypair.generate().publicKey; tokenAccount(treasuryToken, mint, TREASURY, 0);

// The protocol config, as init_config leaves it: this test's mint accepted, spent stakes to TREASURY.
const [configPda, configBump] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM);
account(configPda, PROGRAM, Buffer.concat([accDisc('Config'), Keypair.generate().publicKey.toBuffer(), TREASURY.toBuffer(),
  mint.toBuffer(), Buffer.alloc(32 * 3), Buffer.from([1, configBump])]));

const ESCROWED = 10_000, SPENT = 100, PAYOUT = 2_000;
const now = Math.floor(Date.now() / 1000);

// Campaign layout after the discriminator, see `pub struct Campaign` in program/src/lib.rs.
function campaign(offerId, { answered, matched, answeredAt }) {
  const [pda, bump] = PublicKey.findProgramAddressSync([Buffer.from('campaign'), brand.publicKey.toBuffer(), u64(offerId)], PROGRAM);
  const [escrow] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), pda.toBuffer()], PROGRAM);
  const target = sha(randomBytes(32));
  const nonce = randomBytes(16);
  const verdict = matched ? 1 : 0;
  const receipt = answered ? sha(target, [verdict], nonce).subarray(0, 24) : Buffer.alloc(24);
  const payee = answered && matched ? sha(her.publicKey.toBuffer(), nonce) : Buffer.alloc(32);
  const data = Buffer.concat([
    accDisc('Campaign'), brand.publicKey.toBuffer(), mint.toBuffer(), u64(offerId), Buffer.from([1]),
    u64(SPENT), u64(PAYOUT), target, u64(ESCROWED), u64(answered ? SPENT : 0), u64(0),
    u32(answered ? 1 : 0), u32(0), Buffer.from([1, bump, answered ? 1 : 0]), receipt, i64(answered ? answeredAt : 0), payee,
  ]);
  if (data.length !== 228) throw new Error(`campaign is ${data.length} bytes, expected 228`);
  account(pda, PROGRAM, data);
  tokenAccount(escrow, mint, pda, ESCROWED);
  return { pda, escrow, target, nonce };
}

const fresh = campaign(1, { answered: true, matched: true, answeredAt: now });
const stale = campaign(2, { answered: true, matched: true, answeredAt: now - WINDOW - 60 });
const noMatch = campaign(3, { answered: true, matched: false, answeredAt: now });
const unanswered = campaign(4, { answered: false });
const forged = campaign(5, { answered: true, matched: true, answeredAt: now });

const settleIx = (c, { brandKey = brand.publicKey, to = herToken, nonce = c.nonce } = {}) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brandKey, isSigner: false, isWritable: false }, { pubkey: c.pda, isSigner: false, isWritable: true },
  { pubkey: c.escrow, isSigner: false, isWritable: true }, { pubkey: to, isSigner: false, isWritable: true },
  { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }],
  data: Buffer.concat([disc('settle_offer'), c.target, Buffer.from([1]), nonce]) });
const closeIx = (c) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: c.pda, isSigner: false, isWritable: true },
  { pubkey: c.escrow, isSigner: false, isWritable: true }, { pubkey: brandToken, isSigner: false, isWritable: true },
  { pubkey: treasuryToken, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  { pubkey: configPda, isSigner: false, isWritable: false }],
  data: disc('close_campaign') });

// ---- validator ----
const ledger = path.join(dir, 'ledger');
const v = spawn('solana-test-validator', ['--reset', '--quiet', '--ledger', ledger, '--rpc-port', String(RPC_PORT),
  '--faucet-port', String(RPC_PORT + 2), '--bpf-program', PROGRAM.toBase58(), SO, ...preload], { stdio: 'ignore', detached: true });
const stop = () => { try { process.kill(-v.pid, 'SIGTERM'); } catch {} };
process.on('exit', stop);

const conn = new Connection(`http://127.0.0.1:${RPC_PORT}`, 'confirmed');
for (let i = 0; ; i++) {
  try { await conn.getLatestBlockhash(); break; } catch { if (i > 120) throw new Error('validator never came up'); await new Promise((r) => setTimeout(r, 500)); }
}
for (const k of [brand, stranger]) await conn.confirmTransaction(await conn.requestAirdrop(k.publicKey, LAMPORTS_PER_SOL), 'confirmed');

// A unique compute limit and a freshly fetched blockhash per transaction, so a retried instruction
// is never a byte-identical replay and nothing waits on web3.js's blockhash cache.
let nth = 0;
async function send(ix, signer) {
  const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 + ++nth })).add(ix);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash; tx.feePayer = signer.publicKey; tx.sign(signer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  const r = await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  if (r.value.err) throw new Error(JSON.stringify(r.value.err));
  return sig;
}
async function refused(label, ix, signer, want) {
  try { await send(ix, signer); check(label, false); }
  catch (e) { const logs = (e.logs || e.transactionLogs || []).join('\n') + String(e.message); check(label, want ? logs.includes(want) : true); if (want && !logs.includes(want)) console.log(logs.slice(-600)); }
}
const bal = async (a) => Number((await conn.getTokenAccountBalance(a)).value.amount);
const gone = async (a) => (await conn.getAccountInfo(a)) === null;

console.log('\nA match she has not been paid for:');
await refused('brand cannot close while her fresh match is unpaid', closeIx(fresh), brand, 'MatchAwaitingSettlement');
await refused('settling to a wallet her enclave did not commit to is refused', settleIx(fresh, { to: strangerToken }), stranger, 'PayeeMismatch');
await refused('swapping in a different brand account is refused', settleIx(fresh, { brandKey: stranger.publicKey }), stranger, 'ConstraintSeeds');
await refused('a guessed nonce does not settle', settleIx(forged, { nonce: randomBytes(16) }), stranger, 'ReceiptMismatch');
await send(settleIx(fresh), stranger);
check('a stranger holding her nonce settles it, with no brand signature', true);
check(`she received the payout (${PAYOUT})`, (await bal(herToken)) === PAYOUT);
await refused('the same match cannot be settled twice', settleIx(fresh), stranger, 'AlreadySettled');
await send(closeIx(fresh), brand);
check('once she is paid, the brand can close', await gone(fresh.pda));

console.log('\nWhen there is nothing to protect:');
const before = await bal(brandToken);
await send(closeIx(stale), brand);
check('after the 7-day claim window, the brand can close an unclaimed match', await gone(stale.pda));
check('and gets back everything but the spent query stakes', (await bal(brandToken)) - before === ESCROWED - SPENT);
await send(closeIx(noMatch), brand);
check('a no-match closes straight away', await gone(noMatch.pda));
await send(closeIx(unanswered), brand);
check('an unanswered campaign closes straight away', await gone(unanswered.pda));
check('spent query stakes reached the treasury', (await bal(treasuryToken)) === 3 * SPENT);

console.log(`\n${pass} passed, ${fail} failed`);
stop();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
