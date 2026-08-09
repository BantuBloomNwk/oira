// Headless smoke test for the Oira PWA (VERIFICATION.md row 16 — the browser UI had zero automated
// coverage). Serves app/ statically, loads it in a real headless Chromium with a FAKE camera, and
// drives the actual screens the way the app does. It is a SMOKE test: it proves the page loads with
// no uncaught JS, the core screens render, the camera/reading screen initialises, and the on-screen
// oval positions itself over the sampled region (positionOval). It does NOT prove seal/settle (those
// need a passkey + the bridge) or pixel-perfect layout (needs a real device) — it catches the class
// of breakage a bad deploy ships: a JS error on load, a screen that fails to render, a broken hook.
//
// Needs a Chromium/Chrome binary. Uses $CHROME_PATH, else common system paths. If none is found it
// SKIPS cleanly (exit 0) rather than failing — same graceful-gating pattern as the devnet tier.
// Run from client/:  node test-app-smoke.mjs
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app');
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);
const chrome = CHROME_CANDIDATES.find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
if (!chrome) { console.log('SKIP — no Chromium/Chrome found (set CHROME_PATH). Not a failure.'); process.exit(0); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
// tiny static server rooted at app/ (app/brand/ already carries the /brand/* assets the page needs)
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
  const file = path.join(APP_DIR, path.normalize(rel));
  if (!file.startsWith(APP_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  });
});

let pass = true; const check = (label, ok) => { pass = pass && ok; console.log(`   ${ok ? '✓' : '✗'} ${label}`); };
// noise we don't fail on: the bridge (/api/*) isn't running, and the BlazeFace model CDN may be
// blocked in a sandbox — the app degrades gracefully for both, by design.
const isNoise = (t) => /\/api\/|favicon|tensorflow|tfhub|jsdelivr|unpkg|storage\.googleapis|net::ERR|Failed to load resource|ERR_/i.test(String(t || ''));

const port = await new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const base = `http://127.0.0.1:${port}/`;
console.log('chromium :', chrome);
console.log('serving  :', APP_DIR, '→', base);

const browser = await puppeteer.launch({
  executablePath: chrome, headless: 'new',
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage();
  const pageErrors = [], consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e && e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error' && !isNoise(m.text())) consoleErrors.push(m.text()); });
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForFunction(() => typeof window.go === 'function', { timeout: 10000 });

  console.log('\n[1] app loads + core screens render (no uncaught JS):');
  const title = await page.title();
  check('title is Oira', /oira/i.test(title));
  // drive a few screens the way the app does — a syntax/ref error in any render throws pageerror
  for (const n of [0, 2, 8, 5, 1]) { await page.evaluate((s) => window.go(s), n); await new Promise((r) => setTimeout(r, 120)); }
  check('screen 1 (reading) is active', await page.evaluate(() => !!document.querySelector('.scr.on[data-s="1"]')));

  console.log('\n[2] camera/reading screen initialises with the fake stream:');
  const camReady = await page.waitForFunction(() => { const v = document.getElementById('cam'); return v && v.videoWidth > 0; }, { timeout: 12000 }).then(() => true).catch(() => false);
  check('video has a live stream (videoWidth > 0)', camReady);

  console.log('\n[3] positionOval overlays the guide on the sampled region (the standalone-size fix):');
  const ovalFit = await page.waitForFunction(() => { const o = document.querySelector('#camWrap .oval'); return o && o.classList.contains('fit') && o.getBoundingClientRect().width > 20; }, { timeout: 8000 }).then(() => true).catch(() => false);
  check('oval is JS-positioned (.fit, non-zero size)', ovalFit);
  if (ovalFit) {
    const geom = await page.evaluate(() => { const b = document.getElementById('camWrap').getBoundingClientRect(); const o = document.querySelector('#camWrap .oval').getBoundingClientRect();
      return { ovalTallerThanWide: o.height > o.width, withinBox: o.width <= b.width + 1 && o.height <= b.height + 1, wRatio: o.width / b.width }; });
    check('oval is face-shaped (taller than wide)', geom.ovalTallerThanWide);
    check('oval fits inside the camera box', geom.withinBox);
  }

  console.log('\n[4] one-tap on-device skin log runs without throwing (fake camera):');
  const skinOk = await page.evaluate(async () => {
    try {
      if (typeof window.quickSkinCheck !== 'function' || typeof window.openSkinTrends !== 'function') return 'no-fn';
      // seed a sustained-dry on-device history so the journal renders its full instrument
      const log = []; for (let i = 0; i < 6; i++) log.push({ dryness: 'dry', shine: 'shiny', blemish: false, method: 'quick', t: Date.now() - i * 86400000 });
      localStorage.setItem('oira_skinlog', JSON.stringify(log)); localStorage.removeItem('oira_intent');
      window.openSkinTrends(); // renders renderSkinTrends into #skinTrendBody
      const txt = (document.getElementById('skinTrendBody') || {}).textContent || '';
      const hasPrivacy = /only on this phone/i.test(txt);
      const hasNudge = /drier side/i.test(txt);            // sustained-dry pattern → non-medical nudge fires
      const hasIntent = !!document.getElementById('intentProbe');
      await window.quickSkinCheck(); // fake camera → may report "couldn't read"; must NOT throw
      const arrOk = window.oiraSkinHistory && Array.isArray(window.oiraSkinHistory());
      return (hasPrivacy && hasNudge && hasIntent && arrOk) ? 'ok' : `partial priv=${hasPrivacy} nudge=${hasNudge} intent=${hasIntent} arr=${arrOk}`;
    } catch (e) { return 'threw:' + (e && e.message); }
  });
  check('skin journal renders (privacy + sustained-pattern nudge + intent probe) + quickSkinCheck runs', skinOk === 'ok');
  if (skinOk !== 'ok') console.log('   skin drive:', skinOk);

  console.log('\n[5] scanner classifiers produce valid output (row 17 — colour, condition, curl):');
  const scanOk = await page.evaluate(() => {
    try {
      const o = {};
      // palette classifier: ITA/hue → depth/undertone/Monk. Deterministic on synthetic inputs.
      if (typeof bucketize === 'function') { const b = bucketize(28, 15); o.palette = !!(b && typeof b.depth !== 'undefined' && b.monk >= 1 && b.monk <= 10 && b.under); }
      // skin-condition classifier: roughness/shine/blemish → dryness/shine words.
      if (typeof bucketSkinCondition === 'function') { const s = bucketSkinCondition(0.3, 0.2, false); o.condition = !!(s && s.dryness && s.shine); }
      // curl is set by hand (headwrap/hijab-inclusive), not camera-scanned — verify the setter.
      if (typeof setCurlSlider === 'function' && typeof reading !== 'undefined') { setCurlSlider(4); o.curl = reading.curlIdx === 4; }
      return o;
    } catch (e) { return { threw: e && e.message }; }
  });
  check('classifiers valid (palette bucket + skin condition + curl selector)', !!(scanOk.palette && scanOk.condition && scanOk.curl));
  if (!(scanOk.palette && scanOk.condition && scanOk.curl)) console.log('   scan drive:', JSON.stringify(scanOk));

  console.log('\n[6] Brand Studio page loads + renders (row 18):');
  const brandErrsBefore = pageErrors.length;
  let brandOk = false;
  try {
    await page.goto(base + 'brand/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    const t = await page.title();
    brandOk = /brand studio/i.test(t) && await page.evaluate(() => !!(document.body && document.body.children.length));
  } catch (e) { console.log('   brand nav error:', e && e.message); }
  check('Brand Studio renders (title + body) with no new page error', brandOk && pageErrors.length === brandErrsBefore);

  console.log('\n[7] no uncaught JS errors across the run:');
  if (pageErrors.length) console.log('   pageerrors:', pageErrors.slice(0, 5).join(' | '));
  if (consoleErrors.length) console.log('   console errors:', consoleErrors.slice(0, 5).join(' | '));
  check('no uncaught page errors', pageErrors.length === 0);
  check('no unexpected console errors', consoleErrors.length === 0);
} finally {
  await browser.close();
  server.close();
}

console.log('\n────────── RESULT ──────────');
console.log(pass ? 'PASS ✓ — the PWA loads, the core screens render, the reading camera initialises, and the oval positions itself over the sampled region, with no uncaught JS.'
                 : 'CHECK — a smoke assertion failed; inspect above.');
process.exit(pass ? 0 : 1);
