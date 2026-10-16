// Headless proof for the custody derivation scheme (no browser / no WebAuthn needed).
// We stand in a MOCK PRF secret where the real passkey would supply one, and assert the
// four properties the custody model depends on.
import nacl from 'tweetnacl';
import { deriveOwner, deriveAgent, deriveSeed, OWNER_INFO } from '../oira-custody.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

// A passkey PRF output is 32 bytes; mock two distinct users' secrets.
const prfAlice = new Uint8Array(32).fill(7);
const prfAlice2 = new Uint8Array(32).fill(7); // same secret re-supplied on a "new device"
const prfBob = Uint8Array.from({ length: 32 }, (_, i) => (i * 13 + 5) & 0xff);

console.log('Oira custody derivation proof\n');

// 1. DETERMINISTIC RECOVERY: same PRF secret → same owner key (new device, no backup).
const a1 = deriveOwner(prfAlice), a2 = deriveOwner(prfAlice2);
ok(a1.publicKey.equals(a2.publicKey), 'same PRF secret regenerates the SAME owner key (biometric recovery)');

// 2. UNIQUENESS: different users → different owner keys.
const b1 = deriveOwner(prfBob);
ok(!a1.publicKey.equals(b1.publicKey), 'different PRF secrets yield different owner keys');

// 3. ROLE SEPARATION: owner and agent keys derived from the same secret differ.
const agentA = deriveAgent(prfAlice);
ok(!a1.publicKey.equals(agentA.publicKey), 'owner and agent roles derive distinct keys from one secret');

// 4. REAL ed25519 SIGNING: the derived owner key produces a valid Solana-grade signature.
const msg = new TextEncoder().encode('oira:set_traits:commitment-root-demo');
const sig = nacl.sign.detached(msg, a1.secretKey);
ok(nacl.sign.detached.verify(msg, sig, a1.publicKey.toBytes()), 'derived owner key signs + verifies (ed25519)');
ok(!nacl.sign.detached.verify(msg, sig, b1.publicKey.toBytes()), "another user's key does NOT verify that signature");

// Determinism of the raw seed too (guards against library drift).
const s1 = Buffer.from(deriveSeed(prfAlice, OWNER_INFO)).toString('hex');
const s2 = Buffer.from(deriveSeed(prfAlice2, OWNER_INFO)).toString('hex');
ok(s1 === s2 && s1.length === 64, 'HKDF seed is stable + 32 bytes');

console.log(`\nowner(alice)= ${a1.publicKey.toBase58()}`);
console.log(`agent(alice)= ${agentA.publicKey.toBase58()}`);
console.log(`owner(bob)  = ${b1.publicKey.toBase58()}`);
console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES: ' + fail}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
