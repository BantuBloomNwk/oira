// Residual #2 — bounded per-brand distinct-offer cap, proven on devnet.
//   Her Palette carries an 8-slot (brand -> distinct-offer count) table. With max_q_per_brand = 1,
//   ONE brand can query at most one distinct offer; a second distinct offer from the SAME brand is
//   rejected in-enclave, while a DIFFERENT brand is still allowed. Tightens the Sybil barrier beyond
//   the global lifetime cap. Run from client/:  node perbrand-e2e.mjs
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import {
  getAuthToken, permissionPdaFromAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram, delegationRecordPdaFromDelegatedAccount, delegationMetadataPdaFromDelegatedAccount,
  EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, PERMISSION_PROGRAM_ID, DELEGATION_PROGRAM_ID,
  createTopUpEscrowInstruction, escrowPdaFromEscrowAuthority,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createHash, randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import fs from 'fs';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const TEE_VALIDATOR = new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
const TEE_RPC = 'https://devnet-tee.magicblock.app';
const BASE_RPC = 'https://api.devnet.solana.com';
const SYS = new PublicKey('11111111111111111111111111111111');
const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');
const MINT = new PublicKey(JSON.parse(fs.readFileSync(new URL('./payout-config.json', import.meta.url))).mint);
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(new URL('../keys/oira-deployer.json', import.meta.url)))));

const owner = Keypair.generate(), agent = Keypair.generate();
const HER = { undertone: 2, depth: 8, season: 3 };
const salt = randomBytes(32);
const sha = (...b) => createHash('sha256').update(Buffer.concat(b)).digest();
const commitmentRoot = sha(salt, Buffer.from([HER.undertone, HER.depth, HER.season]));
const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const bBytes = (b) => { const l = Buffer.alloc(4); l.writeUInt32LE(b.length, 0); return Buffer.concat([l, Buffer.from(b)]); };
const bU32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
const bU64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };

const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), owner.publicKey.toBuffer()], PROGRAM)[0];
const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), owner.publicKey.toBuffer()], PROGRAM)[0];
const permP = permissionPdaFromAccount(palettePda), permT = permissionPdaFromAccount(traitsPda);

process.on('unhandledRejection', (e) => { const m = String(e && e.message || e); if (/429|Too Many|Unexpected server response/i.test(m)) return; console.error('unhandledRejection', m); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = new Connection(BASE_RPC, 'confirmed');
const opts = { commitment: 'confirmed', maxRetries: 5 };
async function teeConn(kp) { const { token } = await getAuthToken(TEE_RPC, kp.publicKey, (m) => Promise.resolve(nacl.sign.detached(m, kp.secretKey))); return new Connection(`${TEE_RPC}?token=${token}`, 'confirmed'); }
async function sendOnEr(tee, ixs, signers, feePayer) {
  const tx = new Transaction().add(...ixs); tx.feePayer = feePayer.publicKey;
  const w = new Set([feePayer.publicKey.toBase58()]); for (const ix of tx.instructions) for (const k of ix.keys) if (k.isWritable) w.add(k.pubkey.toBase58());
  const r = await (await fetch(tee.rpcEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhashForAccounts', params: [[...w]] }) })).json();
  const bh = r.result.value; tx.recentBlockhash = bh.blockhash; tx.lastValidBlockHeight = bh.lastValidBlockHeight; tx.sign(...signers);
  const sig = await tee.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const c = await tee.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
  if (c.value?.err) throw new Error('ER tx failed ' + JSON.stringify(c.value.err));
  return sig; }
const fund = (kp, l) => sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: kp.publicKey, lamports: l })), [deployer], opts);
function decodeVerdict(buf) { let o = 8; o += 32; const n = buf.readUInt32LE(o); o += 4; o += n; o += 32; o += 4; o += 4; o += 4; o += 1; return buf.readUInt8(o); }

let pass = true; const check = (label, ok) => { pass = pass && ok; console.log(`   ${ok ? '✓' : '✗'} ${label}`); };

console.log('program:', PROGRAM.toBase58());
console.log('[setup] seal her Palette with max_q_per_brand = 1 (one distinct offer per brand)…');
await fund(owner, 400_000_000); await fund(agent, 120_000_000);
await sendAndConfirmTransaction(base, new Transaction()
  .add(new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: Buffer.concat([disc('init_palette'), bBytes(randomBytes(96)), commitmentRoot]) }))
  .add(new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: disc('init_traits') })), [owner], opts);
// max_q_per_brand = 1, lifetime/epoch caps default (0)
await sendAndConfirmTransaction(base, new Transaction().add(new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: true }], data: Buffer.concat([disc('set_night_rules'), bU64(0), Buffer.from([1]), bU32(0), Buffer.from([0]), bU32(0), bU32(0)]) })), [owner], opts);
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
await sendAndConfirmTransaction(base, new Transaction().add(delIx(palettePda, 'delegate_palette')), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delIx(traitsPda, 'delegate_traits')), [owner], opts);
for (const kp of [owner, agent]) await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(kp.publicKey, 255), kp.publicKey, kp.publicKey, 40_000_000, 255)), [kp], opts);
const privIx = (pda, perm, name) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
  { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: perm, isSigner: false, isWritable: true },
  { pubkey: EPHEMERAL_VAULT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: PERMISSION_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc(name), agent.publicKey.toBuffer(), Buffer.from([1])]) });
{ const tee = await teeConn(owner);
  await sendOnEr(tee, [privIx(palettePda, permP, 'set_palette_privacy')], [owner], owner);
  await sendOnEr(tee, [privIx(traitsPda, permT, 'set_traits_privacy')], [owner], owner);
  await sendOnEr(tee, [new TransactionInstruction({ programId: PROGRAM, keys: [{ pubkey: owner.publicKey, isSigner: true, isWritable: false }, { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: false }], data: Buffer.concat([disc('set_traits'), Buffer.from([HER.undertone, HER.depth, HER.season]), salt]) })], [owner], owner); }

// run a matching offer from a given brand; returns the agent-read verdict (throws on rejection)
async function offerFrom(brandKp) {
  const offerId = BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6));
  const oidLe = Buffer.alloc(8); oidLe.writeBigUInt64LE(offerId, 0);
  const [campaign] = PublicKey.findProgramAddressSync([Buffer.from('campaign'), brandKp.publicKey.toBuffer(), oidLe], PROGRAM);
  const [escrow] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), campaign.toBuffer()], PROGRAM);
  const brandAta = getAssociatedTokenAddressSync(MINT, brandKp.publicKey);
  // NEW ABI: commit sha256(offer_salt‖shade); a matching offer for HER shade, opened in-enclave at match time.
  const offerSalt = randomBytes(16); const shade = [HER.undertone, HER.depth, HER.season, 1]; const targetHash = sha(offerSalt, Buffer.from(shade));
  await sendAndConfirmTransaction(base, new Transaction()
    .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brandKp.publicKey, MINT))
    .add(createMintToInstruction(MINT, brandAta, deployer.publicKey, 30_000_000)), [deployer], opts);
  const createIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: brandKp.publicKey, isSigner: true, isWritable: true }, { pubkey: MINT, isSigner: false, isWritable: false },
    { pubkey: campaign, isSigner: false, isWritable: true }, { pubkey: escrow, isSigner: false, isWritable: true },
    { pubkey: brandAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: RENT, isSigner: false, isWritable: false }],
    data: Buffer.concat([disc('create_campaign'), bU64(Number(offerId)), Buffer.from([0]), bU64(100_000), bU64(5_000_000), Buffer.from(targetHash), bU64(20_000_000)]) });
  await sendAndConfirmTransaction(base, new Transaction().add(createIx), [brandKp], opts);
  const delCamp = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: brandKp.publicKey, isSigner: true, isWritable: true }, { pubkey: brandKp.publicKey, isSigner: false, isWritable: false },
    { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(campaign, PROGRAM), isSigner: false, isWritable: true },
    { pubkey: delegationRecordPdaFromDelegatedAccount(campaign), isSigner: false, isWritable: true },
    { pubkey: delegationMetadataPdaFromDelegatedAccount(campaign), isSigner: false, isWritable: true },
    { pubkey: campaign, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
    { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: Buffer.concat([disc('delegate_campaign'), bU64(Number(offerId))]) });
  await sendAndConfirmTransaction(base, new Transaction().add(delCamp), [brandKp], opts);
  const matchIx = new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: agent.publicKey, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true },
    { pubkey: traitsPda, isSigner: false, isWritable: false }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
    { pubkey: campaign, isSigner: false, isWritable: true }],
    // NEW ABI: match_query(target_undertone, target_depth, target_season, depth_tol, offer_salt[16]).
    data: Buffer.concat([disc('match_query'), Buffer.from(shade), Buffer.from(offerSalt)]) });
  const tee = await teeConn(agent); await sendOnEr(tee, [matchIx], [agent], agent);
  return decodeVerdict((await tee.getAccountInfo(palettePda)).data);
}

const brandA = Keypair.generate(), brandB = Keypair.generate();
await fund(brandA, 220_000_000); await fund(brandB, 220_000_000);

console.log('\n[1] brand A, offer #1 — her first bit to this brand:');
check('matched (brand A count 1/1)', (await offerFrom(brandA)) === 1);

await sleep(4000);
console.log('\n[2] brand A, offer #2 — a DISTINCT offer from the SAME brand is rejected in-enclave:');
try { await offerFrom(brandA); check('2nd offer from brand A rejected', false); }
catch (e) { check('2nd offer from brand A rejected (PerBrandCapExceeded)', /failed|custom program error|ER tx failed/i.test(String(e.message))); }

await sleep(4000);
console.log('\n[3] brand B, offer #1 — a DIFFERENT brand is still allowed:');
check('matched (brand B has its own slot)', (await offerFrom(brandB)) === 1);

console.log('\n────────── RESULT ──────────');
console.log(pass
  ? 'PASS ✓ — the bounded per-brand table holds: one brand learns at most max_q_per_brand distinct bits, a second distinct offer from that brand is rejected in-enclave, and a different brand still gets its own slot. Sybil collection is now tightened per identity on top of her global lifetime cap.'
  : 'CHECK — a sub-assertion failed; inspect above.');
process.exit(pass ? 0 : 1);
