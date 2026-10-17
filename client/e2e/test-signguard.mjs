// The app's sign guard accepts every message a real seal and re-seal ask for, and refuses
// anything else. Run from client/:  node e2e/test-signguard.mjs   (needs app-next's packages)
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { createTransferCheckedInstruction } from '@solana/spl-token';

const appNext = new URL('../../app-next/', import.meta.url).pathname;
const out = path.join(os.tmpdir(), `signguard-${process.pid}.mjs`);
execFileSync(path.join(appNext, 'node_modules/.bin/esbuild'), [path.join(appNext, 'src/lib/signguard.ts'), '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=error']);
const { sealSignGuard } = await import(out);
fs.unlinkSync(out);

const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/seal-sign-requests.json', import.meta.url)));
const salt = Buffer.from(fx.salt, 'base64');
const her = new PublicKey(fx.device);
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const refused = (msg) => { try { sealSignGuard(fx.device, fx.traits, salt)(msg); return false; } catch { return true; } };

// every real message passes, in order, through one guard
{ const g = sealSignGuard(fx.device, fx.traits, salt); let ok = true;
  for (const m of fx.messages) { try { g(Buffer.from(m, 'base64')); } catch (e) { ok = false; console.log('   refused a real message:', e.message); } }
  check(`all ${fx.messages.length} real seal and re-seal messages are allowed`, ok); }

const blockhash = Keypair.generate().publicKey.toBase58();
const legacy = (...ixs) => { const t = new Transaction({ feePayer: her, recentBlockhash: blockhash }); t.add(...ixs); return t.serializeMessage(); };
const attacker = Keypair.generate().publicKey;
const realBytes = fx.messages.map((m) => Buffer.from(m, 'base64'));

check('a USDC transfer out of her wallet is refused', refused(legacy(createTransferCheckedInstruction(attacker, attacker, attacker, her, 5_000_000n, 6))));
check('a 1 SOL transfer to someone else is refused', refused(legacy(SystemProgram.transfer({ fromPubkey: her, toPubkey: attacker, lamports: 1_000_000_000 }))));
check('a small transfer that is not from her is refused', refused(legacy(SystemProgram.transfer({ fromPubkey: attacker, toPubkey: her, lamports: 1_000 }))));
check('an unknown program is refused', refused(legacy(new TransactionInstruction({ programId: attacker, keys: [{ pubkey: her, isSigner: true, isWritable: true }], data: Buffer.alloc(8) }))));
check('a versioned message is refused', refused(new VersionedTransaction(new TransactionMessage({ payerKey: her, recentBlockhash: blockhash, instructions: [SystemProgram.transfer({ fromPubkey: her, toPubkey: her, lamports: 1 })] }).compileToV0Message()).message.serialize()));
check('a login text for someone else is refused', refused(Buffer.from(`Login to Query Filtering Service\nTimestamp: 1\nUser: ${attacker.toBase58()}`)));
check('arbitrary text is refused', refused(Buffer.from('Please sign to continue')));

// tamper with real messages: set_traits with other traits, and a swapped permission program
const setTraits = realBytes.find((b) => b.includes(Buffer.from('796a1ba6efc772b8', 'hex')));
{ const b = Buffer.from(setTraits); const at = b.indexOf(Buffer.from('796a1ba6efc772b8', 'hex')) + 8; b[at] ^= 1; check('set_traits carrying different traits is refused', refused(b)); }
const privacy = realBytes.find((b) => b.includes(Buffer.from('170ae11ced2ab496', 'hex')));
{ const b = Buffer.from(privacy); const perm = new PublicKey('ACLseoPoyC3cBqoUtkbjZ4aDrkurZW86v19pXz2XQnp1').toBuffer(); const at = b.indexOf(perm); attacker.toBuffer().copy(b, at); check('a privacy call pointing at another permission program is refused', refused(b)); }
{ const g = sealSignGuard(fx.device, fx.traits, salt); let n = 0; try { for (;;) { g(realBytes[realBytes.length - 1]); n++; } } catch {} check('one seal cannot ask for more than 16 signatures', n === 16); }

console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
