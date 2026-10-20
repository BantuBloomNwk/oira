// Phase-1 proof, the REAL in-enclave match on the current commitment ABI (the client never supplies
// the answer). Each offer is a committed, escrowed campaign co-delegated into her ER; the AGENT (owner
// offline) runs match_query and the program READS her sealed traits and computes the verdict itself.
//   Asserts:
//     • commitment BINDING: a set_traits with traits != the published root is rejected in-enclave
//     • READ GATING: an outsider cannot RPC-read the sealed traits (null)
//     • REAL verdict: a matching campaign -> MATCH(1); a mismatched-undertone campaign -> no-match(0),
//       WITHOUT the client ever passing the answer
//     • HASHED receipt: the campaign carries sha256(target_hash‖verdict‖nonce), not the cleartext offer
//   (The per-epoch budget is proven separately in per-palette-e2e; settlement in settle-match-e2e.)
// Run from client/:  node e2e/match-real-e2e.mjs
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import {
  getAuthToken, permissionPdaFromAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram, delegationRecordPdaFromDelegatedAccount, delegationMetadataPdaFromDelegatedAccount,
  EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID, DELEGATION_PROGRAM_ID,
  createTopUpEscrowInstruction, escrowPdaFromEscrowAuthority,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { createHash, randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import fs from 'fs';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const TEE_VALIDATOR = new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
const TEE_RPC = 'https://devnet-tee.magicblock.app';
const BASE_RPC = process.env.BASE_RPC || 'https://api.devnet.solana.com';
const SYS = new PublicKey('11111111111111111111111111111111');
const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');
const MINT = new PublicKey(JSON.parse(fs.readFileSync(new URL('../payout-config.json', import.meta.url))).mint);
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(new URL('../../keys/oira-deployer.json', import.meta.url)))));
const owner = Keypair.generate();
const agent = Keypair.generate();
const brand = Keypair.generate();
const outsider = Keypair.generate();

// her real (bucketed) reading
const HER = { undertone: 2, depth: 8, season: 3 }; // cool, Monk 8, season 3
const salt = randomBytes(32);
const sha = (...bufs) => createHash('sha256').update(Buffer.concat(bufs)).digest();
const commitmentRoot = sha(salt, Buffer.from([HER.undertone, HER.depth, HER.season]));

const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const bBytes = (b) => { const l = Buffer.alloc(4); l.writeUInt32LE(b.length, 0); return Buffer.concat([l, Buffer.from(b)]); };
const bU64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };
const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), owner.publicKey.toBuffer()], PROGRAM)[0];
const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), owner.publicKey.toBuffer()], PROGRAM)[0];
const permPalette = permissionPdaFromAccount(palettePda);
const permTraits = permissionPdaFromAccount(traitsPda);
const brandAta = getAssociatedTokenAddressSync(MINT, brand.publicKey);

const initPaletteIx = (enc) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: Buffer.concat([disc('init_palette'), bBytes(enc), commitmentRoot]) });
const initTraitsIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: disc('init_traits') });
const delegateIx = (which) => { const pda = which === 'palette' ? palettePda : traitsPda; const name = which === 'palette' ? 'delegate_palette' : 'delegate_traits';
  return new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
    { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(pda, PROGRAM), isSigner: false, isWritable: true },
    { pubkey: delegationRecordPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: delegationMetadataPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
    { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: disc(name) }); };
const privacyIx = (which, reader) => { const pda = which === 'palette' ? palettePda : traitsPda; const perm = which === 'palette' ? permPalette : permTraits; const name = which === 'palette' ? 'set_palette_privacy' : 'set_traits_privacy';
  return new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: perm, isSigner: false, isWritable: true },
    { pubkey: EPHEMERAL_VAULT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: PERMISSION_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc(name), reader.toBuffer(), Buffer.from([1])]) }); };
const setTraitsIx = (u, d, s, saltBuf) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: false }, { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: false }], data: Buffer.concat([disc('set_traits'), Buffer.from([u, d, s]), saltBuf]) });

const PER_QUERY = 100_000, PER_ACCEPT = 5_000_000, ESCROW = 20_000_000;
const campaignFor = (offerId, tu, td, ts, tol) => { const oidLe = Buffer.alloc(8); oidLe.writeBigUInt64LE(offerId, 0);
  const [c] = PublicKey.findProgramAddressSync([Buffer.from('campaign'), brand.publicKey.toBuffer(), oidLe], PROGRAM);
  const [e] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), c.toBuffer()], PROGRAM);
  const offerSalt = randomBytes(16); const shade = [tu, td, ts, tol]; const targetHash = sha(offerSalt, Buffer.from(shade));
  return { offerId, c, e, offerSalt, shade, targetHash }; };
const createCampaignIx = (k) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: MINT, isSigner: false, isWritable: false },
  { pubkey: k.c, isSigner: false, isWritable: true }, { pubkey: k.e, isSigner: false, isWritable: true },
  { pubkey: brandAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: RENT, isSigner: false, isWritable: false }],
  data: Buffer.concat([disc('create_campaign'), bU64(k.offerId), Buffer.from([0]), bU64(PER_QUERY), bU64(PER_ACCEPT), Buffer.from(k.targetHash), bU64(ESCROW)]) });
const delegateCampaignIx = (k) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: brand.publicKey, isSigner: false, isWritable: false },
  { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(k.c, PROGRAM), isSigner: false, isWritable: true },
  { pubkey: delegationRecordPdaFromDelegatedAccount(k.c), isSigner: false, isWritable: true },
  { pubkey: delegationMetadataPdaFromDelegatedAccount(k.c), isSigner: false, isWritable: true },
  { pubkey: k.c, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
  { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: Buffer.concat([disc('delegate_campaign'), bU64(k.offerId)]) });
const matchIx = (k) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: agent.publicKey, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true },
  { pubkey: traitsPda, isSigner: false, isWritable: false }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
  { pubkey: k.c, isSigner: false, isWritable: true }],
  data: Buffer.concat([disc('match_query'), Buffer.from(k.shade), Buffer.from(k.offerSalt)]) });

function decodePalette(buf) { let o = 8; o += 32; const encLen = buf.readUInt32LE(o); o += 4; o += encLen; o += 32; // root
  const query_count = buf.readUInt32LE(o); o += 4; o += 4; o += 4; // lifetime, epoch
  const is_private = buf.readUInt8(o); o += 1; const last_verdict = buf.readUInt8(o); o += 1; const last_nonce = Buffer.from(buf.subarray(o, o + 16));
  return { query_count, is_private, last_verdict, last_nonce }; }
// Campaign (after 8-byte disc): answered@163 receipt@164 (24 bytes) answered_at@188 payee_commit@196
function decodeCampaign(buf) { return { answered: buf.readUInt8(163) === 1, receipt: Buffer.from(buf.subarray(164, 188)), answeredAt: Number(buf.readBigInt64LE(188)) }; }

const base = new Connection(BASE_RPC, 'confirmed');
const opts = { commitment: 'confirmed', maxRetries: 5 };
// devnet's public RPC rate-limits hard; web3.js can leak a 429 from its detached background
// rebroadcast loop as an unhandled rejection (not catchable by any await). Swallow transient ones;
// still fail loudly on real errors. (Same guard settle-match-e2e carries.)
const isTransient = (err) => /429|Too Many Requests|Timed out|fetch failed|ETIMEDOUT|ECONNRESET|502|503|Blockhash not found/i.test(String(err && (err.message || err)));
process.on('unhandledRejection', (err) => { if (isTransient(err)) return; console.error('unhandledRejection:', err && (err.message || err)); process.exit(1); });
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
// create + delegate a committed campaign, then run match_query in-ER; returns the ER palette + campaign state
async function offer(k) {
  await sendAndConfirmTransaction(base, new Transaction().add(createCampaignIx(k)), [brand], opts);
  await sendAndConfirmTransaction(base, new Transaction().add(delegateCampaignIx(k)), [brand], opts);
  const tee = await teeConn(agent); await sendOnEr(tee, [matchIx(k)], [agent], agent);
  const pv = decodePalette((await tee.getAccountInfo(palettePda)).data);
  const cv = decodeCampaign((await tee.getAccountInfo(k.c)).data);
  return { pv, cv };
}

let pass = true; const check = (label, ok) => { pass = pass && ok; console.log(`   ${ok ? '✓' : '✗'} ${label}`); };
console.log('program:', PROGRAM.toBase58());
console.log('owner  :', owner.publicKey.toBase58(), '| agent:', agent.publicKey.toBase58(), '(offline)');
console.log('her (bucketed):', HER);

console.log('\n[0] fund owner/agent/brand/outsider (SOL), mint the brand $100 oUSDC…');
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 300_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: agent.publicKey, lamports: 120_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: brand.publicKey, lamports: 300_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: outsider.publicKey, lamports: 60_000_000 })), [deployer], opts);
await sendAndConfirmTransaction(base, new Transaction()
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brand.publicKey, MINT))
  .add(createMintToInstruction(MINT, brandAta, deployer.publicKey, 100_000_000)), [deployer], opts);

console.log('\n[1] init_palette(commitment_root) + init_traits (empty), delegate both → TEE…');
await sendAndConfirmTransaction(base, new Transaction().add(initPaletteIx(randomBytes(96))).add(initTraitsIx()), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: palettePda, lamports: 10_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: traitsPda, lamports: 10_000_000 })), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('palette')), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('traits')), [owner], opts);
for (const kp of [owner, agent, brand]) await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(kp.publicKey, 255), kp.publicKey, kp.publicKey, 40_000_000, 255)), [kp], opts);
console.log('[2] seal both private (whitelist agent)…');
{ const tee = await teeConn(owner); await sendOnEr(tee, [privacyIx('palette', agent.publicKey)], [owner], owner); await sendOnEr(tee, [privacyIx('traits', agent.publicKey)], [owner], owner); }

console.log('\n[3] commitment BINDING: a wrong-traits set_traits must be rejected in-enclave:');
try { const tee = await teeConn(owner); await sendOnEr(tee, [setTraitsIx(1, HER.depth, HER.season, salt)], [owner], owner); check('wrong traits rejected', false); }
catch (e) { check('wrong traits rejected (BindingMismatch)', /failed/.test(String(e.message))); }
console.log('   sealing the REAL traits (bound to the published root)…');
{ const tee = await teeConn(owner); await sendOnEr(tee, [setTraitsIx(HER.undertone, HER.depth, HER.season, salt)], [owner], owner); }

console.log('\n[4] READ GATING: outsider cannot read the sealed traits:');
{ const rd = await (await teeConn(outsider)).getAccountInfo(traitsPda); check('outsider read of traits is null', rd === null); }

console.log('\n[5] REAL match, computed in-enclave by the AGENT (owner offline, client passes NO answer):');
const mk = campaignFor(BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6)), 2, 8, 3, 1); // matches her
const m = await offer(mk);
check('matching campaign -> verdict MATCH(1)', m.pv.last_verdict === 1);
check('campaign receipt == sha256(target_hash‖1‖nonce), first 24 bytes', m.cv.receipt.equals(sha(mk.targetHash, Buffer.from([1]), m.pv.last_nonce).subarray(0, 24)));
check('the answer is time-stamped for her claim window', m.cv.answeredAt > 0);

const nk = campaignFor(BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6)), 0, 8, 3, 1); // warm undertone -> no-match
const n = await offer(nk);
check('mismatched-undertone campaign -> verdict no-match(0)', n.pv.last_verdict === 0);

console.log('\n────────── RESULT ──────────');
console.log(pass
  ? 'PASS ✓, the enclave COMPUTES the match from her sealed, commitment-bound traits (the client never supplies it); wrong traits are rejected at seal; outsiders cannot read the traits; a matching committed offer verdicts MATCH and a mismatched one no-match; only a hashed receipt reaches the campaign.'
  : 'CHECK: a sub-assertion failed; inspect above.');
console.log('palette:', `https://explorer.solana.com/address/${palettePda.toBase58()}?cluster=devnet`);
process.exit(pass ? 0 : 1);
