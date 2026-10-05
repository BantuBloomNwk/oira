/* The accuracy study harness. Internal.
 *
 * This is the instrument that tells us how wrong the scanner is. Everything downstream waits
 * on it: the thresholds in confidence.ts are currently a defensible ordering of known failure
 * modes rather than measured numbers, no brand predicate can be honestly priced without an
 * error figure behind it, and the per-band exposure targets the native capture path needs
 * cannot be chosen until we know which direction each band is wrong in.
 *
 * THE ONE RULE THAT MAKES THE DATA WORTH ANYTHING: this runs the real pipeline. warmUp(),
 * readFrame() and consolidate() are the same functions the app uses, imported rather than
 * reimplemented. A harness that measured its own private copy of the maths would produce a
 * number about the harness. If the scan changes, this changes with it for free.
 *
 * Ships like residuals.html, and for the same reason: readings have to be taken on real
 * handsets in real rooms, and a page that only ran on a laptop would measure the one device
 * whose answer does not matter.
 *
 * Follow the study protocol, which the research team keeps, every time: the order of
 * operations is what stops the data being noise.
 */

import { warmUp, readFrame, consolidate, type ScanFrame } from './lib/scan';
import { monkFromIta } from './lib/monk';

const STORE = 'oira.study';

/* Long enough to average the sensor and the autoexposure hunting, short enough that she is not
   asked to hold still through something uncomfortable. Matches the app's own hold so the
   measurement is taken under the same conditions the product takes it under. */
const HOLD_MS = 3200;
const SAMPLE_MS = 90;

type Lab = { L: number; a: number; b: number };

interface Trial {
  id: string;
  at: number;
  /* Who, coarsely. A code the operator assigns, never a name: the sheet that maps codes to
     people stays on paper and does not travel with this file. */
  subject: string;
  /* The Monk step a trained human assigned by eye, which is the label the study is graded
     against, not the app's own guess. */
  monkVisual: number;
  site: string;
  light: string;
  device: string;
  /* What the instrument said. The ground truth, when there is one.
     NULL is a legitimate trial, not a broken one: without an instrument you cannot measure
     ACCURACY, but you can measure REPEATABILITY, and those are different questions. See the
     repeatability note in the summary. */
  ref: Lab | null;
  /* What the app said, straight off the real pipeline. */
  app: Lab;
  appIta: number;
  appMonk: number | null;
  confidence: number | null;
  band: string | null;
  capture: string | null;
  cct: number | null;
  samples: number;
  /* CIEDE2000 between the two, null when there is no instrument reading to compare against. */
  de2000: number | null;
  /* Signed per axis, because the sign is the correction. */
  dL: number | null; da: number | null; db: number | null;
}

/* ---------------------------------------------------------------------------------------
   CIEDE2000.

   Not CIE76. The app's match.ts uses CIE76 and says why: it is scoring marketing hexes and
   should not pretend to precision the inputs cannot support. This is the opposite situation.
   These are instrument readings against a measured pipeline, the whole point is the size of
   the error, and CIE76 systematically understates differences in exactly the region skin
   lives in. The acceptability thresholds everyone quotes (1.8 excellent, 3.6 moderately
   unacceptable) are CIEDE2000 numbers, so measuring in CIE76 and comparing to them would
   flatter us by a wide margin.
   --------------------------------------------------------------------------------------- */
function ciede2000(p: Lab, q: Lab): number {
  const kL = 1, kC = 1, kH = 1;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(p.a, p.b), C2 = Math.hypot(q.a, q.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)));
  const a1p = (1 + G) * p.a, a2p = (1 + G) * q.a;
  const C1p = Math.hypot(a1p, p.b), C2p = Math.hypot(a2p, q.b);
  const h1p = (Math.atan2(p.b, a1p) * deg + 360) % 360;
  const h2p = (Math.atan2(q.b, a2p) * deg + 360) % 360;

  const dLp = q.L - p.L;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);

  const Lbarp = (p.L + q.L) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbarp += (h1p + h2p < 360) ? 360 : -360;
    hbarp /= 2;
  }

  const T = 1
    - 0.17 * Math.cos((hbarp - 30) * rad)
    + 0.24 * Math.cos(2 * hbarp * rad)
    + 0.32 * Math.cos((3 * hbarp + 6) * rad)
    - 0.20 * Math.cos((4 * hbarp - 63) * rad);

  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbarp ** 7 / (Cbarp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;

  return Math.sqrt(
    (dLp / (kL * Sl)) ** 2 +
    (dCp / (kC * Sc)) ** 2 +
    (dHp / (kH * Sh)) ** 2 +
    Rt * (dCp / (kC * Sc)) * (dHp / (kH * Sh))
  );
}

/* ---------------------------------------------------------------------------------------
   Store
   --------------------------------------------------------------------------------------- */

const read = (): Trial[] => {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]') as Trial[]; } catch { return []; }
};
const write = (t: Trial[]) => {
  try { localStorage.setItem(STORE, JSON.stringify(t)); } catch { /* full or refused */ }
};

/* ---------------------------------------------------------------------------------------
   Capture
   --------------------------------------------------------------------------------------- */

let stream: MediaStream | null = null;
const video = document.getElementById('cam') as HTMLVideoElement;
const scratch = document.createElement('canvas');
const $ = (id: string) => document.getElementById(id)!;
const val = (id: string) => ($(id) as HTMLInputElement).value.trim();
const num = (id: string) => Number(($(id) as HTMLInputElement).value);

function say(msg: string, bad = false) {
  const el = $('say');
  el.textContent = msg;
  el.style.color = bad ? '#8C3A4E' : '#4F7A5E';
}

async function start() {
  say('loading the models, this is the same wait the app has...');
  const ok = await warmUp();
  if (!ok) { say('the scan pipeline would not load on this device', true); return; }
  try {
    /* Rear camera by default. The study is about measuring skin accurately, and the rear
       sensor on almost every handset is better than the front one, so it is the honest
       upper bound. Switch to user in the field if the protocol calls for it. */
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: val('facing') || 'environment', width: { ideal: 1280 }, height: { ideal: 960 } },
    });
  } catch {
    say('camera refused', true); return;
  }
  video.srcObject = stream;
  await video.play().catch(() => {});
  $('capture').removeAttribute('disabled');
  say('ready. Fill the form, put the instrument on the same spot, then capture.');
}

/* One trial: hold, sample, consolidate, exactly as the app does. */
async function capture(): Promise<ScanFrame | null> {
  const frames: ScanFrame[] = [];
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const now = performance.now();
      const f = readFrame(video, scratch, now);
      if (f.skin) frames.push(f);
      $('count').textContent = String(frames.length);
      if (now - t0 < HOLD_MS) { setTimeout(tick, SAMPLE_MS); return; }
      if (!frames.length) { resolve(null); return; }
      resolve(consolidate(frames, frames[frames.length - 1]));
    };
    tick();
  });
}

async function record() {
  for (const f of ['subject', 'site', 'light', 'device']) {
    if (!val(f)) { say(`${f} is required, the row is useless without it`, true); return; }
  }
  /* All three or none. A partial instrument reading is worse than no instrument reading,
     because it looks like data. */
  const parts = [num('refL'), num('refA'), num('refB')];
  const given = parts.filter(Number.isFinite).length;
  if (given !== 0 && given !== 3) { say('enter all three of L*, a*, b*, or leave all three empty', true); return; }
  const ref: Lab | null = given === 3 ? { L: parts[0], a: parts[1], b: parts[2] } : null;
  const monkVisual = num('monkVisual');
  if (!Number.isFinite(monkVisual) || monkVisual < 1 || monkVisual > 10) {
    say('Monk step 1 to 10, assigned by eye, not by the app', true); return;
  }

  $('capture').setAttribute('disabled', 'true');
  say('hold still...');
  const frame = await capture();
  $('capture').removeAttribute('disabled');

  if (!frame?.skin) { say('no skin reading, nothing recorded. Try again.', true); return; }

  const app: Lab = frame.skin.lab;
  const t: Trial = {
    id: (crypto.randomUUID?.() ?? String(Math.random())).slice(0, 8),
    at: Date.now(),
    subject: val('subject'), monkVisual, site: val('site'), light: val('light'), device: val('device'),
    ref, app,
    appIta: frame.skin.ita,
    appMonk: monkFromIta(frame.skin.ita),
    confidence: frame.confidence?.score ?? null,
    band: frame.confidence?.band ?? null,
    capture: frame.confidence?.capture ?? null,
    cct: frame.light ? Math.round(frame.light.cct) : null,
    samples: frame.skin.samples,
    de2000: ref ? ciede2000(ref, app) : null,
    dL: ref ? app.L - ref.L : null,
    da: ref ? app.a - ref.a : null,
    db: ref ? app.b - ref.b : null,
  };

  const all = read();
  all.push(t);
  write(all);
  render();
  say(t.de2000 === null
    ? `recorded, no instrument reading. L* ${app.L.toFixed(1)} a* ${app.a.toFixed(1)} b* ${app.b.toFixed(1)}, ITA ${t.appIta.toFixed(1)}`
    : `recorded. dE2000 ${t.de2000.toFixed(2)}  (dL ${t.dL!.toFixed(1)} da ${t.da!.toFixed(1)} db ${t.db!.toFixed(1)})`);
}

/* ---------------------------------------------------------------------------------------
   The table, and the only summary that matters
   --------------------------------------------------------------------------------------- */

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function render() {
  const rows = read();
  const body = document.querySelector('#out tbody')!;
  body.innerHTML = '';
  for (const t of [...rows].reverse()) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.subject}</td><td>${t.monkVisual}</td><td>${t.site}</td><td>${t.light}</td>
      <td>${t.device}</td>
      <td><b>${t.de2000.toFixed(2)}</b></td>
      <td>${t.dL.toFixed(1)}</td><td>${t.da.toFixed(1)}</td><td>${t.db.toFixed(1)}</td>
      <td>${t.appIta.toFixed(1)}</td><td>${t.appMonk ?? '-'}</td>
      <td>${t.confidence?.toFixed(2) ?? '-'}</td><td>${t.cct ?? '-'}</td>`;
    body.appendChild(tr);
  }

  const box = $('summary');
  if (!rows.length) { box.innerHTML = '<p class="empty">No trials yet.</p>'; return; }

  /* REPEATABILITY, which needs no instrument at all.
   *
   * Accuracy asks "is the reading right", and only a reference can answer that. Repeatability
   * asks "does it say the same thing twice", and the app can answer that entirely on its own:
   * scan the same woman, same spot, same light, five times, and see how far the five answers
   * sit from each other. It is half the question and it is the half you can measure today.
   *
   * It is also the half that would sink a brand predicate first. A reading that is wrong by a
   * consistent amount is correctable; a reading that disagrees with itself is not, and no
   * calibration fixes it. */
  const groups = new Map<string, Trial[]>();
  for (const t of rows) {
    const k = `${t.subject} / ${t.site} / ${t.light} / ${t.device}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const repeats = [...groups.entries()].filter(([, v]) => v.length > 1);
  if (repeats.length) {
    let rh = '<div class="big">Repeatability, no instrument needed</div><table class="sum"><thead><tr><th>subject / site / light / device</th><th>n</th><th>spread dE2000</th><th>worst pair</th></tr></thead><tbody>';
    for (const [k, v] of repeats) {
      /* Every pair against every other, so one outlier cannot hide behind an average. */
      const ds: number[] = [];
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) ds.push(ciede2000(v[i].app, v[j].app));
      rh += `<tr><td>${k}</td><td>${v.length}</td><td><b>${median(ds).toFixed(2)}</b></td><td>${Math.max(...ds).toFixed(2)}</td></tr>`;
    }
    rh += '</tbody></table>';
    box.innerHTML = rh;
  } else {
    box.innerHTML = '<p class="empty">Capture the same subject, site and light more than once to get a repeatability figure. That one needs no instrument.</p>';
  }
  const accuracy = rows.filter((r) => r.de2000 !== null) as Array<Trial & { de2000: number; dL: number; da: number; db: number }>;
  if (!accuracy.length) return;

  /* By Monk band, because a single aggregate is the one number that hides the finding. The
     whole question is whether the deep end is worse, and an average over everybody answers it
     by burying it. */
  const bands: Array<[string, (m: number) => boolean]> = [
    ['1-2', (m) => m <= 2], ['3-4', (m) => m >= 3 && m <= 4],
    ['5-6', (m) => m >= 5 && m <= 6], ['7-8', (m) => m >= 7 && m <= 8],
    ['9-10', (m) => m >= 9],
  ];
  let html = `<div class="big">Accuracy, against the instrument &nbsp; n=${accuracy.length} &nbsp; median dE2000 <b>${median(accuracy.map((r) => r.de2000)).toFixed(2)}</b></div>
    <table class="sum"><thead><tr><th>Monk</th><th>n</th><th>median dE</th><th>bias dL</th><th>bias da</th><th>bias db</th></tr></thead><tbody>`;
  for (const [name, test] of bands) {
    const r = accuracy.filter((x) => test(x.monkVisual));
    if (!r.length) { html += `<tr><td>${name}</td><td>0</td><td colspan="4" class="empty">not covered yet</td></tr>`; continue; }
    html += `<tr><td>${name}</td><td>${r.length}</td><td><b>${median(r.map((x) => x.de2000)).toFixed(2)}</b></td>
      <td>${median(r.map((x) => x.dL)).toFixed(1)}</td><td>${median(r.map((x) => x.da)).toFixed(1)}</td><td>${median(r.map((x) => x.db)).toFixed(1)}</td></tr>`;
  }
  html += '</tbody></table>';

  /* And by light, because the other half of the question is whether the room or the camera is
     doing the damage. */
  const lights = [...new Set(accuracy.map((r) => r.light))];
  if (lights.length > 1) {
    html += '<table class="sum"><thead><tr><th>light</th><th>n</th><th>median dE</th></tr></thead><tbody>';
    for (const l of lights) {
      const r = accuracy.filter((x) => x.light === l);
      html += `<tr><td>${l}</td><td>${r.length}</td><td><b>${median(r.map((x) => x.de2000)).toFixed(2)}</b></td></tr>`;
    }
    html += '</tbody></table>';
  }
  box.innerHTML += html;
}

function csv() {
  const rows = read();
  const cols: Array<keyof Trial> = ['id', 'at', 'subject', 'monkVisual', 'site', 'light', 'device',
    'de2000', 'dL', 'da', 'db', 'appIta', 'appMonk', 'confidence', 'band', 'capture', 'cct', 'samples'];
  const head = [...cols, 'refL', 'refA', 'refB', 'appL', 'appA', 'appB'].join(',');
  const lines = rows.map((t) => [
    ...cols.map((c) => {
      const v = t[c];
      return typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(4)) : String(v ?? '');
    }),
    t.ref ? t.ref.L.toFixed(2) : '', t.ref ? t.ref.a.toFixed(2) : '', t.ref ? t.ref.b.toFixed(2) : '',
    t.app.L.toFixed(2), t.app.a.toFixed(2), t.app.b.toFixed(2),
  ].join(','));
  return [head, ...lines].join('\n');
}

/* ---------------------------------------------------------------------------------------
   Wiring
   --------------------------------------------------------------------------------------- */

$('start').addEventListener('click', () => { void start(); });
$('capture').addEventListener('click', () => { void record(); });

$('copy').addEventListener('click', async () => {
  const text = csv();
  try { await navigator.clipboard.writeText(text); say(`copied ${read().length} rows`); }
  catch {
    const ta = $('dump') as HTMLTextAreaElement;
    ta.value = text; ta.hidden = false; ta.select();
    say('clipboard refused, select the text below');
  }
});

$('wipe').addEventListener('click', (e) => {
  const b = e.currentTarget as HTMLButtonElement;
  if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Really? This is the only copy'; return; }
  write([]); b.dataset.armed = ''; b.textContent = 'Clear all trials'; render();
});

window.addEventListener('pagehide', () => stream?.getTracks().forEach((t) => t.stop()));

render();
