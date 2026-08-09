// Phase-0 Spike A — ER private-read semantics.
// Question (Fable Attack 1): once a Palette is sealed private (EphemeralPermission
// whitelists ONE reader = the agent), can a NON-whitelisted key still RPC-read the
// account's plaintext from the TEE? If yes, the agent server (and anyone with a token)
// can dump traits — the query budget bounds brands, not the key holder. If no, the
// whitelist genuinely gates reads and the plaintext-in-ER design is sound as-is.
//
// Method: seal a fresh Palette private (whitelist AGENT), then getAccountInfo(palette)
//   (1) from the whitelisted AGENT token, (2) from a random OUTSIDER token, (3) from base.
// Run from client/:  node spike-read-semantics.mjs
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction, SystemProgram } from '@solana/web3.js';
import {
  getAuthToken, permissionPdaFromAccount,
  delegateBufferPdaFromDelegatedAccountAndOwnerProgram, delegationRecordPdaFromDelegatedAccount, delegationMetadataPdaFromDelegatedAccount,
  EPHEMERAL_VAULT_ID, MAGIC_PROGRAM_ID, PERMISSION_PROGRAM_ID, DELEGATION_PROGRAM_ID,
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
const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('../keys/oira-deployer.json', 'utf8'))));
const owner = Keypair.generate();
const agent = Keypair.generate();      // the ONE whitelisted reader
const outsider = Keypair.generate();   // NOT whitelisted

const disc = (n) => createHash('sha256').update(`global:${n}`).digest().subarray(0, 8);
const bBytes = (b) => { const l = Buffer.alloc(4); l.writeUInt32LE(b.length, 0); return Buffer.concat([l, Buffer.from(b)]); };
const palettePda = PublicKey.findProgramAddressSync([Buffer.from('palette'), owner.publicKey.toBuffer()], PROGRAM)[0];
const permPda = permissionPdaFromAccount(palettePda);

const initIx = (enc) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: SYS, isSigner: false, isWritable: false }], data: Buffer.concat([disc('init_palette'), bBytes(enc)]) });
const delegateIx = () => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
  { pubkey: delegateBufferPdaFromDelegatedAccountAndOwnerProgram(palettePda, PROGRAM), isSigner: false, isWritable: true },
  { pubkey: delegationRecordPdaFromDelegatedAccount(palettePda), isSigner: false, isWritable: true },
  { pubkey: delegationMetadataPdaFromDelegatedAccount(palettePda), isSigner: false, isWritable: true },
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: PROGRAM, isSigner: false, isWritable: false },
  { pubkey: DELEGATION_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: SYS, isSigner: false, isWritable: false }, { pubkey: TEE_VALIDATOR, isSigner: false, isWritable: false }], data: disc('delegate_palette') });
const setPrivacyIx = (reader) => new TransactionInstruction({ programId: PROGRAM, keys: [
  { pubkey: owner.publicKey, isSigner: true, isWritable: true }, { pubkey: owner.publicKey, isSigner: false, isWritable: false },
  { pubkey: palettePda, isSigner: false, isWritable: true }, { pubkey: permPda, isSigner: false, isWritable: true },
  { pubkey: EPHEMERAL_VAULT_ID, isSigner: false, isWritable: true }, { pubkey: MAGIC_PROGRAM_ID, isSigner: false, isWritable: false }, { pubkey: PERMISSION_PROGRAM_ID, isSigner: false, isWritable: false }], data: Buffer.concat([disc('set_palette_privacy'), reader.toBuffer(), Buffer.from([1])]) });

const base = new Connection(BASE_RPC, 'confirmed');
const opts = { commitment: 'confirmed', maxRetries: 5 };
async function teeConn(kp) { const { token } = await getAuthToken(TEE_RPC, kp.publicKey, (m) => Promise.resolve(nacl.sign.detached(m, kp.secretKey))); return new Connection(`${TEE_RPC}?token=${token}`, 'confirmed'); }
async function sendOnEr(tee, ixs, signers, feePayer) {
  const tx = new Transaction().add(...ixs); tx.feePayer = feePayer.publicKey;
  const w = new Set([feePayer.publicKey.toBase58()]); for (const ix of tx.instructions) for (const k of ix.keys) if (k.isWritable) w.add(k.pubkey.toBase58());
  const r = await (await fetch(tee.rpcEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhashForAccounts', params: [[...w]] }) })).json();
  const bh = r.result.value; tx.recentBlockhash = bh.blockhash; tx.lastValidBlockHeight = bh.lastValidBlockHeight; tx.sign(...signers);
  const sig = await tee.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  await tee.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
  return sig;
}
// decode the plaintext fields that sit right after the enc blob (query_count, epoch, ... is_private)
function decode(buf) {
  if (!buf) return null;
  try { let o = 8; o += 32; const encLen = buf.readUInt32LE(o); o += 4; o += encLen;
    const query_count = buf.readUInt32LE(o); o += 4; const epoch = buf.readUInt32LE(o); o += 4; const last_match = buf.readUInt8(o); o += 1; o += 32;
    const is_private = buf.readUInt8(o);
    return { bytes: buf.length, encLen, query_count, epoch, last_match, is_private }; } catch (e) { return { bytes: buf.length, decodeError: e.message }; }
}
async function tryRead(label, conn) {
  try { const ai = await conn.getAccountInfo(palettePda); if (!ai) return { label, result: 'null (no data returned)' };
    return { label, result: 'DATA RETURNED', decoded: decode(ai.data), owner: ai.owner.toBase58() }; }
  catch (e) { return { label, result: 'ERROR / blocked', error: String(e.message || e).slice(0, 160) }; }
}

console.log('palette :', palettePda.toBase58());
console.log('agent   :', agent.publicKey.toBase58(), '(whitelisted reader)');
console.log('outsider:', outsider.publicKey.toBase58(), '(NOT whitelisted)');

await sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: owner.publicKey, lamports: 220_000_000 })), [deployer], opts);
console.log('\n[1] init + delegate + seal private (whitelist agent only)…');
await sendAndConfirmTransaction(base, new Transaction().add(initIx(randomBytes(96))), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: palettePda, lamports: 10_000_000 })), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(delegateIx()), [owner], opts);
await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrowPdaFromEscrowAuthority(owner.publicKey, 255), owner.publicKey, owner.publicKey, 30_000_000, 255)), [owner], opts);
{ const tee = await teeConn(owner); await sendOnEr(tee, [setPrivacyIx(agent.publicKey)], [owner], owner); }
console.log('   ✓ sealed private');

console.log('\n[2] read attempts on the SAME sealed private Palette:');
const results = [];
results.push(await tryRead('AGENT token (whitelisted)', await teeConn(agent)));
results.push(await tryRead('OUTSIDER token (not whitelisted)', await teeConn(outsider)));
results.push(await tryRead('BASE RPC (public devnet)', base));
for (const r of results) console.log('  •', JSON.stringify(r));

console.log('\n────────── SPIKE A VERDICT ──────────');
const agentR = results[0], outR = results[1];
const agentSees = agentR.result === 'DATA RETURNED' && agentR.decoded && agentR.decoded.is_private !== undefined;
const outsiderSees = outR.result === 'DATA RETURNED' && outR.decoded && outR.decoded.encLen === 96;
if (agentSees && !outsiderSees) console.log('GATED ✓ — whitelisted agent reads plaintext; the outsider is blocked. Plaintext-in-ER is genuinely gated by the whitelist. The agent key is the only residual reader (custody matters); design as planned + bucket traits.');
else if (outsiderSees) console.log('NOT GATED ✗ — an outsider RPC-read the sealed plaintext. Anyone with a token can dump traits. MUST store traits BUCKETED (categories, not raw) and/or keep the agent key on-device; disclose the trusted-read surface. Private receipts still required.');
else console.log('INCONCLUSIVE — inspect the raw results above (agentSees=' + agentSees + ', outsiderSees=' + outsiderSees + ').');
console.log('palette:', `https://explorer.solana.com/address/${palettePda.toBase58()}?cluster=devnet`);
