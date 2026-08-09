// Verifies a claim that has sat as an unchecked comment in both custody files: "the browser
// build (app/custody.js) mirrors the SAME HKDF info strings so a key derived in the browser
// matches one derived here [client/oira-custody.mjs]." Runs the REAL app/custody.js source
// (not a hand-copied reimplementation of its constants, which could silently drift from the
// shipped file) against Node's native WebCrypto, using the same "new Function(window, ...)"
// shim pattern scripts/test-llm.mjs already uses to execute a browser IIFE headlessly. No
// Playwright, no browser download: the actual risk here is WebCrypto-HKDF-vs-node:crypto-hkdfSync
// implementation parity, which Node's own native crypto.subtle already gives a real answer to,
// without any of a full browser's weight or flakiness.
import fs from 'fs';
import { fileURLToPath } from 'url';
import nacl from 'tweetnacl';
import { deriveOwner } from './oira-custody.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const load = (p) => fs.readFileSync(ROOT + p, 'utf8');

const store = {};
const window = { nacl };
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
// crypto is intentionally NOT shimmed — custody.js's bare `crypto.subtle` calls resolve to
// Node's own global `crypto` (real WebCrypto), which is the whole point of this test.
new Function('window', 'localStorage', load('/app/custody.js'))(window, localStorage);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

console.log('Oira browser/node custody parity proof\n');

const prfAlice = new Uint8Array(32).fill(7); // same mock secret client/test-custody.mjs uses
const prfBob = Uint8Array.from({ length: 32 }, (_, i) => (i * 13 + 5) & 0xff);

const nodeAlice = deriveOwner(prfAlice).publicKey.toBase58();
const nodeBob = deriveOwner(prfBob).publicKey.toBase58();
const browserAlice = await window.OiraCustody._deriveOwnerFromPrf(prfAlice);
const browserBob = await window.OiraCustody._deriveOwnerFromPrf(prfBob);

ok(browserAlice === nodeAlice, 'browser custody.js derives the SAME owner address as the Node reference (alice)');
ok(browserBob === nodeBob, 'browser custody.js derives the SAME owner address as the Node reference (bob)');
ok(browserAlice !== browserBob, 'two different PRF secrets still yield two different browser-derived addresses');

console.log(`\nnode  (alice)= ${nodeAlice}`);
console.log(`browser(alice)= ${browserAlice}`);
console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES: ' + fail}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
