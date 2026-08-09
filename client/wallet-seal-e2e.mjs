// Headless proof of the CONNECTED-WALLET relayed seal (assurance='wallet') — VERIFICATION.md row 2.
// A connected external wallet is SELF-FUNDED: unlike a device-key sign-in, Oira does NOT sponsor her
// shortfall (sealPaletteRelay's selfFunded branch). Two cases:
//   A) a FUNDED wallet self-funds and seals — she pays her own rent/escrow, the palette lands
//      delegated into the enclave, her == her wallet, and her balance actually drops (not sponsored).
//   B) an UNDERFUNDED wallet is REJECTED loudly BEFORE anything is sealed — ensureOwnerFunds throws an
//      actionable error naming the shortfall SOL + her address, and no palette exists on base (no
//      silent sponsor, no half-seal). This is the regression this test exists to catch.
// Run from client/:  node wallet-seal-e2e.mjs
import nacl from 'tweetnacl';
import fs from 'fs';
import { Keypair, Connection, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { sealPaletteRelay } from './oira-chain.mjs';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const base = new Connection(process.env.OIRA_BASE_RPC || 'https://api.devnet.solana.com', 'confirmed');
const opts = { commitment: 'confirmed', maxRetries: 5 };
// devnet's public RPC rate-limits hard; swallow the detached-429 rejections web3.js leaks, fail loud otherwise.
const isTransient = (e) => /429|Too Many Requests|Timed out|fetch failed|ETIMEDOUT|ECONNRESET|502|503|Blockhash not found/i.test(String(e && (e.message || e)));
process.on('unhandledRejection', (e) => { if (isTransient(e)) return; console.error('unhandledRejection:', e && (e.message || e)); process.exit(1); });

const deployer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(new URL('../keys/oira-deployer.json', import.meta.url)))));
const SOL = 1e9;
const walletSign = (kp) => async (msg) => nacl.sign.detached(new Uint8Array(msg), kp.secretKey);
const palettePda = (ownerPk) => PublicKey.findProgramAddressSync([Buffer.from('palette'), new PublicKey(ownerPk).toBuffer()], PROGRAM)[0];
let pass = true; const check = (label, ok) => { pass = pass && ok; console.log(`   ${ok ? '✓' : '✗'} ${label}`); };

console.log('=== A) a FUNDED connected wallet self-funds and seals ===');
{
  const w = Keypair.generate();
  // she has her own SOL (the deployer stands in for her funding herself); generous enough to cover
  // the ~0.13 SOL of rent + ER escrow her OWN instructions debit under assurance='wallet'.
  await sendAndConfirmTransaction(base, new Transaction().add(SystemProgram.transfer({ fromPubkey: deployer.publicKey, toPubkey: w.publicKey, lamports: 0.25 * SOL })), [deployer], opts);
  const before = await base.getBalance(w.publicKey);
  const r = await sealPaletteRelay({ ownerPubkey: w.publicKey.toBase58(), traits: { undertone: 2, depth: 8, season: 3 }, lifetimeCap: 2, assurance: 'wallet', sign: walletSign(w) });
  const after = await base.getBalance(w.publicKey);
  const info = await base.getAccountInfo(new PublicKey(r.palette));
  check('seal completed (sealSig set)', !!r.sealSig);
  check('palette exists + delegated into the enclave', !!info && info.owner.toBase58().startsWith('DELeG'));
  check('her == her wallet', r.her === w.publicKey.toBase58());
  check('she SELF-FUNDED — her balance dropped (NOT sponsored)', after < before - 50_000_000);
  console.log('   spent from her own wallet:', ((before - after) / SOL).toFixed(4), 'SOL');
}

console.log('\n=== B) an UNDERFUNDED connected wallet is rejected loudly (nothing sealed) ===');
{
  const w = Keypair.generate(); // 0 balance — cannot cover the seal
  const pda = palettePda(w.publicKey.toBase58());
  let threw = null;
  try { await sealPaletteRelay({ ownerPubkey: w.publicKey.toBase58(), traits: { undertone: 2, depth: 8, season: 3 }, assurance: 'wallet', sign: walletSign(w) }); }
  catch (e) { threw = e; }
  check('seal was rejected (threw), not silently sponsored', !!threw);
  const msg = threw ? String(threw.message || threw) : '';
  check('error names the connected-wallet shortfall', /connected wallet needs|add at least/i.test(msg));
  check('error names SOL + her exact address', /SOL/.test(msg) && msg.includes(w.publicKey.toBase58()));
  const info = await base.getAccountInfo(pda);
  check('NOTHING was sealed — no palette account on base', info === null);
  if (threw) console.log('   error was:', msg.slice(0, 150));
}

console.log('\n────────── RESULT ──────────');
console.log(pass
  ? 'PASS ✓ — the connected-wallet seal SELF-FUNDS when she can pay (palette delegated, her balance spent, no sponsor), and FAILS LOUDLY with an actionable shortfall + her address when she cannot (no silent sponsor, no partial seal).'
  : 'CHECK — a sub-assertion failed; inspect above.');
process.exit(pass ? 0 : 1);
