// Loads the REAL browser concierge (app/concierge.js) in a minimal shim so the MCP tools use the
// exact same judgement + copy as the app (single source of truth, never drifts). The whitelisted
// palette is injected per-call via window.oiraBuildContext, exactly like on the device.
import fs from 'fs';
import { fileURLToPath } from 'url';

const code = fs.readFileSync(fileURLToPath(new URL('../app/concierge.js', import.meta.url)), 'utf8');
const win = {};
const localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; } };
const navigator = { language: 'en-US' };
new Function('window', 'localStorage', 'navigator', code)(win, localStorage, navigator);

const C = win.OiraConcierge;
let CURRENT = {};
win.oiraBuildContext = () => CURRENT;

// run fn with the given palette in scope, then clear it. The concierge reads the context
// synchronously at call entry, so this is safe for the async answer() too.
export function withPalette(palette, fn) {
  CURRENT = palette || {};
  try { if (palette && palette.lang) C.setLang(palette.lang); return fn(C); }
  finally { CURRENT = {}; }
}
export const concierge = C;
