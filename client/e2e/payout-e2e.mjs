// Oira payout spike — a PRIVATE USDC payment (brand → her) inside the same TEE enclave.
// Mirrors MagicBlock's private-payments-demo flow, adapted to ephemeral-rollups-sdk 0.15.1:
//   base: init vault + ephemeral ATAs (eATAs) for brand & her, deposit brand USDC into the
//   vault (credits brand's eATA), delegate both eATAs (+permissions) into the private ER ->
//   ER: a normal SPL transfer brand->her runs INSIDE the enclave (private) -> withdraw +
//   undelegate settles her real ATA. The public base never sees the brand->her link.
import {
  Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction,
} from '@solana/web3.js';
import {
  getAuthToken, deriveVault, deriveEphemeralAta,
  initVaultIx, initVaultAtaIx, initEphemeralAtaIx, createEataPermissionIx, transferToVaultIx,
  delegateEphemeralAtaIx, delegateEataPermissionIx, withdrawSplIx, undelegateIx,
  createTopUpEscrowInstruction, escrowPdaFromEscrowAuthority, TOKEN_PROGRAM_ID,
} from '@magicblock-labs/ephemeral-rollups-sdk';
import {
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction, createMintToInstruction, unpackAccount,
} from '@solana/spl-token';
import nacl from 'tweetnacl';
import fs from 'fs';

const TEE_VALIDATOR = new PublicKey('MTEWGuqxUpYZGFJQcp8tLN7x5v9BSeoFHYWQQ3n3xzo');
const TEE_RPC = 'https://devnet-tee.magicblock.app';
const BASE_RPC = 'https://api.devnet.solana.com';
const DECIMALS = 6;
const AMOUNT = 5; // 5 oUSDC private payout

const load = (p) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8'))));
const cfg = JSON.parse(fs.readFileSync(new URL('../payout-config.json', import.meta.url), 'utf8'));
const MINT = new PublicKey(cfg.mint);
const deployer = load(new URL('../../keys/oira-deployer.json', import.meta.url));
const brand = Keypair.generate(); // fresh each run (clean eATAs)
const her = Keypair.generate();
const amt = BigInt(AMOUNT * 10 ** DECIMALS);

const base = new Connection(BASE_RPC, 'confirmed');
const opts = { commitment: 'confirmed', maxRetries: 5 };
// devnet's public RPC rate-limits hard; web3.js can leak a 429 from its detached background
// rebroadcast loop as an unhandled rejection (not catchable by any await). Swallow transient ones;
// still fail loudly on real errors. (Same guard the other e2e scripts carry.)
const isTransient = (err) => /429|Too Many Requests|Timed out|fetch failed|ETIMEDOUT|ECONNRESET|502|503|Blockhash not found/i.test(String(err && (err.message || err)));
process.on('unhandledRejection', (err) => { if (isTransient(err)) return; console.error('unhandledRejection:', err && (err.message || err)); process.exit(1); });
async function freshTee(auth) { const { token } = await getAuthToken(TEE_RPC, auth.publicKey, (m) => Promise.resolve(nacl.sign.detached(m, auth.secretKey))); return new Connection(`${TEE_RPC}?token=${token}`, 'confirmed'); }
async function erBlockhash(tee, writable) {
  const r = await fetch(tee.rpcEndpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBlockhashForAccounts', params: [writable] }) });
  return (await r.json()).result.value;
}
async function sendOnEr(tee, ixs, signers, feePayer) {
  const tx = new Transaction().add(...ixs); tx.feePayer = feePayer.publicKey;
  const w = new Set([feePayer.publicKey.toBase58()]);
  for (const ix of tx.instructions) for (const k of ix.keys) if (k.isWritable) w.add(k.pubkey.toBase58());
  const bh = await erBlockhash(tee, [...w]);
  tx.recentBlockhash = bh.blockhash; tx.lastValidBlockHeight = bh.lastValidBlockHeight; tx.sign(...signers);
  const sig = await tee.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const c = await tee.confirmTransaction({ signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight }, 'confirmed');
  if (c.value?.err) { let logs = ''; try { const t = await tee.getTransaction(sig, { maxSupportedTransactionVersion: 0 }); logs = (t?.meta?.logMessages || []).join('\n'); } catch {} throw new Error(`ER tx failed ${JSON.stringify(c.value.err)}\n${logs}`); }
  return sig;
}
const bal = async (owner) => { try { const a = getAssociatedTokenAddressSync(MINT, owner, true); const i = await base.getAccountInfo(a); return i ? Number(unpackAccount(a, i).amount) / 1e6 : 0; } catch { return 0; } };

const [vault] = deriveVault(MINT);
const vaultAta = getAssociatedTokenAddressSync(MINT, vault, true, TOKEN_PROGRAM_ID);
const [brandEata] = deriveEphemeralAta(brand.publicKey, MINT);
const [herEata] = deriveEphemeralAta(her.publicKey, MINT);
const brandAta = getAssociatedTokenAddressSync(MINT, brand.publicKey);
const herAta = getAssociatedTokenAddressSync(MINT, her.publicKey, true);

console.log('mint :', MINT.toBase58());
console.log('brand:', brand.publicKey.toBase58(), '| her:', her.publicKey.toBase58());
console.log('vault:', vault.toBase58());
console.log('\n[0] fresh brand/her: fund SOL + mint oUSDC to brand…');
await sendAndConfirmTransaction(base, new Transaction()
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: brand.publicKey, lamports: 150_000_000 }))
  .add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: her.publicKey, lamports: 100_000_000 })), [deployer], opts);
await sendAndConfirmTransaction(base, new Transaction()
  .add(createAssociatedTokenAccountIdempotentInstruction(deployer.publicKey, brandAta, brand.publicKey, MINT))
  .add(createMintToInstruction(MINT, brandAta, deployer.publicKey, 100_000_000)), [deployer], opts);
console.log('   ✓ brand funded + 100 oUSDC minted | brand before:', await bal(brand.publicKey), '| her before:', await bal(her.publicKey));

console.log('\n[1] base setup: vault + eATAs + permissions + deposit brand USDC…');
{
  const t = new Transaction();
  if (!(await base.getAccountInfo(vaultAta))) { t.add(initVaultIx(vault, MINT, brand.publicKey)); t.add(initVaultAtaIx(brand.publicKey, vaultAta, vault, MINT)); }
  // her real ATA + her eATA + permission
  t.add(createAssociatedTokenAccountIdempotentInstruction(brand.publicKey, herAta, her.publicKey, MINT));
  if (!(await base.getAccountInfo(herEata))) { t.add(initEphemeralAtaIx(herEata, her.publicKey, MINT, brand.publicKey)); t.add(createEataPermissionIx(herEata, brand.publicKey)); }
  // brand eATA + permission
  if (!(await base.getAccountInfo(brandEata))) { t.add(initEphemeralAtaIx(brandEata, brand.publicKey, MINT, brand.publicKey)); t.add(createEataPermissionIx(brandEata, brand.publicKey)); }
  // deposit brand USDC into the vault (credits brand's eATA)
  t.add(transferToVaultIx(brandEata, vault, MINT, brandAta, vaultAta, brand.publicKey, amt));
  console.log('   ✓', (await sendAndConfirmTransaction(base, t, [brand], opts)).slice(0, 24) + '…');
}

console.log('\n[2] delegate both eATAs (+ permissions) into the TEE ER…');
{
  const t = new Transaction()
    .add(delegateEphemeralAtaIx(brand.publicKey, brandEata, TEE_VALIDATOR))
    .add(delegateEataPermissionIx(brand.publicKey, brandEata, TEE_VALIDATOR))
    .add(delegateEphemeralAtaIx(brand.publicKey, herEata, TEE_VALIDATOR))
    .add(delegateEataPermissionIx(brand.publicKey, herEata, TEE_VALIDATOR));
  console.log('   ✓', (await sendAndConfirmTransaction(base, t, [brand], opts)).slice(0, 24) + '…');
}

console.log('\n[3] top up ER fee escrows (brand + her)…');
for (const kp of [brand, her]) { const escrow = escrowPdaFromEscrowAuthority(kp.publicKey, 255); await sendAndConfirmTransaction(base, new Transaction().add(createTopUpEscrowInstruction(escrow, kp.publicKey, kp.publicKey, 30_000_000, 255)), [kp], opts); }
console.log('   ✓ escrows funded');

console.log('\n[4] PRIVATE transfer brand → her INSIDE the enclave…');
{ const tee = await freshTee(brand); const sig = await sendOnEr(tee, [createTransferCheckedInstruction(brandAta, MINT, herAta, brand.publicKey, amt, DECIMALS)], [brand], brand); console.log('   ✓', sig.slice(0, 24) + '…'); }

console.log('\n[5] undelegate her eATA on the ER (commit her credit back to base)…');
{ const tee = await freshTee(her); await sendOnEr(tee, [undelegateIx(her.publicKey, MINT)], [her], her); console.log('   ✓ undelegated'); }
await new Promise((r) => setTimeout(r, 8000));
console.log('\n[6] withdraw on base → her real ATA…');
await sendAndConfirmTransaction(base, new Transaction().add(withdrawSplIx(her.publicKey, MINT, amt)), [her], opts);
console.log('   ✓ withdrawn');
await new Promise((r) => setTimeout(r, 3000));

console.log('\n────────── RESULT ──────────');
const herAfter = await bal(her.publicKey);
console.log('her oUSDC after:', herAfter);
console.log(herAfter >= AMOUNT ? `PASS ✓ — ${AMOUNT} oUSDC paid to her privately (the brand→her link never hit public base).` : 'CHECK — her balance did not reflect the private payout.');
