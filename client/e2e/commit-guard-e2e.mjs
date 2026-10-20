// Only her, her agent or the brand can commit or undelegate their accounts in the rollup.
// Run from client/ with a funded devnet key:  node e2e/commit-guard-e2e.mjs
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
  { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: RENT, isSigner: false, isWritable: false }],
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
  { pubkey: treasuryAta, isSigner: false, isWritable: true }, { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }], data: disc('close_campaign') });

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
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 200_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: agent.publicKey, lamports: 50_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: outsider.publicKey, lamports: 60_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: brand.publicKey, lamports: 120_000_000 })), [deployer], opts);
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


const DELEG = DELEGATION_PROGRAM_ID.toBase58();
const ownerOf = async (pk) => (await base.getAccountInfo(pk))?.owner.toBase58();
const waitOwner = async (pk, want, ms = 60_000) => { const t0 = Date.now(); let o; while (Date.now() - t0 < ms) { o = await ownerOf(pk); if (o === want) return o; await new Promise((r) => setTimeout(r, 2000)); } return o; };
const tryEr = async (kp, ixs) => { try { const tee = await teeConn(kp); await sendOnEr(tee, ixs, [kp], kp); return true; } catch { return false; } };
const commitIx = (name, payer, acct) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: payer.publicKey, isSigner: true, isWritable: true }, { pubkey: acct, isSigner: false, isWritable: true },
  { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }], data: disc(name) });

console.log('\n[palette] an outsider cannot push her palette out of the rollup:');
check('outsider undelegate_palette is refused', !(await tryEr(outsider, [commitIx('undelegate_palette', outsider, palettePda)])));
check('outsider commit_receipt is refused', !(await tryEr(outsider, [commitIx('commit_receipt', outsider, palettePda)])));
await new Promise((r) => setTimeout(r, 6000));
check('her palette is still in the rollup', (await ownerOf(palettePda)) === DELEG);

console.log('\n[campaign] an unanswered campaign: outsiders refused, the brand allowed:');
const k = campaignFor(BigInt(Date.now()), 2, 8, 3, 1);
await sendAndConfirmTransaction(base, new Transaction().add(createCampaignIx(k)), [brand], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateCampaignIx(k)), [brand], opts);
await waitOwner(k.c, DELEG, 30_000);
check('outsider undelegate_campaign is refused', !(await tryEr(outsider, [commitIx('undelegate_campaign', outsider, k.c)])));
check('her agent cannot undelegate an unanswered campaign', !(await tryEr(agent, [commitIx('undelegate_campaign', agent, k.c)])));
check('the brand can undelegate its own campaign', await tryEr(brand, [commitIx('undelegate_campaign', brand, k.c)]));
check('the campaign is back on base', (await waitOwner(k.c, PROGRAM.toBase58())) === PROGRAM.toBase58());

console.log('\n[palette] she can still undelegate her own palette:');
check('her undelegate_palette is accepted', await tryEr(owner, [commitIx('undelegate_palette', owner, palettePda)]));
check('her palette is back on base', (await waitOwner(palettePda, PROGRAM.toBase58())) === PROGRAM.toBase58());

// hand leftover devnet SOL back to the sponsor
for (const kp of [owner, agent, outsider, brand]) { try { const b = await base.getBalance(kp.publicKey); if (b > 10_000) await sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: kp.publicKey, toPubkey: deployer.publicKey, lamports: b - 5_000 })), [kp], opts); } catch {} }
console.log(pass ? '\nALL GREEN' : '\nFAILED');
process.exit(pass ? 0 : 1);
