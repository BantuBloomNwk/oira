// Oira "protocol, not app" proof — ONE sealed Palette, queried by TWO different apps.
// She seals her Palette once. A beauty app (Lumière) and an unrelated eyewear app
// (Silhouette) each run a match against the SAME sealed Palette, with different
// questions, each signed by its own app key — and neither ever sees her traits.
import {
  Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAuthToken, permissionPdaFromAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram,
  delegationRecordPdaFromDelegatedAccount, delegationMetadataPdaFromDelegatedAccount,
  EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, MAGIC_CONTEXT_ID, PERMISSION_PROGRAM_ID, DELEGATION_PROGRAM_ID,
  createTopUpEscrowInstruction, escrowPdaFromEscrowAuthority,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import { createHash, randomBytes } from 'crypto';
import nacl from 'tweetnacl';
import fs from 'fs';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const TEE_VALIDATOR = new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
const TEE_RPC = 'https://devnet-tee.magicblock.app';
const BASE_RPC = 'https://api.devnet.solana.com';
const SYS = new PublicKey('11111111111111111111111111111111');
const EX = (v) => `https://explorer.solana.com/address/${v}?cluster=devnet`;

const load = (p) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8'))));
const deployer = load('../keys/oira-deployer.json');
const owner = Keypair.generate();
const lumiere = Keypair.generate();   // consumer app A — a foundation brand
const silhouette = Keypair.generate(); // consumer app B — an unrelated eyewear brand

const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const bBytes = (b) => { const l = Buffer.alloc(4); l.writeUInt32LE(b.length, 0); return Buffer.concat([l, Buffer.from(b)]); };
const bU32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n, 0); return b; };
const bU64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };
const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), owner.publicKey.toBuffer()], PROGRAM)[0];
const permPda = permissionPdaFromAccount(palettePda);
const offerHash = (s) => createHash('sha256').update(s).digest();

const initIx = (enc) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false },
], data: Buffer.concat([disc('init_palette'), bBytes(enc)]) });
const delegateIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
  { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(palettePda, PROGRAM), isSigner: false, isWritable: true },
  { pubkey: delegationRecordPdaFromDelegatedAccount(palettePda), isSigner: false, isWritable: true },
  { pubkey: delegationMetadataPdaFromDelegatedAccount(palettePda), isSigner: false, isWritable: true },
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
  { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false },
], data: disc('delegate_palette') });
const setPrivacyIx = (reader) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: permPda, isSigner: false, isWritable: true },
  { pubkey: EPHEMERAL_VAULT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: PERMISSION_PROGRAM_ID, isSigner: false, isWritable: false },
], data: Buffer.concat([disc('set_palette_privacy'), reader.toBuffer(), Buffer.from([1])]) });
// match_query(epoch, offer_hash, matched, offer_payout, offer_category) — current 5-arg signature.
const matchIx = (app, epoch, oh) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: app.publicKey, isSigner: true, isWritable: false }, { pubkey: palettePda, isSigner: false, isWritable: true },
], data: Buffer.concat([disc('match_query'), bU32(epoch), Buffer.from(oh), Buffer.from([1]), bU64(5_000_000), Buffer.from([0])]) });
const undelegateIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: MAGIC_CONTEXT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false },
], data: disc('undelegate_palette') });

function readPalette(buf) { if (!buf) return null; let o = 8; o += 32; const n = buf.readUInt32LE(o); o += 4; o += n; const query_count = buf.readUInt32LE(o); o += 4; const epoch = buf.readUInt32LE(o); o += 4; const last_match = buf.readUInt8(o) === 1; o += 1; o += 32; const is_private = buf.readUInt8(o) === 1; return { query_count, epoch, last_match, is_private, encLen: n }; }

const base = new Connection(BASE_RPC, 'confirmed');
const opts = { commitment: 'confirmed', maxRetries: 5 };
async function freshTee(a) { const { token } = await getAuthToken(TEE_RPC, a.publicKey, (m) => Promise.resolve(nacl.sign.detached(m, a.secretKey))); return new Connection(`${TEE_RPC}?token=${token}`, 'confirmed'); }
async function sendOnEr(tee, ixs, signers, feePayer) {
  const tx = new Transaction().add(...ixs); tx.feePayer = feePayer.publicKey;
  const w = new Set([feePayer.publicKey.toBase58()]); for (const ix of tx.instructions) for (const k of ix.keys) if (k.isWritable) w.add(k.pubkey.toBase58());
  const r = await (await fetch(tee.rpcEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhashForAccounts', params: [[...w]] }) })).json();
  const bh = r.result.value; tx.recentBlockhash = bh.blockhash; tx.lastValidBlockHeight = bh.lastValidBlockHeight; tx.sign(...signers);
  const sig = await tee.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const c = await tee.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
  if (c.value?.err) { let logs = ''; try { const t = await tee.getTransaction(sig, { maxSupportedTransactionVersion: 0 }); logs = (t?.meta?.logMessages || []).join('\n'); } catch {} throw new Error(`ER tx failed ${JSON.stringify(c.value.err)}\n${logs}`); }
  return sig;
}

console.log('owner (her)      :', owner.publicKey.toBase58());
console.log('app A · Lumière  :', lumiere.publicKey.toBase58(), '(foundation brand)');
console.log('app B · Silhouette:', silhouette.publicKey.toBase58(), '(eyewear brand — unrelated)');
console.log('palette          :', palettePda.toBase58());

console.log('\n[1] she seals her Palette once (fund, init, delegate → TEE, escrows, set-private)…');
await sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 220_000_000 })), [deployer], opts);
await sendAndConfirmTransaction(base, new Transaction().add(initIx(randomBytes(96))), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: palettePda, lamports: 10_000_000 })), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx()), [owner], opts);
for (const kp of [owner, lumiere, silhouette]) {
  await sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: kp.publicKey, lamports: 40_000_000 })), [deployer], opts).catch(() => {});
  await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(kp.publicKey, 255), kp.publicKey, kp.publicKey, 30_000_000, 255)), [kp], opts);
}
{ const tee = await freshTee(owner); await sendOnEr(tee, [setPrivacyIx(owner.publicKey)], [owner], owner); }
console.log('   ✓ Palette sealed private in the enclave');

console.log('\n[2] app A (Lumière) queries the sealed Palette — "does my foundation suit her?"…');
{ const tee = await freshTee(lumiere); const s = await sendOnEr(tee, [matchIx(lumiere, 1, offerHash('lumiere:foundation:cool-deep'))], [lumiere], lumiere); console.log('   ✓ match answered', s.slice(0, 16) + '…'); }

console.log('\n[3] app B (Silhouette, a totally different app) queries the SAME Palette — "do these frames suit her?"…');
{ const tee = await freshTee(silhouette); const s = await sendOnEr(tee, [matchIx(silhouette, 1, offerHash('silhouette:eyewear:warm-round'))], [silhouette], silhouette); console.log('   ✓ match answered', s.slice(0, 16) + '…'); }

console.log('\n[4] commit + verify…');
{ const tee = await freshTee(owner); await sendOnEr(tee, [undelegateIx()], [owner], owner); }
await new Promise((r) => setTimeout(r, 6000));
const fin = readPalette((await base.getAccountInfo(palettePda))?.data);

console.log('\n────────── RESULT ──────────');
console.log('palette after two different apps queried it:', fin);
const pass = fin?.query_count === 2 && fin?.is_private && fin?.encLen === 96;
console.log(pass
  ? 'PASS ✓ — one sealed Palette, two different consumer apps each got an answer, each signed by its own key; her traits stayed a private encrypted blob the whole time. The Palette is a reusable primitive.'
  : 'CHECK — expected query_count 2 on a private Palette; inspect above.');
console.log('palette:', EX(palettePda.toBase58()));
