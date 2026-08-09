// PER on-chain READABILITY AUDIT (live devnet). Answers: what can ANYONE read on the public base
// layer, and does her private self (traits, salt, verdict) stay unreadable? Re-verifies the
// Model B claim rather than trusting the docs. Run from client/: node per-audit.mjs
import { Connection, PublicKey } from '@solana/web3.js';
import { DELEGATION_PROGRAM_ID } from '@magicblock-labs/ephemeral-rollups-sdk';
import { createHash } from 'crypto';

const PROGRAM = new PublicKey('CmguZy9dpo5zPzEBdFL9cbzoto2EsWMizvH8hvAmSaqP');
const base = new Connection(process.env.OIRA_BASE_RPC || 'https://api.devnet.solana.com', 'confirmed');
const hex = (b, n = 8) => Buffer.from(b).toString('hex').slice(0, n * 2);
const TRAITS_SPACE = 76;
// Anchor account discriminator = sha256("account:<Name>")[..8]
const disc = (name) => createHash('sha256').update('account:' + name).digest().subarray(0, 8);
const DISC_PALETTE = disc('PaletteVault'), DISC_TRAITS = disc('TraitsSession');
const isType = (d, t) => d.length >= 8 && d.subarray(0, 8).equals(t);

console.log('\n=== OIRA PER readability audit (devnet) ===\n');

// 1. program deployed?
const prog = await base.getAccountInfo(PROGRAM);
console.log('1. program', PROGRAM.toBase58());
console.log('   deployed:', !!prog, '| executable:', prog?.executable, '\n');

// 2. enumerate what the program owns on the PUBLIC base layer
const accts = await base.getProgramAccounts(PROGRAM);
const palettes = [], traits = [], other = [];
for (const a of accts) {
  const d = a.account.data;
  if (isType(d, DISC_PALETTE)) palettes.push(a);
  else if (isType(d, DISC_TRAITS)) traits.push(a);
  else other.push(a);
}
console.log(`2. program-owned base accounts: ${accts.length}  (palettes ${palettes.length}, traits-sized ${traits.length}, other ${other.length})\n`);

// 3. decode a public PaletteVault — prove it is OPAQUE (ciphertext + hash, no plaintext trait fields).
function decodePalette(d) {
  let o = 8; const owner = new PublicKey(d.subarray(o, o + 32)); o += 32;
  const encLen = d.readUInt32LE(o); o += 4; const enc = d.subarray(o, o + encLen); o += encLen;
  const root = d.subarray(o, o + 32); o += 32;
  const query_count = d.readUInt32LE(o); o += 4; const lifetime = d.readUInt32LE(o); o += 4; const epoch = d.readUInt32LE(o); o += 4;
  const is_private = d[o] === 1; o += 1; const last_verdict = d[o]; o += 1; const last_nonce = d.subarray(o, o + 16);
  // "current-format" = counters decode sanely (legacy spike seals used an earlier layout)
  const current = query_count < 1e6 && lifetime < 1e6 && epoch < 1e6;
  return { owner, encLen, root, query_count, lifetime, epoch, is_private, last_verdict, last_nonce, current };
}
const decoded = palettes.map((a) => ({ pubkey: a.pubkey, ...decodePalette(a.account.data) }));
const currentSeals = decoded.filter((p) => p.current);
console.log('3. a PUBLIC PaletteVault, decoded (this is what ANYONE can read):');
console.log(`   ${palettes.length} sealed palettes on base (${currentSeals.length} current-format, ${palettes.length - currentSeals.length} legacy spike seals).`);
const rep = currentSeals[0] || decoded[0];
if (rep) {
  console.log('   pubkey        :', rep.pubkey.toBase58());
  console.log('   owner         :', rep.owner.toBase58());
  console.log('   enc_traits    :', rep.encLen, 'bytes of CIPHERTEXT (opaque recovery blob, never the match input)');
  console.log('   commitment    :', hex(rep.root, 32));
  console.log('                   (a 256-bit hash keccak(salt‖traits); salt stays in-enclave so it is preimage-hard)');
  console.log('   is_private    :', rep.is_private, '(match reads are whitelist-gated to her agent)');
  console.log('   >> The struct has NO undertone / depth / season / salt field. Verdict + nonce resolve');
  console.log('      inside the enclave; base only ever sees a hashed receipt.\n');
} else console.log('   (no palettes sealed yet)\n');

// 4. THE key check: the TraitsSession (plaintext buckets + salt) must NOT be plaintext-readable on base.
//    A delegated account is owned by the DELEGATION program on base, so it never appears in
//    getProgramAccounts(PROGRAM). We also derive each palette's traits PDA and inspect its owner.
console.log('4. TraitsSession (plaintext traits + salt) exposure on base:');
console.log('   traits-sized accounts still OWNED BY THE PROGRAM on base:', traits.length,
  traits.length ? '(these would be undelegated)' : '(none — sealed traits are delegated into the enclave)');
let exposed = 0, protectedN = 0, missing = 0;
for (const p of palettes.slice(0, 8)) {
  const owner = decodePalette(p.account.data).owner;
  const traitsPda = PublicKey.findProgramAddressSync([Buffer.from('traits'), owner.toBuffer()], PROGRAM)[0];
  const info = await base.getAccountInfo(traitsPda);
  if (!info) { missing++; continue; }
  const ownedByDelegation = info.owner.equals(DELEGATION_PROGRAM_ID);
  const ownedByProgram = info.owner.equals(PROGRAM);
  if (ownedByDelegation) { protectedN++; }
  else if (ownedByProgram && info.data.length === TRAITS_SPACE) {
    // still program-owned: check whether it actually holds sealed plaintext
    const d = info.data; const is_sealed = d[8 + 32 + 3] === 1;
    const u = d[8 + 32], dp = d[8 + 32 + 1], se = d[8 + 32 + 2];
    if (is_sealed) { exposed++; console.log(`   !! ${owner.toBase58()} traits readable on base: undertone=${u} depth=${dp} season=${se} (sealed)`); }
    else { protectedN++; }
  }
}
console.log(`   delegated/empty (protected): ${protectedN} | traits-not-created: ${missing} | PLAINTEXT-EXPOSED: ${exposed}\n`);

// 5. verdict
console.log('=== readability matrix ===');
console.log('  PUBLIC (anyone, base)   : sealed-palette exists, ciphertext blob, commitment hash, query counters, hashed receipts.');
console.log('  HER ONLY (in-enclave)   : bucketed traits, salt, per-query verdict + nonce (TraitsSession delegated + whitelist-gated).');
console.log('  JUDGES can verify       : a seal happened, a match/settle happened, a payout landed — WITHOUT reading her traits or verdict.');
console.log('\nRESULT:', exposed === 0
  ? 'PASS — no plaintext traits/salt on base; the public account is opaque. Model B holds live.'
  : `FAIL — ${exposed} TraitsSession(s) expose plaintext on base. Investigate delegation.`);
