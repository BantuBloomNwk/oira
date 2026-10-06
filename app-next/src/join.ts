/* The open study, for women: myoira.com/study and app.myoira.com/join.
 *
 * Not the operator harness (study.html), which carries camera switches, paper trials and a
 * table of everything. This asks for consent first, then her own shade, takes five scans
 * through exactly the app's own camera, frame reader and light gate, shows her every number
 * that would be sent, and sends only if she says so. The readings land in study-service on
 * our own server; the picture never leaves her phone.
 */

import './fonts.css';
import { warmUp, readFrame, consolidate, type ScanFrame } from './lib/scan';
import { openCamera } from './lib/capture';
import { monkFromIta, MONK_SWATCHES } from './lib/monk';
import { LIGHT_NUDGE } from './lib/voice';

const HOLD_MS = 3200;
const STEP_MS = 95;
const SCANS = 5;
const CODE_KEY = 'oira.study.code';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string) => {
  for (const s of document.querySelectorAll('main > section')) s.classList.add('hide');
  $(id).classList.remove('hide');
  window.scrollTo(0, 0);
};

/* ---- 1. consent ------------------------------------------------------------------------ */

const boxes = ['c-adult', 'c-ill', 'c-ok'].map((id) => $<HTMLInputElement>(id));
const refreshStart = () => { $<HTMLButtonElement>('b-start').disabled = !boxes.every((b) => b.checked) || !!savedCode(); };
boxes.forEach((b) => b.addEventListener('change', refreshStart));

fetch('/api/study/count')
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => {
    const n = j?.women ?? j?.submissions ?? 0;
    if (n > 0) {
      const el = $('count');
      el.textContent = `${n} ${n === 1 ? 'woman has' : 'women have'} joined so far`;
      el.classList.remove('hide');
    }
  })
  .catch(() => {});

const savedCode = () => { try { return localStorage.getItem(CODE_KEY); } catch { return null; } };
/* One phone, one taking part. A phone that has sent already sees a thank you, not a start
   button; she can delete her readings and start again if she wants to. */
if (savedCode()) {
  $('b-delete-mine').classList.remove('hide');
  $('already').classList.remove('hide');
  $<HTMLButtonElement>('b-start').classList.add('hide');
}
/* Deleting. On this phone the saved code is used; anywhere else she types the code she was
   given. Either way she confirms first: one tap should never be enough to lose her readings,
   or to let someone else holding her phone remove them. */
let pendingCode = '';
const askConfirm = (code: string) => { pendingCode = code; $('confirm').classList.remove('hide'); $('del-say').textContent = ''; };
$('b-confirm-no').addEventListener('click', () => { pendingCode = ''; $('confirm').classList.add('hide'); });
$('b-delete-mine').addEventListener('click', () => { const c = savedCode(); if (c) askConfirm(c); });
$('b-code-del').addEventListener('click', () => {
  const c = $<HTMLInputElement>('code-in').value.toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9]{4}-?[A-Z0-9]{4}-?[A-Z0-9]{4}$/.test(c)) { $('del-say').textContent = 'That code doesn\'t look right. It has three groups of four letters and numbers.'; return; }
  askConfirm(c.length === 12 ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}` : c);
});
$('b-confirm-yes').addEventListener('click', async () => {
  const code = pendingCode;
  if (!code) return;
  $('confirm').classList.add('hide');
  try {
    const r = await fetch('/api/study/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    const j = await r.json();
    if (!r.ok) throw new Error(String(r.status));
    if (code === savedCode()) {
      try { localStorage.removeItem(CODE_KEY); } catch { /* fine */ }
      $('b-delete-mine').classList.add('hide');
      $('already').classList.add('hide');
      $<HTMLButtonElement>('b-start').classList.remove('hide');
      refreshStart();
    }
    $<HTMLInputElement>('code-in').value = '';
    $('del-say').textContent = j.removed ? 'Done. Your readings are deleted.' : "We couldn't find any readings with that code. They may already be deleted.";
  } catch {
    $('del-say').textContent = "That didn't go through. Email info@myoira.com with your code and we'll do it.";
  }
  pendingCode = '';
});

/* ---- 2. her shade, her setting, her country ------------------------------------------------- */

/* Every country, named by her own phone in her own language. */
const ISO = 'AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(' ');
{
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }); } catch { names = null; }
  const sel = $<HTMLSelectElement>('country');
  ISO.map((c) => ({ c, n: names?.of(c) || c }))
    .sort((a, b) => a.n.localeCompare(b.n))
    .forEach(({ c, n }) => { const o = document.createElement('option'); o.value = c; o.textContent = n; sel.appendChild(o); });
  /* The way out stays, at the bottom. It used to be the preselected default, so leaving the box
     alone counted as declining: three of the first four women "chose" it without touching it. */
  const none = document.createElement('option'); none.value = 'none'; none.textContent = 'Rather not say'; sel.appendChild(none);
  sel.addEventListener('change', () => refreshShade());
}

let setting = '';
const refreshShade = () => { $<HTMLButtonElement>('b-shade').disabled = !(monkSelf && setting && $<HTMLSelectElement>('country').value); };
document.querySelectorAll<HTMLInputElement>('input[name=setting]').forEach((r) =>
  r.addEventListener('change', () => { setting = r.value; refreshShade(); }));

let monkSelf = 0;
const sw = $('swatches');
MONK_SWATCHES.forEach((hex, i) => {
  const d = document.createElement('div');
  d.className = 'sw';
  d.style.background = hex;
  d.setAttribute('role', 'button');
  d.setAttribute('aria-label', `Shade ${i + 1}`);
  d.innerHTML = `<b>${i + 1}</b>`;
  d.addEventListener('click', () => {
    monkSelf = i + 1;
    sw.querySelectorAll('.sw').forEach((x) => x.classList.remove('on'));
    d.classList.add('on');
    refreshShade();
  });
  sw.appendChild(d);
});

$('b-start').addEventListener('click', () => show('s-shade'));
$('b-shade').addEventListener('click', () => { show('s-scan'); void openScan(); });

/* ---- 3. the scans ------------------------------------------------------------------------ */

type Reading = {
  L: number; a: number; b: number; ita: number; monk: number; cct: number | null;
  confidence: number; band: 'firm' | 'fair' | 'thin'; verdict: string;
  whiteBalanced: boolean; strongCast: boolean; samples: number; lightLevel: number | null;
};
const readings: Reading[] = [];
const video = $<HTMLVideoElement>('cam');
const scratch = document.createElement('canvas');
const say = (t: string) => { $('say').textContent = t; };
let ready = false;
let scanning = false;

async function openScan() {
  const models = warmUp();
  try {
    const session = await openCamera();
    video.srcObject = session.stream;
    /* What the camera actually delivered, which differs between models. */
    try {
      const st = session.stream.getVideoTracks()[0]?.getSettings() ?? {};
      camera = `${st.width ?? '?'}x${st.height ?? '?'}${st.frameRate ? `@${Math.round(st.frameRate)}` : ''}`;
    } catch { camera = ''; }
    await video.play().catch(() => {});
  } catch {
    say("I couldn't open your camera. Check that this page is allowed to use it, then reload.");
    return;
  }
  say('Getting ready...');
  if (!(await models)) { say("This phone couldn't load the scanner, sorry. Thank you for trying."); return; }
  ready = true;
  $<HTMLButtonElement>('b-scan').disabled = false;
  void preview();
}

$('b-scan').addEventListener('click', () => {
  if (!ready || scanning) return;
  scanning = true;
  $<HTMLButtonElement>('b-scan').disabled = true;
  void runScans();
});

/* Is her face in the oval? The oval on screen is centred at (0.5, 0.48) and spans 64% of the
   width and 68% of the height. The face is judged by its outline's centre and width; the
   picture is mirrored for her but centring is symmetric, so the raw landmarks do. */
type Place = { ok: boolean; msg: string };
function placement(f: ScanFrame): Place {
  if (!f.landmarks) return { ok: false, msg: 'Fit your face in the oval for me.' };
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const p of f.landmarks) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const w = x1 - x0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (w < 0.3) return { ok: false, msg: 'Come a little closer.' };
  if (w > 0.72) return { ok: false, msg: 'Move back a little.' };
  const d = ((cx - 0.5) / 0.32) ** 2 + ((cy - 0.48) / 0.34) ** 2;
  if (d > 0.35) return { ok: false, msg: 'Centre your face in the oval.' };
  return { ok: true, msg: 'Lovely, hold still...' };
}
const ring = () => $('ring');
function ringState(state: 'idle' | 'ok' | 'scan') {
  ring().classList.toggle('ok', state !== 'idle');
  $('scanline').classList.toggle('on', state === 'scan');
}

/* While she lines up, before she taps Start, the ring still tells her where she is. */
async function preview() {
  while (ready && !scanning) {
    const f = readFrame(video, scratch, performance.now());
    const p = placement(f);
    ringState(p.ok ? 'ok' : 'idle');
    say(p.ok ? (f.light && !f.light.ok ? (LIGHT_NUDGE[f.light.verdict] ?? 'The light is a bit off.') : "You're in. Tap Start when you're ready.") : p.msg);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function oneScan(): Promise<Reading | null> {
  let heldSince: number | null = null;
  let frames: ScanFrame[] = [];
  const t0 = performance.now();
  while (performance.now() - t0 < 45_000) {
    const now = performance.now();
    const f = readFrame(video, scratch, now);
    const place = placement(f);
    if (!place.ok) {
      heldSince = null; frames = []; $('bar').style.width = '0%';
      ringState('idle');
      say(place.msg);
    } else if (f.light && !f.light.ok) {
      ringState('ok');
      /* The same gate as the app: a reading under the wrong light is a different woman. */
      heldSince = null; frames = []; $('bar').style.width = '0%';
      say(LIGHT_NUDGE[f.light.verdict] ?? 'The light is a bit off. A window would help.');
    } else {
      if (heldSince == null) heldSince = now;
      ringState('scan');
      if (f.skin) frames.push(f);
      const held = now - heldSince;
      $('bar').style.width = `${Math.min(100, (held / HOLD_MS) * 100)}%`;
      say('Lovely, hold still...');
      if (held >= HOLD_MS && frames.length >= 3) {
        const c = consolidate(frames, frames[frames.length - 1]);
        if (!c.skin) return null;
        return {
          L: c.skin.lab.L, a: c.skin.lab.a, b: c.skin.lab.b, ita: c.skin.ita, monk: monkFromIta(c.skin.ita),
          cct: c.light ? Math.round(c.light.cct) : null,
          confidence: c.confidence?.score ?? 0, band: c.confidence?.band ?? 'thin',
          verdict: c.light?.verdict ?? 'dim', whiteBalanced: c.skin.whiteBalanced,
          strongCast: c.skin.strongCast, samples: c.skin.samples,
          lightLevel: c.light ? Math.round(c.light.level * 1000) / 1000 : null,
        };
      }
    }
    await new Promise((r) => setTimeout(r, STEP_MS));
  }
  return null;
}

async function runScans() {
  const dots = $('dots').querySelectorAll('i');
  while (readings.length < SCANS) {
    const r = await oneScan();
    if (!r) {
      say("That one didn't work. Let's go again, face the window if you can.");
      $<HTMLButtonElement>('b-scan').disabled = false;
      $('b-scan').textContent = 'Try again';
      scanning = false;
      return;
    }
    readings.push(r);
    ringState('ok');
    dots[readings.length - 1]?.classList.add('on');
    $('bar').style.width = '0%';
    if (readings.length < SCANS) {
      say(`${readings.length} of ${SCANS}. Relax for a second...`);
      await new Promise((res) => setTimeout(res, 1200));
    }
  }
  (video.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  await review();
}

/* ---- 4. what would be sent ---------------------------------------------------------------- */

let model = '';
let platform: 'android' | 'ios' | 'ipad' | 'desktop' | 'other' = 'other';
let browser = '';
let make = '';
let camera = '';
const screenId = `${Math.min(screen.width, screen.height)}x${Math.max(screen.width, screen.height)}@${Math.round((devicePixelRatio || 1) * 10) / 10}`;

/* The maker, from the model code an Android phone reports. Codes, not names, because that
   is what Chrome gives: SM-A135F is a Samsung Galaxy A13. Unknown stays unknown. */
function makerOf(code: string): string {
  const m = code.toUpperCase();
  const rules: [RegExp, string][] = [
    [/^SM-|^SAMSUNG|^GT-|^SC-|^SCV/, 'Samsung'], [/^PIXEL/, 'Google'], [/^TECNO|^KG\d|^KH\d|^CK\d|^LH\d|^BG\d/, 'Tecno'],
    [/^INFINIX|^X6\d\d/, 'Infinix'], [/^ITEL|^A\d{2}[A-Z]?$/, 'itel'], [/^RMX/, 'Realme'], [/^CPH/, 'Oppo or OnePlus'],
    [/^V2\d{3}|^VIVO/, 'vivo'], [/^REDMI|^POCO|^M2\d{3}|^2\d{6}[A-Z]{1,3}$|^XIAOMI|^MI /, 'Xiaomi'], [/^MOTO|^XT\d/, 'Motorola'],
    [/^NOKIA|^TA-\d/, 'Nokia'], [/^ONEPLUS|^[A-Z]{2}\d{4}$/, 'OnePlus'], [/^HUAWEI|^[A-Z]{3}-[A-Z]{1,2}\d/, 'Huawei or Honor'],
    [/^HONOR/, 'Honor'], [/^LG-|^LM-/, 'LG'], [/^SONY|^XQ-/, 'Sony'], [/^ASUS|^ASUS_/, 'Asus'],
  ];
  for (const [re, name] of rules) if (re.test(m)) return name;
  return 'unknown';
}

/* Safari never says which iPhone it is. The screen narrows it to a family; she can say
   which one exactly, if she knows. Points are portrait CSS pixels, then the pixel ratio. */
const IPHONE_FAMILIES: Record<string, string[]> = {
  '375x667@2': ['iPhone SE (2nd or 3rd gen)', 'iPhone 8', 'iPhone 7', 'iPhone 6s'],
  '414x736@3': ['iPhone 8 Plus', 'iPhone 7 Plus', 'iPhone 6s Plus'],
  '375x812@3': ['iPhone 13 mini', 'iPhone 12 mini', 'iPhone 11 Pro', 'iPhone XS', 'iPhone X'],
  '414x896@2': ['iPhone 11', 'iPhone XR'],
  '414x896@3': ['iPhone 11 Pro Max', 'iPhone XS Max'],
  '390x844@3': ['iPhone 14', 'iPhone 13', 'iPhone 13 Pro', 'iPhone 12', 'iPhone 12 Pro'],
  '428x926@3': ['iPhone 14 Plus', 'iPhone 13 Pro Max', 'iPhone 12 Pro Max'],
  '393x852@3': ['iPhone 16', 'iPhone 15', 'iPhone 15 Pro', 'iPhone 14 Pro', 'iPhone 16e'],
  '430x932@3': ['iPhone 16 Plus', 'iPhone 15 Plus', 'iPhone 15 Pro Max', 'iPhone 14 Pro Max'],
  '402x874@3': ['iPhone 17', 'iPhone 17 Pro', 'iPhone 16 Pro'],
  '440x956@3': ['iPhone 17 Pro Max', 'iPhone 16 Pro Max'],
  '420x912@3': ['iPhone Air'],
};
const ALL_IPHONES = [...new Set(Object.values(IPHONE_FAMILIES).flat())];

async function detectPhone() {
  const ua = navigator.userAgent;
  /* An iPad's Safari says it is a Mac; a touch screen gives it away. */
  const touch = (navigator.maxTouchPoints || 0) > 1;
  browser = /FBAN|FBAV/.test(ua) ? 'in-app Facebook' : /Instagram/.test(ua) ? 'in-app Instagram' : /WhatsApp/.test(ua) ? 'in-app WhatsApp'
    : /Twitter|TwitterAndroid/.test(ua) ? 'in-app X' : /Telegram/.test(ua) ? 'in-app Telegram' : /LinkedInApp/.test(ua) ? 'in-app LinkedIn'
    : /GSA\//.test(ua) ? 'in-app Google' : /Pinterest/.test(ua) ? 'in-app Pinterest' : /Discord/.test(ua) ? 'in-app Discord'
    : /Threads|Barcelona/.test(ua) ? 'in-app Threads' : /DuckDuckGo/.test(ua) ? 'DuckDuckGo' : /Brave/.test(ua) ? 'Brave'
    : /TikTok|musical_ly/.test(ua) ? 'in-app TikTok' : /Snapchat/.test(ua) ? 'in-app Snapchat' : /Line\//.test(ua) ? 'in-app Line'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /EdgA?\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /CriOS/.test(ua) ? 'Chrome' : /FxiOS|Firefox/.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    /* An iPhone web view without "Safari/" is an app's built-in browser that does not name itself. */
    : /iPhone|iPad|iPod/.test(ua) ? 'in-app (unnamed)' : 'other';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) { platform = 'ipad'; model = 'iPad'; make = 'Apple'; }
  else if (/iPhone|iPod/.test(ua)) {
    platform = 'ios'; make = 'Apple';
    const fam = IPHONE_FAMILIES[screenId];
    model = fam ? `iPhone (${fam.length === 1 ? fam[0] : `${fam[fam.length - 1].replace('iPhone ', '')} to ${fam[0].replace('iPhone ', '')} class`})` : 'iPhone';
    /* Ask which one, likely ones first. Optional. */
    const sel = $<HTMLSelectElement>('iphone');
    [...(fam ?? []), ...ALL_IPHONES.filter((n) => !fam?.includes(n))].forEach((n) => {
      const o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o);
    });
    $('iphone-q').classList.remove('hide');
  }
  else if (/Android/.test(ua)) {
    platform = 'android';
    /* Chrome hides the model in the user agent now; it will say it when asked. */
    const uad = (navigator as Navigator & { userAgentData?: { getHighEntropyValues: (h: string[]) => Promise<{ model?: string }> } }).userAgentData;
    try { model = (await uad?.getHighEntropyValues(['model']))?.model || ''; } catch { model = ''; }
    if (!model) model = (/Android [\d.]+; ([^;)]+)/.exec(ua)?.[1] || 'Android').trim();
    make = /SamsungBrowser/.test(ua) ? 'Samsung' : makerOf(model);
  } else if (/Windows|Macintosh|Linux|CrOS/.test(ua)) { platform = 'desktop'; model = /Windows/.test(ua) ? 'Windows computer' : /Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : 'Linux computer'; }
  else model = 'other';
  model = model.replace(/[^\w .()+\-/,]/g, '').slice(0, 40);
}

const phoneReady = detectPhone();

async function review() {
  await phoneReady;
  const modelSelf = $<HTMLSelectElement>('iphone').value;
  const country = $<HTMLSelectElement>('country').value === 'none' ? '' : $<HTMLSelectElement>('country').value;
  const countryName = $<HTMLSelectElement>('country').selectedOptions[0]?.text || '';
  const rows = readings.map((r, i) => `<tr><td>${i + 1}</td><td>${r.L.toFixed(1)}</td><td>${r.a.toFixed(1)}</td><td>${r.b.toFixed(1)}</td><td>${r.monk}</td><td>${r.cct ?? '-'}</td><td>${Math.round(r.confidence * 100)}%</td></tr>`).join('');
  $('review').innerHTML = `
    <p><b>The shade you picked:</b> ${monkSelf} of 10</p>
    <p><b>Your device:</b> ${make && make !== 'unknown' ? `${make} ` : ''}${modelSelf || model} (${browser}) &nbsp; <b>Camera:</b> ${camera || '-'}${country ? ` &nbsp; <b>Country:</b> ${countryName}` : ''}</p>
    <p><b>Where you scanned:</b> ${({ window: 'by a window, in daylight', outdoor: 'outside', indoor: 'indoors, under lights', unsure: 'not sure' } as Record<string, string>)[setting] ?? '-'} &nbsp; <b>Your local hour:</b> ${new Date().getHours()}:00</p>
    <table><thead><tr><th>Scan</th><th>Lightness</th><th>Redness</th><th>Yellowness</th><th>Shade</th><th>Room light (K)</th><th>How sure</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted" style="margin-top:10px">Also sent with each scan, for the science: the angle those colours make, how bright the light was, whether the white of your eye could be used to check the light, and how many points of skin were read. All numbers.</p>`;
  show('s-review');
}

/* ---- 5. send ------------------------------------------------------------------------------ */

function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(b, (x) => abc[x % abc.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

$('b-send').addEventListener('click', async () => {
  const btn = $<HTMLButtonElement>('b-send');
  btn.disabled = true;
  $('send-say').textContent = 'Sending...';
  const code = newCode();
  const body = {
    v: 1, adult: true, consent: true, notIllinois: true, monkSelf, platform, model,
    country: $<HTMLSelectElement>('country').value === 'none' ? '' : $<HTMLSelectElement>('country').value, code, readings,
    setting, localHour: new Date().getHours(), browser,
    make, modelSelf: $<HTMLSelectElement>('iphone').value, camera, screen: screenId,
    /* This phone has sent before: the count adds her readings but not another woman. */
    repeat: !!(() => { try { return localStorage.getItem(CODE_KEY); } catch { return null; } })(),
  };
  try {
    const r = await fetch('/api/study/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(String(r.status));
    try { localStorage.setItem(CODE_KEY, code); } catch { /* she still has the code on screen */ }
    $('code').textContent = code;
    show('s-done');
  } catch {
    btn.disabled = false;
    $('send-say').textContent = "That didn't send. Check your connection and tap again. Nothing was kept.";
  }
});

$('b-nosend').addEventListener('click', () => show('s-nosend'));
