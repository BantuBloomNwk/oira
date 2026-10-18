// Oira night-rules proof, her standing rules enforced INSIDE the enclave (current commitment ABI).
//   Reconciled to the leak-fixed ABI: payout + category are read off the CAMPAIGN, not passed by the
//   client, and the verdict is computed in-enclave from her sealed, commitment-bound traits.
//   Setup: init_palette(root)+init_traits → set_night_rules(min_payout=$2, block category 3) →
//          delegate both → seal private (whitelist agent) → bind real traits.
//   Then the AGENT runs three ESCROWED, committed offers in the TEE while she's offline, each offer
//   commits HER shade (so absent a rule it would MATCH), isolating the rule under test:
//     A) $5 · category 0  -> MATCH (1)
//     B) $1 · category 0  -> DECLINED, below her floor (2)
//     C) $5 · category 3  -> DECLINED, blocked category (2)
// Run from client/: node e2e/night-rules-e2e.mjs
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

const HER = { undertone: 2, depth: 8, season: 3 }; // cool, Monk 8, season 3
const salt = randomBytes(32);
const sha = (...b) => createHash('sha256').update(Buffer.concat(b)).digest();
const commitmentRoot = sha(salt, Buffer.from([HER.undertone, HER.depth, HER.season]));

const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const bBytes = (b) => { const l = Buffer.alloc(4); l.writeUInt32LE(b.length, 0); return Buffer.concat([l, Buffer.from(b)]); };
const bU32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
const bU64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };
const usd = (n) => `$${(n / 1e6).toFixed(2)}`;

const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), owner.publicKey.toBuffer()], PROGRAM)[0];
const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), owner.publicKey.toBuffer()], PROGRAM)[0];
const permPalette = permissionPdaFromAccount(palettePda);
const permTraits = permissionPdaFromAccount(traitsPda);
const brandAta = getAssociatedTokenAddressSync(MINT, brand.publicKey);

// ── setup ix ──
const initPaletteIx = (enc) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: Buffer.concat([disc('init_palette'), bBytes(enc), commitmentRoot]) });
const initTraitsIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: disc('init_traits') });
// set_night_rules(min_payout, max_q_per_brand, blocked_cats, active, lifetime_cap, epoch_cap)
const setRulesIx = (minPayout, maxQ, blockedCats, active, lifeCap, epochCap) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true }],
  data: Buffer.concat([disc('set_night_rules'), bU64(minPayout), Buffer.from([maxQ]), bU32(blockedCats), Buffer.from([active ? 1 : 0]), bU32(lifeCap), bU32(epochCap)]) });
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

// ── campaign ix (per offer) ──
const PER_QUERY = 100_000, ESCROW = 20_000_000;
const campaignFor = (offerId, category, perAccept) => { const oidLe = Buffer.alloc(8); oidLe.writeBigUInt64LE(offerId, 0);
  const [c] = PublicKey.findProgramAddressSync([Buffer.from('campaign'), brand.publicKey.toBuffer(), oidLe], PROGRAM);
  const [e] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), c.toBuffer()], PROGRAM);
  const offerSalt = randomBytes(16); const shade = [HER.undertone, HER.depth, HER.season, 1]; const targetHash = sha(offerSalt, Buffer.from(shade));
  return { offerId, c, e, offerSalt, shade, targetHash, category, perAccept }; };
const createCampaignIx = (k) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: MINT, isSigner: false, isWritable: false },
  { pubkey: k.c, isSigner: false, isWritable: true }, { pubkey: k.e, isSigner: false, isWritable: true },
  { pubkey: brandAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: RENT, isSigner: false, isWritable: false }],
  data: Buffer.concat([disc('create_campaign'), bU64(k.offerId), Buffer.from([k.category]), bU64(PER_QUERY), bU64(k.perAccept), Buffer.from(k.targetHash), bU64(ESCROW)]) });
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

// last_verdict lives after: owner(32) enc(4+n) root(32) query_count(4) lifetime(4) epoch(4) is_private(1)
function decodeVerdict(buf) { let o = 8; o += 32; const n = buf.readUInt32LE(o); o += 4; o += n; o += 32 + 4 + 4 + 4 + 1; return buf.readUInt8(o); }

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

// create + delegate a committed offer, run match_query in-ER, return the agent-read verdict
async function offer(k) {
  await sendAndConfirmTransaction(base, new Transaction().add(createCampaignIx(k)), [brand], opts);
  await sendAndConfirmTransaction(base, new Transaction().add(delegateCampaignIx(k)), [brand], opts);
  const tee = await teeConn(agent); await sendOnEr(tee, [matchIx(k)], [agent], agent);
  return decodeVerdict((await tee.getAccountInfo(palettePda)).data);
}

let pass = true; const check = (label, ok) => { pass = pass && ok; console.log(`   ${ok ? '✓' : '✗'} ${label}`); };
console.log('program:', PROGRAM.toBase58()); console.log('owner  :', owner.publicKey.toBase58()); console.log('agent  :', agent.publicKey.toBase58(), '(offline)'); console.log('brand  :', brand.publicKey.toBase58());

console.log('\n[0] fund owner/agent/brand (SOL), mint the brand $100 oUSDC, open its ATA…');
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 300_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: agent.publicKey, lamports: 120_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: brand.publicKey, lamports: 300_000_000 })), [deployer], opts);
await sendAndConfirmTransaction(base, new Transaction()
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brand.publicKey, MINT))
  .add(createMintToInstruction(MINT, brandAta, deployer.publicKey, 100_000_000)), [deployer], opts);

console.log('\n[1] init_palette(root)+init_traits, set_night_rules(min_payout $2, block category 3, active)…');
await sendAndConfirmTransaction(base, new Transaction().add(initPaletteIx(randomBytes(96))).add(initTraitsIx()), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(setRulesIx(2_000_000, 0, 1 << 3, true, 0, 0)), [owner], opts);
console.log('[2] fund palette/traits rent, delegate both → TEE, top up ER escrows…');
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: palettePda, lamports: 10_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: traitsPda, lamports: 10_000_000 })), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('palette')), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('traits')), [owner], opts);
for (const kp of [owner, agent, brand]) await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(kp.publicKey, 255), kp.publicKey, kp.publicKey, 40_000_000, 255)), [kp], opts);
console.log('[3] seal palette + traits private (whitelist agent), bind her real traits…');
{ const tee = await teeConn(owner); await sendOnEr(tee, [privacyIx('palette', agent.publicKey)], [owner], owner); await sendOnEr(tee, [privacyIx('traits', agent.publicKey)], [owner], owner); }
{ const tee = await teeConn(owner); await sendOnEr(tee, [setTraitsIx()], [owner], owner); }

console.log('\n[4] three ESCROWED, committed offers answered by the AGENT in the enclave (owner offline):');
const V = { 0: 'no-match', 1: 'MATCH', 2: 'DECLINED' };
const cases = [
  ['A  $5 · category 0', 0, 5_000_000, 1],
  ['B  $1 · category 0', 0, 1_000_000, 2],
  ['C  $5 · category 3', 3, 5_000_000, 2],
];
for (const [label, category, perAccept, expect] of cases) {
  const k = campaignFor(BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6)), category, perAccept);
  const got = await offer(k);
  check(`${label} (payout ${usd(perAccept)}) -> ${V[got]}${got === expect ? '' : ` (expected ${V[expect]})`}`, got === expect);
}

console.log('\n────────── RESULT ──────────');
console.log(pass
  ? 'PASS ✓, her night rules (min-payout floor + blocked category) enforced INSIDE the enclave, per-offer, while she was offline. Payout + category were read off the escrowed campaign (not client-asserted); below-floor and blocked-category offers were DECLINED on-chain; the qualifying offer matched.'
  : 'CHECK: a verdict did not match; inspect above.');
console.log('palette:', `https://explorer.solana.com/address/${palettePda.toBase58()}?cluster=devnet`);
process.exit(pass ? 0 : 1);
