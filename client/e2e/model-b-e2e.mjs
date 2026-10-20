// Model B, PRODUCTION privacy hardening, proven end-to-end on devnet.
//
//   Her Palette + Traits are delegated into the Private ER ONCE and NEVER leave the enclave.
//   Each brand campaign COMMITS its target shade publicly + escrows, then co-delegates into her
//   ER; the offline AGENT runs match_query with NO target (it can only ask "does she match THIS
//   escrowed offer?"). The verdict + a trait-derived nonce stay PRIVATE in her Palette; only an
//   opaque receipt + (on a match) her payee are committed onto the campaign and undelegated to
//   base for settle. Asserts the full defense stack:
//     L1  idempotency, re-querying the same offer is a FREE no-op (her meter counts DISTINCT offers)
//     L2  bound query, the agent cannot probe arbitrary targets; a mismatched campaign → no-match
//     L4  her-set cap, she caps her own lifetime distinct-offer budget; the (cap+1)th is rejected
//     L5  hidden no-match, a no-match commits payee=0 (no wallet link) and an opaque receipt (no verdict)
//     settle bound to match, a real receipt pays her; a forged nonce / wrong offer are rejected
//     Palette stays in the enclave, it is still delegation-owned on base at the end
// Run from client/:  node e2e/model-b-e2e.mjs
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import {
  getAuthToken, permissionPdaFromAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram, delegationRecordPdaFromDelegatedAccount, delegationMetadataPdaFromDelegatedAccount,
  EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, PERMISSION_PROGRAM_ID, DELEGATION_PROGRAM_ID,
  createTopUpEscrowInstruction, escrowPdaFromEscrowAuthority,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import {
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, unpackAccount, TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { createHash, randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import fs from 'fs';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const CONFIG_PDA = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM)[0]; // accepted tokens + treasury
const TEE_VALIDATOR = new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
const TEE_RPC = 'https://devnet-tee.magicblock.app';
const BASE_RPC = process.env.OIRA_BASE_RPC || 'https://api.devnet.solana.com';
const SYS = new PublicKey('11111111111111111111111111111111');
const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');
const MINT = new PublicKey(JSON.parse(fs.readFileSync(new URL('../payout-config.json', import.meta.url))).mint);

const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(process.env.OIRA_KEYPAIR || new URL('../../keys/oira-deployer.json', import.meta.url)))));
const owner = Keypair.generate();    // her
const agent = Keypair.generate();    // her offline-owner's session key
const brand = Keypair.generate();
const outsider = Keypair.generate(); // an attacker key that is NOT her agent

const HER = { undertone: 2, depth: 8, season: 3 };
const salt = randomBytes(32);
const sha = (...b) => createHash('sha256').update(Buffer.concat(b)).digest();
const commitmentRoot = sha(salt, Buffer.from([HER.undertone, HER.depth, HER.season]));

const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const bBytes = (b) => { const l = Buffer.alloc(4); l.writeUInt32LE(b.length, 0); return Buffer.concat([l, Buffer.from(b)]); };
const bU32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
const bU64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };
const EX = (v) => `https://explorer.solana.com/address/${v}?cluster=devnet`;
const usd = (n) => `$${(n / 1e6).toFixed(2)}`;

const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), owner.publicKey.toBuffer()], PROGRAM)[0];
const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), owner.publicKey.toBuffer()], PROGRAM)[0];
const permPalette = permissionPdaFromAccount(palettePda);
const permTraits = permissionPdaFromAccount(traitsPda);
const herAta = getAssociatedTokenAddressSync(MINT, owner.publicKey);
const brandAta = getAssociatedTokenAddressSync(MINT, brand.publicKey);
const treasuryAta = getAssociatedTokenAddressSync(MINT, deployer.publicKey); // TREASURY = deployer on devnet

// ── her-side ix (base, before delegation) ──
const initPaletteIx = (enc) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: Buffer.concat([disc('init_palette'), bBytes(enc), commitmentRoot]) });
const initTraitsIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: disc('init_traits') });
const nightRulesIx = (lifetimeCap, epochCap) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: true }],
  data: Buffer.concat([disc('set_night_rules'), bU64(0), Buffer.from([0]), bU32(0), Buffer.from([0]), bU32(lifetimeCap), bU32(epochCap)]) });
const delegateIx = (which) => { const pda = which === 'palette' ? palettePda : traitsPda; const name = which === 'palette' ? 'delegate_palette' : 'delegate_traits';
  return new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
    { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(pda, PROGRAM), isSigner: false, isWritable: true },
    { pubkey: delegationRecordPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: delegationMetadataPdaFromDelegatedAccount(pda), isSigner: false, isWritable: true },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
    { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false },
    { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: disc(name) }); };
const privacyIx = (which, reader) => { const pda = which === 'palette' ? palettePda : traitsPda; const perm = which === 'palette' ? permPalette : permTraits; const name = which === 'palette' ? 'set_palette_privacy' : 'set_traits_privacy';
  return new TransactionInstruction({ programId: PROGRAM, keys: [
    { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
    { pubkey: pda, isSigner: false, isWritable: true }, { pubkey: perm, isSigner: false, isWritable: true },
    { pubkey: EPHEMERAL_VAULT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: PERMISSION_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc(name), reader.toBuffer(), Buffer.from([1])]) }); };
const setTraitsIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: false }, { pubkey: traitsPda, isSigner: false, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: false }], data: Buffer.concat([disc('set_traits'), Buffer.from([HER.undertone, HER.depth, HER.season]), salt]) });

// ── campaign ix (per offer) ──
const PER_QUERY = 100_000, PER_ACCEPT = 5_000_000, ESCROW = 20_000_000;
const campaignFor = (offerId, tu, td, ts, tol) => { const oidLe = Buffer.alloc(8); oidLe.writeBigUInt64LE(offerId, 0);
  const [c] = PublicKey.findProgramAddressSync([Buffer.from('campaign'), brand.publicKey.toBuffer(), oidLe], PROGRAM);
  const [e] = PublicKey.findProgramAddressSync([Buffer.from('escrow'), c.toBuffer()], PROGRAM);
  // NEW ABI: the campaign commits sha256(offer_salt‖[tu,td,ts,tol]); the shade + salt are opened to the agent in-enclave.
  const offerSalt = randomBytes(16); const shade = [tu, td, ts, tol]; const targetHash = sha(offerSalt, Buffer.from(shade));
  return { offerId, c, e, targetHash, offerSalt, shade }; };
const createCampaignIx = (k) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: MINT, isSigner: false, isWritable: false },
  { pubkey: k.c, isSigner: false, isWritable: true }, { pubkey: k.e, isSigner: false, isWritable: true },
  { pubkey: brandAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: RENT, isSigner: false, isWritable: false }, { pubkey: CONFIG_PDA, isSigner: false, isWritable: false }],
  data: Buffer.concat([disc('create_campaign'), bU64(k.offerId), Buffer.from([0]), bU64(PER_QUERY), bU64(PER_ACCEPT), Buffer.from(k.targetHash), bU64(ESCROW)]) });
const delegateCampaignIx = (k) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: brand.publicKey, isSigner: false, isWritable: false },
  { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(k.c, PROGRAM), isSigner: false, isWritable: true },
  { pubkey: delegationRecordPdaFromDelegatedAccount(k.c), isSigner: false, isWritable: true },
  { pubkey: delegationMetadataPdaFromDelegatedAccount(k.c), isSigner: false, isWritable: true },
  { pubkey: k.c, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
  { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false },
  { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: Buffer.concat([disc('delegate_campaign'), bU64(k.offerId)]) });
const matchIx = (k, signer = agent) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: signer.publicKey, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true },
  { pubkey: traitsPda, isSigner: false, isWritable: false }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
  { pubkey: k.c, isSigner: false, isWritable: true }],
  // NEW ABI: match_query(target_undertone, target_depth, target_season, depth_tol, offer_salt[16]); no epoch (clock-derived), no nonce (enclave-derived), the enclave opens the commitment and computes the verdict itself.
  data: Buffer.concat([disc('match_query'), Buffer.from(k.shade), Buffer.from(k.offerSalt)]) });
const undelegateCampaignIx = (k) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: agent.publicKey, isSigner: true, isWritable: true }, { pubkey: k.c, isSigner: false, isWritable: true },
  { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }], data: disc('undelegate_campaign') });
const settleOfferIx = (k, offerHash, verdict, nonce) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: false }, { pubkey: k.c, isSigner: false, isWritable: true },
  { pubkey: k.e, isSigner: false, isWritable: true }, { pubkey: herAta, isSigner: false, isWritable: true },
  { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc('settle_offer'), Buffer.from(offerHash), Buffer.from([verdict]), Buffer.from(nonce)]) });
const closeCampaignIx = (k) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: brand.publicKey, isSigner: true, isWritable: true }, { pubkey: k.c, isSigner: false, isWritable: true },
  { pubkey: k.e, isSigner: false, isWritable: true }, { pubkey: brandAta, isSigner: false, isWritable: true },
  { pubkey: treasuryAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: CONFIG_PDA, isSigner: false, isWritable: false }], data: disc('close_campaign') });

// ── decoders ──
function decodePalette(buf) { let o = 8; o += 32; const n = buf.readUInt32LE(o); o += 4; o += n; o += 32;
  const query_count = buf.readUInt32LE(o); o += 4; const lifetime_queries = buf.readUInt32LE(o); o += 4; const epoch = buf.readUInt32LE(o); o += 4;
  const is_private = buf.readUInt8(o); o += 1; const last_verdict = buf.readUInt8(o); o += 1; const last_nonce = Buffer.from(buf.subarray(o, o + 16));
  return { query_count, lifetime_queries, epoch, is_private, last_verdict, last_nonce }; }
// Campaign (after 8-byte disc): queries@153 accepts@157 active@161 bump@162 answered@163 receipt@164 (24 bytes) answered_at@188 payee_commit@196
function decodeCampaign(buf) { return { queries: buf.readUInt32LE(153), answered: buf.readUInt8(163) === 1,
  receipt: Buffer.from(buf.subarray(164, 188)), payee_commit: Buffer.from(buf.subarray(196, 228)) }; }

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
async function waitCampaignUndelegated(k, timeoutMs = 60_000) { const t0 = Date.now();
  for (;;) { const i = await base.getAccountInfo(k.c); if (i && i.owner.equals(PROGRAM)) return i;
    if (Date.now() - t0 > timeoutMs) throw new Error('campaign not undelegated in time'); await new Promise((r) => setTimeout(r, 2000)); } }
const bal = async (ata) => { const i = await base.getAccountInfo(ata); return i ? Number(unpackAccount(ata, i).amount) : 0; };

let pass = true; const check = (label, ok) => { pass = pass && ok; console.log(`   ${ok ? '✓' : '✗'} ${label}`); };
console.log('program:', PROGRAM.toBase58());
console.log('her    :', owner.publicKey.toBase58(), '| agent:', agent.publicKey.toBase58(), '| brand:', brand.publicKey.toBase58());

console.log('\n[setup] fund; her palette+traits: init → set_night_rules(lifetime_cap=2) → delegate → seal private → bind traits. They STAY in the enclave.');
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 350_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: agent.publicKey, lamports: 120_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: outsider.publicKey, lamports: 120_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: brand.publicKey, lamports: 250_000_000 })), [deployer], opts);
await sendAndConfirmTransaction(base, new Transaction()
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, herAta, owner.publicKey, MINT))
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brand.publicKey, MINT))
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, treasuryAta, deployer.publicKey, MINT))
  .add(createMintToInstruction(MINT, brandAta, deployer.publicKey, 100_000_000)), [deployer], opts);
await sendAndConfirmTransaction(base, new Transaction().add(initPaletteIx(randomBytes(96))).add(initTraitsIx()), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(nightRulesIx(2, 0)), [owner], opts); // her cap: 2 distinct offers, default epoch
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: palettePda, lamports: 10_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: traitsPda, lamports: 10_000_000 })), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('palette')), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx('traits')), [owner], opts);
for (const kp of [owner, agent, outsider]) await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(kp.publicKey, 255), kp.publicKey, kp.publicKey, 40_000_000, 255)), [kp], opts);
{ const tee = await teeConn(owner); await sendOnEr(tee, [privacyIx('palette', agent.publicKey)], [owner], owner); await sendOnEr(tee, [privacyIx('traits', agent.publicKey)], [owner], owner); }
{ const tee = await teeConn(owner); await sendOnEr(tee, [setTraitsIx()], [owner], owner); }

// helper: create + delegate a campaign, run match_query in-ER, return the agent-read verdict/nonce
async function offer(tag, tu, td, ts, tol) {
  const k = campaignFor(BigInt(Date.now()) + BigInt(Math.floor(Math.random() * 1e6)), tu, td, ts, tol);
  await sendAndConfirmTransaction(base, new Transaction().add(createCampaignIx(k)), [brand], opts);
  await sendAndConfirmTransaction(base, new Transaction().add(delegateCampaignIx(k)), [brand], opts);
  const tee = await teeConn(agent); await sendOnEr(tee, [matchIx(k)], [agent], agent);
  const pv = decodePalette((await tee.getAccountInfo(palettePda)).data);
  return { k, tag, verdict: pv.last_verdict, nonce: pv.last_nonce, lifetime: pv.lifetime_queries };
}

console.log('\n[1] MATCH: brand commits her shade (cool/Monk8), agent asks in-enclave with NO target:');
const m = await offer('match', 2, 8, 3, 1);
check('agent-read verdict == MATCH(1)', m.verdict === 1);
check('her lifetime meter == 1 (one distinct offer)', m.lifetime === 1);

console.log('\n[grief] BUDGET GUARD: an outsider (not her agent) cannot spend her never-resetting budget:');
try { const tee = await teeConn(outsider); await sendOnEr(tee, [matchIx(m.k, outsider)], [outsider], outsider); check('outsider match_query rejected', false); }
catch (e) { check('outsider match_query rejected (UnauthorizedAgent)', /failed|custom program error/i.test(String(e.message))); }

console.log('\n[L1] IDEMPOTENCY: re-query the SAME offer: a free no-op, meter unchanged:');
{ const tee = await teeConn(agent); await sendOnEr(tee, [matchIx(m.k)], [agent], agent);
  const pv = decodePalette((await tee.getAccountInfo(palettePda)).data);
  const cv = decodeCampaign((await tee.getAccountInfo(m.k.c)).data);
  check('her lifetime meter still 1 (repeat cost nothing)', pv.lifetime_queries === 1);
  check('campaign.queries still 1', cv.queries === 1); }
{ const tee = await teeConn(agent); await sendOnEr(tee, [undelegateCampaignIx(m.k)], [agent], agent); }
const mBase = decodeCampaign((await waitCampaignUndelegated(m.k)).data);
check('base: matched campaign payee_commit == sha256(her‖nonce)', mBase.payee_commit.equals(sha(owner.publicKey.toBuffer(), m.nonce)));

console.log('\n[L2] BOUND QUERY: a campaign committing a DIFFERENT shade (warm) → no-match; agent cannot probe her space:');
const n = await offer('nomatch', 0, 8, 3, 1);
check('agent-read verdict == NO-MATCH(0)', n.verdict === 0);
check('her lifetime meter == 2', n.lifetime === 2);
{ const tee = await teeConn(agent); await sendOnEr(tee, [undelegateCampaignIx(n.k)], [agent], agent); }
const nBase = decodeCampaign((await waitCampaignUndelegated(n.k)).data);

console.log('\n[L5] HIDDEN NO-MATCH: base learns nothing from a no-match:');
check('no-match payee_commit == 0 (no wallet link leaks)', nBase.payee_commit.equals(Buffer.alloc(32)));
check('receipt is present but opaque (verdict not recoverable without the private nonce)', !nBase.receipt.equals(Buffer.alloc(24)));

console.log('\n[L4] HER-SET CAP: she capped herself at 2 distinct offers; a 3rd is rejected in-enclave:');
try { await offer('third', 2, 8, 3, 1); check('3rd distinct offer rejected', false); }
catch (e) { check('3rd distinct offer rejected (LifetimeBudgetExceeded)', /failed|0x1775|custom program error/i.test(String(e.message))); }

console.log('\n[settle] the MATCH authorizes payout; forgery is rejected:');
const her0 = await bal(herAta);
await sendAndConfirmTransaction(base, new Transaction().add(settleOfferIx(m.k, m.k.targetHash, 1, m.nonce)), [brand], opts);
check(`her received ${usd(PER_ACCEPT)} from the brand's escrow`, (await bal(herAta)) - her0 === PER_ACCEPT);
try { await sendAndConfirmTransaction(base, new Transaction().add(settleOfferIx(m.k, m.k.targetHash, 1, m.nonce)), [brand], opts); check('double-settle rejected', false); }
catch { check('double-settle rejected (AlreadySettled)', true); }
try { await sendAndConfirmTransaction(base, new Transaction().add(settleOfferIx(m.k, m.k.targetHash, 1, randomBytes(16))), [brand], opts); check('forged-nonce settle rejected', false); }
catch { check('forged-nonce settle rejected (ReceiptMismatch)', true); }
try { await sendAndConfirmTransaction(base, new Transaction().add(settleOfferIx(m.k, randomBytes(32), 1, m.nonce)), [brand], opts); check('wrong-offer settle rejected', false); }
catch { check('wrong-offer settle rejected (OfferMismatch)', true); }

console.log('\n[L3$] TREASURY SWEEP: closing the no-match campaign forfeits its query stake to the treasury:');
const treas0 = await bal(treasuryAta), brandBefore = await bal(brandAta);
await sendAndConfirmTransaction(base, new Transaction().add(closeCampaignIx(n.k)), [brand], opts);
check(`treasury collected the ${usd(PER_QUERY)} query stake`, (await bal(treasuryAta)) - treas0 === PER_QUERY);
check('brand refunded the unspent escrow', (await bal(brandAta)) - brandBefore === ESCROW - PER_QUERY);

console.log('\n[enclave] her Palette NEVER left the enclave:');
check('palette still delegation-owned on base', (await base.getAccountInfo(palettePda)).owner.equals(DELEGATION_PROGRAM_ID));

console.log('\n────────── RESULT ──────────');
console.log(pass
  ? 'PASS ✓, Model B holds end-to-end: the agent can only ask committed, escrowed offers (L2), repeats are free (L1), a no-match leaks neither verdict nor wallet (L5), she caps her own repeat-query budget (L4), a real match pays her while forgeries are rejected, and her Palette never leaves the TEE.'
  : 'CHECK: a sub-assertion failed; inspect above.');
console.log('her palette:', EX(palettePda));
process.exit(pass ? 0 : 1);
