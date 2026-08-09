// Pre-warm the TTS cache with the concierge's fully-static lines (greeting, privacy, offers,
// recheck, help) in every language, so the most common spoken replies are served free at runtime.
// Dynamic lines (colour / season / amount slots) warm themselves on first real use.
//
// Run AFTER the bridge TTS env is live (ELEVENLABS_API_KEY + OIRA_TTS_VOICE_ID), pointing at the
// bridge (directly, or through the Netlify /api proxy):
//   OIRA_TTS_BASE=https://oira.161-97-74-212.sslip.io node voice/pregen-tts.mjs
// It reads the exact strings from app/concierge.js (no duplication, never drifts).
import fs from 'fs';
import { fileURLToPath } from 'url';

const BASE = (process.env.OIRA_TTS_BASE || 'http://127.0.0.1:8777').replace(/\/$/, '');

// load the browser concierge module in a minimal shim to read the real copy
const code = fs.readFileSync(fileURLToPath(new URL('../app/concierge.js', import.meta.url)), 'utf8');
const win = {};
const localStorage = { _: {}, getItem(k) { return this._[k] ?? null; }, setItem(k, v) { this._[k] = v; } };
const navigator = { language: 'en-US' };
new Function('window', 'localStorage', 'navigator', code)(win, localStorage, navigator);
win.oiraBuildContext = () => ({ season: 'Deep Winter', under: 'Cool', depthWord: 'Deep', depthNum: 4, earned: 0, rules: {}, offers: [], checks: [] });
const C = win.OiraConcierge;

async function warm(text, lang) {
  const res = await fetch(`${BASE}/api/tts`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) { console.warn(`  ! ${lang} ${res.status} ${(await res.text()).slice(0, 80)}`); return false; }
  console.log(`  ok ${lang}  ${text.slice(0, 48)}...`);
  return true;
}

const health = await fetch(`${BASE}/api/voice/health`).then((r) => r.json()).catch(() => ({}));
if (!health.tts) { console.error('TTS is not configured on the bridge (set ELEVENLABS_API_KEY + OIRA_TTS_VOICE_ID). Aborting.'); process.exit(1); }

let n = 0;
for (const lang of C.langs) {
  C.setLang(lang);
  console.log(`\n[${lang}]`);
  for (const line of C.staticLines()) { if (await warm(line, lang)) n++; }
}
console.log(`\nWarmed ${n} lines. They are now cached and free to speak.`);
