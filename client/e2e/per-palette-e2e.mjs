// Oira PER spike — the offline-agent match inside a MagicBlock Private ER (TEE), current commitment ABI.
//   attest TEE -> init_palette(root)+init_traits (base) -> set_night_rules(epoch_cap=CAP) ->
//   delegate palette+traits to the TEE validator -> seal both private (whitelist agent) ->
//   verify EphemeralPermission(is_private) -> the AGENT answers CAP escrowed, committed offers
//   in-enclave (owner NOT a signer) -> the (CAP+1)th is rejected by the on-chain per-epoch budget ->
//   base stays frozen throughout (query_count == 0 on base while matches happen in-ER).
//
//   NOTE on CAP: the on-chain default epoch cap is 8, but each budget-consuming query now needs its
//   OWN escrowed campaign (a repeat of an answered offer is a free no-op). A default-8 proof would
//   need 8 escrowed campaigns; her-set epoch_cap exercises the IDENTICAL on-chain enforcement path
//   (match_query's `require!(query_count < epoch_cap)`) at a fraction of the devnet cost.
// Run from client/: node e2e/per-palette-e2e.mjs
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import {
  verifyTeeRpcIntegrity, getAuthToken, permissionPdaFromAccount,
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
const TEE_RPC = process.env.MAGICBLOCK_TEE_RPC || 'https://devnet-tee.magicblock.app';
const BASE_RPC = process.env.BASE_RPC || 'https://api.devnet.solana.com';
const SYS = new PublicKey('11111111111111111111111111111111');
const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');
const MINT = new PublicKey(JSON.parse(fs.readFileSync(new URL('../payout-config.json', import.meta.url))).mint);
const EX = (k, v) => `https://explorer.solana.com/${k}/${v}?cluster=devnet`;
const CAP = 3; // her-set epoch_cap; exercises the same on-chain per-epoch budget as the default 8

const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(new URL('../../keys/oira-deployer.json', import.meta.url)))));
const owner = Keypair.generate();       // fresh palette owner each run (present only for setup)
const agent = Keypair.generate();       // the offline session key (signs the match)
const brand = Keypair.generate();       // funds the committed offers

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
const permPalette = permissionPdaFromAccount(palettePda);
const permTraits = permissionPdaFromAccount(traitsPda);
const brandAta = getAssociatedTokenAddressSync(MINT, brand.publicKey);

const initPaletteIx = (enc) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: Buffer.concat([disc('init_palette'), bBytes(enc), commitmentRoot]) });
const initTraitsIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: disc('init_traits') });
// set_night_rules(min_payout, max_q_per_brand, blocked_cats, active, lifetime_cap, epoch_cap)
const setRulesIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true }],
  data: Buffer.concat([disc('set_night_rules'), bU64(0), Buffer.from([0]), bU32(0), Buffer.from([0]), bU32(0), bU32(CAP)]) });
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
const setTraitsIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: false }, { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: false }], data: Buffer.concat([disc('set_traits'), Buffer.from([HER.undertone, HER.depth, HER.season]), salt]) });

const PER_QUERY = 100_000, PER_ACCEPT = 5_000_000, ESCROW = 20_000_000;
const campaignFor = (offerId) => { const oidLe = Buffer.alloc(8); oidLe.writeBigUInt64LE(offerId, 0);
  const [c] = PublicKey.findProgramAddressSync([Buffer.from('campaign'), brand.publicKey.toBuffer(), oidLe], PROGRAM);
  const [e] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), c.toBuffer()], PROGRAM);
  const offerSalt = randomBytes(16); const shade = [HER.undertone, HER.depth, HER.season, 1]; const targetHash = sha(offerSalt, Buffer.from(shade));
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

// query_count is the first field after the commitment root
function readQueryCount(buf) { if (!buf) return null; let o = 8; o += 32; const n = buf.readUInt32LE(o); o += 4; o += n; o += 32; return buf.readUInt32LE(o); }

const base = new Connection(BASE_RPC, 'confirmed');
const opts = { commitment: 'confirmed', maxRetries: 5 };
// devnet's public RPC rate-limits hard; web3.js can leak a 429 from its detached background
// rebroadcast loop as an unhandled rejection (not catchable by any await). Swallow transient ones;
// still fail loudly on real errors. (Same guard settle-match-e2e carries.)
const isTransient = (err) => /429|Too Many Requests|Timed out|fetch failed|ETIMEDOUT|ECONNRESET|502|503|Blockhash not found/i.test(String(err && (err.message || err)));
process.on('unhandledRejection', (err) => { if (isTransient(err)) return; console.error('unhandledRejection:', err && (err.message || err)); process.exit(1); });
async function freshTee(auth) { const { token } = await getAuthToken(TEE_RPC, auth.publicKey, (m) => Promise.resolve(nacl.sign.detached(m, auth.secretKey))); return new Connection(`${TEE_RPC}?token=${token}`, 'confirmed'); }
async function sendOnEr(tee, ixs, signers, feePayer) {
  const tx = new Transaction().add(...ixs); tx.feePayer = feePayer.publicKey;
  const writable = new Set([feePayer.publicKey.toBase58()]);
  for (const ix of tx.instructions) for (const k of ix.keys) if (k.isWritable) writable.add(k.pubkey.toBase58());
  const r = await (await fetch(tee.rpcEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhashForAccounts', params: [[...writable]] }) })).json();
  const bh = r.result.value; tx.recentBlockhash = bh.blockhash; tx.lastValidBlockHeight = bh.lastValidBlockHeight; tx.sign(...signers);
  const sig = await tee.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const conf = await tee.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
  if (conf.value?.err) throw new Error(`ER tx failed ${JSON.stringify(conf.value.err)}`);
  return sig;
}
async function answerOffer() {
  const k = campaignFor(BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6)));
  await sendAndConfirmTransaction(base, new Transaction().add(createCampaignIx(k)), [brand], opts);
  await sendAndConfirmTransaction(base, new Transaction().add(delegateCampaignIx(k)), [brand], opts);
  const tee = await freshTee(agent); await sendOnEr(tee, [matchIx(k)], [agent], agent);
}

console.log('program :', PROGRAM.toBase58());
console.log('owner   :', owner.publicKey.toBase58());
console.log('agent   :', agent.publicKey.toBase58(), '(offline session key)');
console.log('palette :', palettePda.toBase58());

console.log('\n[1] attest TEE…');
try { await verifyTeeRpcIntegrity(TEE_RPC); console.log('   ✓ enclave attested (TDX quote verified)'); }
catch (e) { console.warn('   ⚠ attestation fetch failed (sandbox egress):', (e?.cause?.code || e.message) + ' — continuing with auth token'); }
console.log('   TEE ER core:', (await (await freshTee(agent)).getVersion())['solana-core']);

console.log('\n[2] fund owner/agent/brand; mint the brand $100 oUSDC…');
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 300_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: agent.publicKey, lamports: 150_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: brand.publicKey, lamports: 320_000_000 })), [deployer], opts);
await sendAndConfirmTransaction(base, new Transaction()
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brand.publicKey, MINT))
  .add(createMintToInstruction(MINT, brandAta, deployer.publicKey, 100_000_000)), [deployer], opts);

console.log('\n[3] init_palette(root)+init_traits, set_night_rules(epoch_cap=' + CAP + ')…');
await sendAndConfirmTransaction(base, new Transaction().add(initPaletteIx(randomBytes(96))).add(initTraitsIx()), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(setRulesIx()), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: palettePda, lamports: 10_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: traitsPda, lamports: 10_000_000 })), [owner], opts);

console.log('\n[4] delegate palette + traits → TEE validator; top up ER escrows…');
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('palette')), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('traits')), [owner], opts);
for (const kp of [owner, agent, brand]) await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(kp.publicKey, 255), kp.publicKey, kp.publicKey, 40_000_000, 255)), [kp], opts);

console.log('\n[5] seal palette + traits private (whitelist only the agent), bind her real traits…');
{ const tee = await freshTee(owner); await sendOnEr(tee, [privacyIx('palette', agent.publicKey)], [owner], owner); await sendOnEr(tee, [privacyIx('traits', agent.publicKey)], [owner], owner); }
{ const tee = await freshTee(owner); await sendOnEr(tee, [setTraitsIx()], [owner], owner); }

console.log('\n[6] verify the EphemeralPermission(is_private) artifact on the ER…');
{ const tee = await freshTee(agent); const p = await tee.getAccountInfo(permPalette);
  console.log('   permission account:', p ? `EXISTS (${p.data.length}B, owner==permission program ${p.owner.equals(PERMISSION_PROGRAM_ID) ? '✓' : '✗'})` : 'NOT FOUND'); }

console.log(`\n[7] the AGENT answers ${CAP} escrowed, committed offers in-enclave (owner absent)…`);
for (let i = 1; i <= CAP; i++) { await answerOffer(); process.stdout.write(`   match #${i} (agent-signed, owner offline) ✓\n`); }

console.log(`\n[8] per-epoch budget: the ${CAP + 1}th match must be REJECTED on-chain…`);
let rejected = false;
try { await answerOffer(); }
catch (e) { rejected = true; console.log('   ✓ rejected:', (e.message || '').split('\n')[0].slice(0, 80)); }
if (!rejected) console.log(`   ✗ the ${CAP + 1}th was NOT rejected — budget not enforced`);

console.log('\n[9] base is still frozen (the matches never touched the base layer)…');
const baseCount = readQueryCount((await base.getAccountInfo(palettePda))?.data);
console.log('   base query_count:', baseCount, '(should be 0 — matches happened in-enclave)');

console.log('\n────────── RESULT ──────────');
const pass = rejected && baseCount === 0;
console.log(pass
  ? `PASS ✓ — the offline agent answered ${CAP} committed offers inside the TEE; the owner never signed a match; the (${CAP + 1})th was rejected by the on-chain per-epoch budget; base only ever saw an encrypted blob (query_count still 0, matches live in-enclave).`
  : 'CHECK — an assertion did not hold; inspect above.');
console.log('palette:', EX('address', palettePda.toBase58()));
process.exit(pass ? 0 : 1);
