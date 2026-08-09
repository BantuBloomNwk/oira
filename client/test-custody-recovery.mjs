// Headless proof of the fallback-path recovery flow (exportFallbackSeed/restoreFallbackSeed):
// the only case with no automatic (passkey-sync) recovery, so this roundtrip is the whole
// safety net. Same "run the real app/custody.js source" shim as test-custody-parity.mjs.
import fs from 'fs';
import { fileURLToPath } from 'url';
import nacl from 'tweetnacl';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const load = (p) => fs.readFileSync(ROOT + p, 'utf8');

function freshWindow() {
  const store = {};
  const window = { nacl };
  const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, _store: store };
  new Function('window', 'localStorage', load('/app/custody.js'))(window, localStorage);
  return { window, localStorage };
}

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

console.log('Oira fallback-recovery roundtrip proof\n');

// 1. A fresh "device" with no fallback seed yet: unlockLocal() mints one and persists it.
{
  const { window } = freshWindow();
  const owner1 = await window.OiraCustody.unlockLocal();
  ok(owner1.assurance === 'fallback', 'unlockLocal() produces a fallback-assurance owner');
  const exported = window.OiraCustody.exportFallbackSeed();
  ok(!!exported, 'exportFallbackSeed() returns a real key once one exists');

  // 2. Simulate "she lost this device": a brand new window/localStorage, nothing carried over.
  const fresh = freshWindow();
  ok(!fresh.window.OiraCustody.exportFallbackSeed(), 'a genuinely new device has no fallback key to export (the actual loss this flow protects against)');

  // 3. Restoring her saved key on that new device recovers the EXACT same owner address.
  const owner2 = await fresh.window.OiraCustody.restoreFallbackSeed(exported);
  ok(owner2.address === owner1.address, 'restoreFallbackSeed() on a new device recovers the identical owner address');
  ok(fresh.window.OiraCustody.exportFallbackSeed() === exported, 'restoring also re-persists the key locally, so a later export still works');
}

// 4. Garbage input is rejected, not silently accepted into a wrong identity.
{
  const { window } = freshWindow();
  let threw = false;
  try { await window.OiraCustody.restoreFallbackSeed('not-a-real-key'); }
  catch (e) { threw = true; }
  ok(threw, 'restoreFallbackSeed() rejects a malformed key rather than deriving a bogus identity from it');
}

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES: ' + fail}  (${pass} passed)`);
process.exit(fail === 0 ? 0 : 1);
