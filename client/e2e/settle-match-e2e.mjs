// Phase-2 proof, SETTLEMENT IS BOUND TO THE REAL MATCH (no brand boolean).
//   Reconciled to the leak-fixed ABI (2026-07-10). The chain, end-to-end on devnet:
//     • base:    brand create_campaign(target_hash = sha256(offer_salt‖[tu,td,ts,tol])) escrows oUSDC;
//                brand delegate_campaign → the SAME TEE ER as her Palette/Traits.
//     • enclave: seal her commitment-bound traits; the AGENT runs match_query(tu,td,ts,tol,offer_salt)
//                INSIDE the ER, the program opens the campaign's committed target, computes the verdict
//                ITSELF from her sealed traits, derives a SECRET nonce from her static salt, and writes a
//                HASHED receipt + a payee COMMITMENT onto the campaign. The agent reads the derived nonce
//                in-ER (this is the agent "disclosing on an accept"); it is then WIPED before the palette
//                commits, so base never sees the verdict or the nonce.
//     • base:    campaign + palette undelegate; settle_offer(offer_hash, verdict, nonce) pays her ONLY when
//                sha256(offer_hash‖verdict‖nonce) == the campaign receipt AND verdict==1 AND
//                sha256(her_wallet‖nonce) == the campaign payee_commit. The brand cannot self-assert.
//   Asserts:
//     • the derived nonce is READ from the ER (not client-chosen); base palette shows verdict/nonce WIPED
//     • a genuine MATCH settles: her oUSDC += per_accept_payout, escrow debited
//     • FORGERY-RESISTANT: wrong nonce → ReceiptMismatch ; wrong offer → OfferMismatch
//     • close returns the unspent escrow to the brand and the per-query stake to the treasury
// Run from client/ (AFTER redeploying the leak-fixed program):  node e2e/settle-match-e2e.mjs
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import {
  getAuthToken, permissionPdaFromAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram, delegationRecordPdaFromDelegatedAccount, delegationMetadataPdaFromDelegatedAccount,
  EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, PERMISSION_PROGRAM_ID, DELEGATION_PROGRAM_ID,
  createTopUpEscrowInstruction, escrowPdaFromEscrowAuthority,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import {
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction, unpackAccount, TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { createHash, randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import fs from 'fs';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const TEE_VALIDATOR = new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
const TEE_RPC = 'https://devnet-tee.magicblock.app';
const BASE_RPC = process.env.BASE_RPC || 'https://api.devnet.solana.com'; // set BASE_RPC to a less-throttled devnet RPC to avoid 429s
const SYS = new PublicKey('11111111111111111111111111111111');
const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');
const MINT = new PublicKey(JSON.parse(fs.readFileSync(new URL('../payout-config.json', import.meta.url))).mint);
// funded devnet keypair: OIRA_KEYPAIR env → ../keys/oira-deployer.json → ./devnet-keypair.json (git-ignored)
const legacyKey = new URL('../../keys/oira-deployer.json', import.meta.url);
const KEYPATH = process.env.OIRA_KEYPAIR || (fs.existsSync(legacyKey) ? legacyKey : new URL('../devnet-keypair.json', import.meta.url));
let deployer;
try { deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(KEYPATH)))); }
catch { console.error('Missing funded devnet keypair. Set OIRA_KEYPAIR=/path/to/id.json or place one at client/devnet-keypair.json (needs a little devnet SOL).'); process.exit(1); }
// TREASURY (program const) == the deployer wallet on devnet, collects forfeited per-query stakes.
const TREASURY = deployer.publicKey;

// her = Palette owner AND payee (settle requires palette.owner == her_token.owner)
// agent = whitelisted reader, runs the match INSIDE the enclave (she is offline)
// brand = funds the campaign + signs settle
const her = Keypair.generate();
const agent = Keypair.generate();
const brand = Keypair.generate();

// her real (bucketed) reading + the commitment she publishes
const HER = { undertone: 2, depth: 8, season: 3 }; // cool, Monk 8, season 3
const salt = randomBytes(32);
const sha = (...bufs) => createHash('sha256').update(Buffer.concat(bufs)).digest();
const commitmentRoot = sha(salt, Buffer.from([HER.undertone, HER.depth, HER.season])); // == set_traits binding

// the brand's concrete offer, chosen to MATCH her (undertone==2, |depth-8|<=tol). The campaign's
// on-chain target_hash is the COMMITMENT sha256(offer_salt‖[tu,td,ts,tol]), the shade never hits base.
const TGT = { tu: 2, td: 8, ts: 3, tol: 1 };
const offerSalt = randomBytes(16);
const targetHash = sha(offerSalt, Buffer.from([TGT.tu, TGT.td, TGT.ts, TGT.tol]));

const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const bBytes = (b) => { const l = Buffer.alloc(4); l.writeUInt32LE(b.length, 0); return Buffer.concat([l, Buffer.from(b)]); };
const bU64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };
const usd = (n) => `$${(n / 1e6).toFixed(2)}`;
const TX = (s) => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), her.publicKey.toBuffer()], PROGRAM)[0];
const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), her.publicKey.toBuffer()], PROGRAM)[0];
const permPalette = permissionPdaFromAccount(palettePda);
const permTraits = permissionPdaFromAccount(traitsPda);

const offerId = BigInt(Date.now());
const oidLe = Buffer.alloc(8); oidLe.writeBigUInt64LE(offerId, 0);
const [campaign] = PublicKey.findProgramAddressSync([Buffer.from('campaign'), brand.publicKey.toBuffer(), oidLe], PROGRAM);
const [escrow] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), campaign.toBuffer()], PROGRAM);
const brandAta = getAssociatedTokenAddressSync(MINT, brand.publicKey);
const herAta = getAssociatedTokenAddressSync(MINT, her.publicKey);
const treasuryAta = getAssociatedTokenAddressSync(MINT, TREASURY);

// ── enclave-side ix (base + ER) ──
const initPaletteIx = (enc) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: her.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: Buffer.concat([disc('init_palette'), bBytes(enc), commitmentRoot]) });
const initTraitsIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: her.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: disc('init_traits') });
const delegateIx = (which) => { const pda = which === 'palette' ? palettePda : traitsPda; const seedName = which === 'palette' ? 'delegate_palette' : 'delegate_traits';
  return new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: her.publicKey, isSigner: true, isWritable: true }, { pubkey: her.publicKey, isSigner: false, isWritable: false },
    { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(pda, PROGRAM), isSigner: false, isWritable: true },
    { pubkey: delegationRecordPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: delegationMetadataPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
    { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: disc(seedName) }); };
// campaign co-delegated into the SAME ER so match_query can open its committed target in-enclave.
const delegateCampaignIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: brand.publicKey, isSigner: false, isWritable: false },
  { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(campaign, PROGRAM), isSigner: false, isWritable: true },
  { pubkey: delegationRecordPdaFromDelegatedAccount(campaign), isSigner: false, isWritable: true },
  { pubkey: delegationMetadataPdaFromDelegatedAccount(campaign), isSigner: false, isWritable: true },
  { pubkey: campaign, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
  { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }],
  data: Buffer.concat([disc('delegate_campaign'), bU64(offerId)]) });
const privacyIx = (which, reader) => { const pda = which === 'palette' ? palettePda : traitsPda; const perm = which === 'palette' ? permPalette : permTraits; const name = which === 'palette' ? 'set_palette_privacy' : 'set_traits_privacy';
  return new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: her.publicKey, isSigner: true, isWritable: true }, { pubkey: her.publicKey, isSigner: false, isWritable: false },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: perm, isSigner: false, isWritable: true },
    { pubkey: EPHEMERAL_VAULT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: PERMISSION_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc(name), reader.toBuffer(), Buffer.from([1])]) }); };
const setTraitsIx = (u, d, s, saltBuf) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: her.publicKey, isSigner: true, isWritable: false }, { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: false }], data: Buffer.concat([disc('set_traits'), Buffer.from([u, d, s]), saltBuf]) });
// NEW ABI: match_query(target_undertone, target_depth, target_season, depth_tol, offer_salt[16]).
// No epoch (clock-derived in-enclave), no nonce (derived in-enclave), no payout/cat (read off campaign).
// The co-delegated campaign is now a required, MUTATED account.
const matchIx = (tu, td, ts, tol, oSalt) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: agent.publicKey, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true },
  { pubkey: traitsPda, isSigner: false, isWritable: false }, { pubkey: her.publicKey, isSigner: false, isWritable: false },
  { pubkey: campaign, isSigner: false, isWritable: true }],
  data: Buffer.concat([disc('match_query'), Buffer.from([tu, td, ts, tol]), Buffer.from(oSalt)]) });
const undelegatePaletteIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: her.publicKey, isSigner: true, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: true },
  { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }], data: disc('undelegate_palette') });
// carry the campaign (answered/receipt/payee_commit) back to base for settle.
const undelegateCampaignIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: her.publicKey, isSigner: true, isWritable: true }, { pubkey: campaign, isSigner: false, isWritable: true },
  { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }], data: disc('undelegate_campaign') });

// ── base-side money ix ──
const createCampaignIx = (category, perQuery, perAccept, tHash, escrowAmt) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: MINT, isSigner: false, isWritable: false },
  { pubkey: campaign, isSigner: false, isWritable: true }, { pubkey: escrow, isSigner: false, isWritable: true },
  { pubkey: brandAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: RENT, isSigner: false, isWritable: false }],
  data: Buffer.concat([disc('create_campaign'), bU64(offerId), Buffer.from([category]), bU64(perQuery), bU64(perAccept), Buffer.from(tHash), bU64(escrowAmt)]) });
// NEW ABI: settle_offer(offer_hash[32], verdict[1], nonce[16]), reads receipt+payee off the CAMPAIGN.
// The palette is NOT an account here (its receipt moved onto the campaign).
const settleOfferIx = (offerHash, verdict, nonce) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: false }, { pubkey: campaign, isSigner: false, isWritable: true },
  { pubkey: escrow, isSigner: false, isWritable: true }, { pubkey: herAta, isSigner: false, isWritable: true },
  { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }],
  data: Buffer.concat([disc('settle_offer'), Buffer.from(offerHash), Buffer.from([verdict]), Buffer.from(nonce)]) });
// close_campaign now requires the treasury token account (forfeited per-query stakes land there).
const closeCampaignIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: campaign, isSigner: false, isWritable: true },
  { pubkey: escrow, isSigner: false, isWritable: true }, { pubkey: brandAta, isSigner: false, isWritable: true },
  { pubkey: treasuryAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }], data: disc('close_campaign') });

// ── decoders ──
function decodePalette(buf) { let o = 8; o += 32; const encLen = buf.readUInt32LE(o); o += 4; o += encLen; o += 32; // root
  const query_count = buf.readUInt32LE(o); o += 4; const lifetime_queries = buf.readUInt32LE(o); o += 4; const epoch = buf.readUInt32LE(o); o += 4;
  const is_private = buf.readUInt8(o); o += 1; const last_verdict = buf.readUInt8(o); o += 1; const last_nonce = Buffer.from(buf.subarray(o, o + 16));
  return { query_count, lifetime_queries, epoch, is_private, last_verdict, last_nonce }; }
function decodeCampaign(buf) { // after 8-byte disc
  const answered = buf.readUInt8(163) === 1;
  const receipt = Buffer.from(buf.subarray(164, 188));
  const payee_commit = Buffer.from(buf.subarray(196, 228));
  return { answered, receipt, payee_commit }; }

const base = new Connection(BASE_RPC, 'confirmed');
const opts = { commitment: 'confirmed', maxRetries: 5 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// devnet's public RPC rate-limits hard; retry only on transient/429, let real program errors through.
const isTransient = (err) => /429|Too Many Requests|Timed out|fetch failed|ETIMEDOUT|ECONNRESET|502|503|Blockhash not found/i.test(String(err && (err.message || err)));
// web3.js can leak a 429 from its background rebroadcast loop as an unhandled rejection (detached from any
// await, so per-call retry can't catch it). Swallow only transient ones; still fail loudly on real errors.
process.on('unhandledRejection', (err) => { if (isTransient(err)) return; console.error('unhandledRejection:', err && (err.message || err)); process.exit(1); });
async function retry(fn, tries = 12) { let e; for (let i = 0; i < tries; i++) { try { return await fn(); } catch (err) { e = err; if (!isTransient(err)) throw err; await sleep(600 * (i + 1)); } } throw e; }
const send = (ixs, signers) => retry(() => sendAndConfirmTransaction(base, new Transaction().add(...ixs), signers, opts));
const bal = async (ata) => { const i = await retry(() => base.getAccountInfo(ata)); return i ? Number(unpackAccount(ata, i).amount) : 0; };
const acct = (pk) => retry(() => base.getAccountInfo(pk));
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
// undelegation is async: the ER validator commits state + returns ownership to base after a delay.
async function waitUndelegated(pda, label, timeoutMs = 60_000) {
  const t0 = Date.now();
  for (;;) {
    const info = await base.getAccountInfo(pda);
    if (info && info.owner.equals(PROGRAM)) return;
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label} not undelegated to base within ${timeoutMs}ms (still ${info ? info.owner.toBase58() : 'null'})`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

let pass = true; const check = (label, ok) => { pass = pass && ok; console.log(`   ${ok ? '✓' : '✗'} ${label}`); };
console.log('program :', PROGRAM.toBase58());
console.log('her(pay):', her.publicKey.toBase58(), '| agent:', agent.publicKey.toBase58(), '(offline owner)');
console.log('brand   :', brand.publicKey.toBase58(), '| campaign:', campaign.toBase58());

console.log('\n[0] fund her/agent/brand (SOL), mint the brand $100 oUSDC, open ATAs (her/brand/treasury)…');
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: her.publicKey, lamports: 300_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: agent.publicKey, lamports: 60_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: brand.publicKey, lamports: 260_000_000 })), [deployer], opts);
await sendAndConfirmTransaction(base, new Transaction()
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brand.publicKey, MINT))
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, herAta, her.publicKey, MINT))
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, treasuryAta, TREASURY, MINT))
  .add(createMintToInstruction(MINT, brandAta, deployer.publicKey, 100_000_000)), [deployer], opts);
const her0 = await bal(herAta);

const PER_QUERY = 100_000;    // $0.10 stake per answered offer
const PER_ACCEPT = 5_000_000; // $5.00 to her on an accepted match
const ESCROW = 20_000_000;    // $20.00 escrowed up front
console.log('\n[1] brand create_campaign, target_hash = sha256(offer_salt‖shade), escrow', usd(ESCROW), '…');
await sendAndConfirmTransaction(base, new Transaction().add(createCampaignIx(0, PER_QUERY, PER_ACCEPT, targetHash, ESCROW)), [brand], opts);
console.log('    escrow now holds', usd(await bal(escrow)));

console.log('[1b] brand delegate_campaign → TEE ER (so match_query can open the committed target)…');
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: brand.publicKey, toPubkey: campaign, lamports: 10_000_000 })), [brand], opts);
await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(brand.publicKey, 255), brand.publicKey, brand.publicKey, 30_000_000, 255)), [brand], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateCampaignIx()), [brand], opts);

console.log('\n[2] seal: init_palette(root)+init_traits, delegate both → TEE, whitelist agent, bind real traits…');
await sendAndConfirmTransaction(base, new Transaction().add(initPaletteIx(randomBytes(96))).add(initTraitsIx()), [her], opts);
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: her.publicKey, toPubkey: palettePda, lamports: 10_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: her.publicKey, toPubkey: traitsPda, lamports: 10_000_000 })), [her], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('palette')), [her], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('traits')), [her], opts);
for (const kp of [her, agent]) await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(kp.publicKey, 255), kp.publicKey, kp.publicKey, 30_000_000, 255)), [kp], opts);
{ const tee = await teeConn(her); await sendOnEr(tee, [privacyIx('palette', agent.publicKey)], [her], her); await sendOnEr(tee, [privacyIx('traits', agent.publicKey)], [her], her); }
{ const tee = await teeConn(her); await sendOnEr(tee, [setTraitsIx(HER.undertone, HER.depth, HER.season, salt)], [her], her); }

console.log('\n[3] AGENT runs match_query(shade) INSIDE the enclave, matching offer → verdict MATCH(1):');
{ const tee = await teeConn(agent); await sendOnEr(tee, [matchIx(TGT.tu, TGT.td, TGT.ts, TGT.tol, offerSalt)], [agent], agent); }

console.log('[3b] agent READS the in-enclave-derived nonce from the ER (disclosure-on-accept)…');
let nonce;
{ const tee = await teeConn(agent); const info = await retry(() => tee.getAccountInfo(palettePda, 'confirmed'));
  const er = decodePalette(info.data); nonce = er.last_nonce;
  check('ER palette shows verdict MATCH(1)', er.last_verdict === 1);
  check('ER palette carries a non-zero derived nonce', !nonce.equals(Buffer.alloc(16))); }

console.log('[4] undelegate campaign + palette → base (receipt/payee travel on the campaign; nonce WIPED on palette)…');
{ const tee = await teeConn(her); await sendOnEr(tee, [undelegateCampaignIx()], [her], her); }
{ const tee = await teeConn(her); await sendOnEr(tee, [undelegatePaletteIx()], [her], her); }
await waitUndelegated(campaign, 'campaign');
await waitUndelegated(palettePda, 'palette');

const cv = decodeCampaign((await acct(campaign)).data);
const pvBase = decodePalette((await acct(palettePda)).data);
check('campaign answered == true', cv.answered);
check('campaign receipt == sha256(target_hash‖1‖nonce), first 24 bytes', cv.receipt.equals(sha(targetHash, Buffer.from([1]), nonce).subarray(0, 24)));
check('campaign payee_commit == sha256(her_wallet‖nonce)', cv.payee_commit.equals(sha(her.publicKey.toBuffer(), nonce)));
check('LEAK-FIX: base palette verdict WIPED to 0', pvBase.last_verdict === 0);
check('LEAK-FIX: base palette nonce WIPED to zero', pvBase.last_nonce.equals(Buffer.alloc(16)));

console.log('\n[5] settle_offer(target_hash, verdict=1, nonce), the MATCH authorizes the payout:');
await send([settleOfferIx(targetHash, 1, nonce)], [brand]);
const herPaid = await bal(herAta) - her0;
check(`her received exactly ${usd(PER_ACCEPT)} from escrow`, herPaid === PER_ACCEPT);

console.log('\n[6] FORGERY-RESISTANCE: the brand cannot fabricate a settlement:');
await sleep(1200);
try { await send([settleOfferIx(targetHash, 1, randomBytes(16))], [brand]); check('wrong-nonce settle rejected', false); }
catch (e) { check('wrong-nonce settle rejected (ReceiptMismatch)', !isTransient(e)); }
try { await send([settleOfferIx(randomBytes(32), 1, nonce)], [brand]); check('wrong-offer settle rejected', false); }
catch (e) { check('wrong-offer settle rejected (OfferMismatch)', !isTransient(e)); }

console.log('\n[7] close_campaign, refund unspent escrow to the brand, forfeited stake to the treasury…');
await sleep(1200);
const brandBefore = await bal(brandAta);
const treas0 = await bal(treasuryAta);
await send([closeCampaignIx()], [brand]);
const refunded = await bal(brandAta) - brandBefore;
check('escrow account closed', (await acct(escrow)) === null);
check('treasury received the per-query stake', (await bal(treasuryAta) - treas0) === PER_QUERY);
console.log('    refunded to brand', usd(refunded), '(escrowed', usd(ESCROW), '- paid', usd(PER_ACCEPT), '- stake', usd(PER_QUERY) + ')');

console.log('\n────────── RESULT ──────────');
console.log(pass
  ? 'PASS ✓, settlement is BOUND TO THE ENCLAVE MATCH: the program computed the verdict from her sealed traits, derived a secret nonce that never reached base (verdict+nonce wiped), the receipt+payee_commit rode the campaign to base, a genuine verdict==1 released her oUSDC, a forged nonce and a wrong offer were both rejected, and the remainder split brand/treasury. The brand can no longer self-assert an acceptance, and base never learned her shade or her verdict.'
  : 'CHECK: a sub-assertion failed; inspect above.');
console.log('campaign:', `https://explorer.solana.com/address/${campaign.toBase58()}?cluster=devnet`);
process.exit(pass ? 0 : 1);
