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
import { toLinear, scleraFullRes, linearToLab, type PatchName, type Lin } from './lib/skin';
import { readPaper, paperZone, type PaperSide } from './lib/paper';
import { readLight } from './lib/light';
import { CameraControl } from './lib/camera-control';
import { h, fill } from './lib/dom';

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
  /* Added 2026-10-04. Optional so rows taken before then still load. */
  /* Which camera and what it actually delivered, not what was asked for. */
  facing?: string;
  res?: string;
  /* What the camera says it can control, once per session. If exposure and white balance
     are not listed here, camera control is not an option on this phone. */
  caps?: string;
  /* The light check's verdict and the eye-white correction it rested on. */
  lightVerdict?: string | null;
  lightLevel?: number | null;
  clipped?: number | null;
  whiteBalanced?: boolean;
  strongCast?: boolean;
  gains?: string | null;
  /* The fixed patches, median over the hold, next to the whole-face reading above. */
  patches?: Partial<Record<PatchName, (Lab & { ita: number }) | null>>;
  /* Camera control asked for on this trial, and what it actually did. */
  camctl?: 'on' | 'off';
  camctlNote?: string;
  /* The whole-face reading with exposure taken out (skin.ts exposureNorm), median over the hold. */
  norm?: (Lab & { ita: number }) | null;
  /* The sclera read at the camera's full resolution (skin.ts scleraFullRes), median over the
     hold, against `cct` above, which is the scan's own low resolution read. With a paper
     reading in the same light seconds later, this says how much of the sclera's warmth was
     resolution. */
  eyeFullCct?: number | null;
  eyeFullVerdict?: string | null;
  eyeFullGains?: string | null;
  eyeFullPx?: number | null;
  /* Paper held beside her face, read in the SAME frames as her skin (lib/paper.ts). */
  paperSide?: string;
  /* Exposure compensation asked for on paper trials, in stops. */
  paperEv?: string;
  paperFrames?: string;          /* frames where paper passed / frames read */
  paperWhy?: string;             /* why it failed, on the last failing frame */
  paperCct?: number | null;
  paperVerdict?: string | null;
  paperGains?: string | null;
  paperCoverage?: number | null;
  paperSpread?: number | null;
  paperClip?: number | null;
  /* The paper's brightness (linear luminance) and her skin's, same frames, so a reading can
     later be scaled to the paper's brightness as well as corrected to its colour. */
  paperY?: number | null;
  skinY?: number | null;
  /* Sclera minus paper in mired (1e6/K). Positive: the sclera read warmer than the paper. */
  miredGap?: number | null;
  /* Her skin corrected against the paper instead of the sclera: within the wider clamp
     Fable proposed (0.7 to 1.45), and with no clamp at all. */
  byPaper?: (Lab & { ita: number }) | null;
  byPaperFree?: (Lab & { ita: number }) | null;
}

const PATCHES: PatchName[] = ['cheekL', 'cheekR', 'forehead', 'chin'];
const f1 = (v: number | null | undefined, d = 1) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '-');

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
const session = { facing: '', res: '', caps: '' };
let control: CameraControl | null = null;
const eyeCanvas = document.createElement('canvas');
let eyeWhites: Lin[] = [];
let eyePx: number[] = [];
const paperCanvas = document.createElement('canvas');
let paperWhites: Lin[] = [];
let paperReads: { coverage: number; spread: number; clipped: number }[] = [];
let paperTried = 0;
let paperLastWhy = '';
let raws: Lin[] = [];
let heldZone: { x: number; y: number; w: number; h: number } | null = null;
const video = document.getElementById('cam') as HTMLVideoElement;
const scratch = document.createElement('canvas');
const $ = (id: string) => document.getElementById(id)!;
const val = (id: string) => ($(id) as HTMLInputElement).value.trim();
/* An empty box is NaN, not 0. Number('') is 0, so an empty instrument reading used to count
   as a reading of pure black and every repeatability-only trial was graded against it. */
const num = (id: string) => {
  const v = ($(id) as HTMLInputElement).value.trim();
  return v === '' ? NaN : Number(v);
};

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
    /* The app's own camera by default: front, asking for 720x960, the same request
       lib/capture.ts makes. Measuring a better camera than the one she scans with gave a
       number about a setup nobody uses. Rear stays one tap away, for the front versus rear
       comparison, and every trial records which it was and what the camera delivered. */
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: val('facing') || 'user', width: { ideal: 720 }, height: { ideal: 960 } },
    });
    const track = stream.getVideoTracks()[0];
    const st = track?.getSettings?.() ?? {};
    session.facing = st.facingMode || val('facing') || 'user';
    session.res = `${st.width ?? '?'}x${st.height ?? '?'}`;
    const caps = (track as MediaStreamTrack & { getCapabilities?: () => Record<string, unknown> })?.getCapabilities?.() ?? {};
    const keys = ['exposureMode', 'whiteBalanceMode', 'exposureCompensation', 'exposureTime', 'colorTemperature', 'iso', 'focusMode', 'pointsOfInterest'];
    session.caps = keys.filter((k) => k in caps).map((k) => {
      const v = caps[k];
      if (Array.isArray(v)) return `${k}=${v.join('/')}`;
      if (v && typeof v === 'object') return `${k}=${(v as { min?: number }).min}..${(v as { max?: number }).max}`;
      return k;
    }).join(' ') || 'none';
  } catch {
    say('camera refused', true); return;
  }
  video.srcObject = stream;
  await video.play().catch(() => {});
  $('capture').removeAttribute('disabled');
  $('paper').removeAttribute('disabled');
  startOverlay();
  say(`ready, ${session.facing} camera at ${session.res}. Camera controls: ${session.caps}. Fill the form, put the instrument on the same spot if there is one, then capture.`);
}

/* ---------------------------------------------------------------------------------------
   What is being read, drawn on her face.

   A few times a second between trials: the patch circles where skin.ts will read them, and the
   box for the paper test. The first A13 bench read the background through a cheek patch and
   nobody could see it; now anyone can.
   --------------------------------------------------------------------------------------- */
let busy = false;
function startOverlay() {
  const cv = $('overlay') as HTMLCanvasElement;
  const draw = () => {
    if (!stream) return;
    const W = video.clientWidth, H = video.clientHeight;
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(W * 0.25, H * 0.25, W * 0.5, H * 0.5);
    ctx.setLineDash([]);
    if (!busy) {
      const f = readFrame(video, scratch, performance.now());
      const side = val('paperSide');
      if (f.landmarks && (side === 'left' || side === 'right')) {
        const z = heldZone ?? paperZone(f.landmarks, side as PaperSide);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]);
        ctx.strokeRect(z.x * W, z.y * H, z.w * W, z.h * H); ctx.setLineDash([]);
        ctx.fillStyle = '#fff'; ctx.font = '11px system-ui'; ctx.fillText('paper here', z.x * W + 2, z.y * H - 3);
      }
      const at = f.skin?.patchAt;
      if (at) {
        for (const [name, p] of Object.entries(at)) {
          if (!p) continue;
          ctx.strokeStyle = name.startsWith('cheek') ? '#E8BE60' : '#7FD1C1'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x * W, p.y * H, p.r * W, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = '10px system-ui'; ctx.fillText(name, p.x * W + p.r * W + 2, p.y * H);
        }
      }
    }
    setTimeout(draw, 350);
  };
  draw();
}

/* The paper test. A sheet of plain white paper filling the dashed box is a white reference
   that is not her eye. If the paper reads as daylight while her sclera reads as a warm bulb,
   the light check is being fooled by the sclera, not by the room. */
async function measurePaper() {
  for (const f of ['subject', 'light', 'device']) {
    if (!val(f)) { say(`${f} is required`, true); return; }
  }
  const W = video.videoWidth, H = video.videoHeight;
  scratch.width = W; scratch.height = H;
  const ctx = scratch.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, W, H);
  const x0 = Math.floor(W * 0.25), y0 = Math.floor(H * 0.25), bw = Math.floor(W * 0.5), bh = Math.floor(H * 0.5);
  const d = ctx.getImageData(x0, y0, bw, bh).data;
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  let clip = 0;
  for (let i = 0; i < d.length; i += 4 * 3) {
    rs.push(toLinear(d[i])); gs.push(toLinear(d[i + 1])); bs.push(toLinear(d[i + 2]));
    if (d[i] > 250 || d[i + 1] > 250 || d[i + 2] > 250) clip++;
  }
  const white = { r: median(rs), g: median(gs), b: median(bs) };
  const light = readLight(white, clip / rs.length);
  const wl = 0.2126 * white.r + 0.7152 * white.g + 0.0722 * white.b;
  const lin2lab = (c: number) => (c > 0.008856 ? Math.cbrt(c) : 7.787 * c + 16 / 116);
  const X = (white.r * 0.4124 + white.g * 0.3576 + white.b * 0.1805) / 0.95047, Y = wl, Z = (white.r * 0.0193 + white.g * 0.1192 + white.b * 0.9505) / 1.08883;
  const lab = { L: 116 * lin2lab(Y) - 16, a: 500 * (lin2lab(X) - lin2lab(Y)), b: 200 * (lin2lab(Y) - lin2lab(Z)) };
  const t: Trial = {
    id: (crypto.randomUUID?.() ?? String(Math.random())).slice(0, 8), at: Date.now(),
    subject: val('subject'), monkVisual: num('monkVisual') || 0, site: 'paper', light: val('light'), device: val('device'),
    ref: null, app: lab, appIta: NaN, appMonk: null, confidence: null, band: null, capture: null,
    cct: Math.round(light.cct), samples: rs.length, de2000: null, dL: null, da: null, db: null,
    facing: session.facing, res: session.res, caps: session.caps,
    lightVerdict: light.verdict, lightLevel: light.level, clipped: clip / rs.length,
    gains: [white.r, white.g, white.b].map((c) => (wl / (c || wl)).toFixed(3)).join('/'),
    camctl: 'off', camctlNote: 'paper',
  };
  const all = read(); all.push(t); write(all); render();
  say(`paper: ${Math.round(light.cct)}K, ${light.verdict}, level ${light.level.toFixed(2)}, gains ${t.gains}`);
}

/* One trial: hold, sample, consolidate, exactly as the app does. */
async function capture(): Promise<{ final: ScanFrame; frames: ScanFrame[] } | null> {
  busy = true;
  try { return await captureInner(); } finally { busy = false; heldZone = null; }
}
async function captureInner(): Promise<{ final: ScanFrame; frames: ScanFrame[] } | null> {
  /* With camera control on, every trial starts from automatic and meters and locks again,
     exactly as a scan in the app does, so on and off trials can sit side by side. */
  control = new CameraControl(stream!, val('camctl') === 'on');
  if (val('camctl') === 'on') {
    const track = stream!.getVideoTracks()[0];
    try { await track.applyConstraints({ advanced: [{ exposureMode: 'continuous', whiteBalanceMode: 'continuous', exposureCompensation: 0 } as MediaTrackConstraintSet] }); } catch { /* not supported */ }
    /* Let automatic exposure settle from the reset before metering, or the hunt it starts
       runs on into the hold. The first A13 bench did exactly that. */
    say('settling...');
    await new Promise((r) => setTimeout(r, 1500));
    say('metering...');
    while (!control.settled) {
      const now = performance.now();
      const f = readFrame(video, scratch, now);
      control.feed(f.light?.level ?? null, now);
      await new Promise((r) => setTimeout(r, SAMPLE_MS));
    }
    say('hold still...');
  }
  /* Paper trials can ask for less exposure so a white sheet beside a deep skinned face does
     not blow out. Exposure compensation only, which a Galaxy A13 honours; never a manual
     white balance, which turned its frames magenta. Back to 0 for trials without paper. */
  {
    const track = stream!.getVideoTracks()[0];
    const wantEv = val('paperSide') === 'none' ? 0 : Number(val('paperEv') || 0);
    const caps = (track.getCapabilities?.() ?? {}) as { exposureCompensation?: { min: number; max: number } };
    if (caps.exposureCompensation) {
      try {
        await Promise.race([
          track.applyConstraints({ advanced: [{ exposureCompensation: Math.max(caps.exposureCompensation.min, Math.min(caps.exposureCompensation.max, wantEv)) } as MediaTrackConstraintSet] }),
          new Promise((r) => setTimeout(r, 1500)),
        ]);
      } catch { /* not honoured; the trial records what was asked */ }
      if (wantEv !== 0) { say('settling exposure...'); await new Promise((r) => setTimeout(r, 1200)); }
    }
  }
  const frames: ScanFrame[] = [];
  eyeWhites = []; eyePx = [];
  paperWhites = []; paperReads = []; paperTried = 0; paperLastWhy = ''; raws = []; heldZone = null;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      const now = performance.now();
      const f = readFrame(video, scratch, now);
      if (f.skin) {
        frames.push(f);
        if (f.landmarks) {
          const e = scleraFullRes(video, f.landmarks, eyeCanvas);
          if (e) { eyeWhites.push(e.white); eyePx.push(e.pixels); }
          const side = val('paperSide');
          if (side === 'left' || side === 'right') {
            paperTried++;
            /* The zone is fixed at the first frame of the hold, so the box does not move. */
            if (!heldZone) heldZone = paperZone(f.landmarks, side as PaperSide);
            const pr = readPaper(video, f.landmarks, side as PaperSide, paperCanvas, heldZone);
            if (pr?.ok) { paperWhites.push(pr.white); paperReads.push(pr); if (pr.why !== 'ok') paperLastWhy = pr.why; }
            else if (pr) { paperLastWhy = `${pr.why}; coverage ${Math.round(pr.coverage * 100)}%, blown ${Math.round(pr.clipped * 100)}%`; }
          }
        }
        if (f.skin?.raw) raws.push(f.skin.raw);
      }
      $('count').textContent = String(frames.length);
      if (now - t0 < HOLD_MS) { setTimeout(tick, SAMPLE_MS); return; }
      if (!frames.length) { resolve(null); return; }
      resolve({ final: consolidate(frames, frames[frames.length - 1]), frames });
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
  const got = await capture();
  $('capture').removeAttribute('disabled');
  const frame = got?.final;

  if (!frame?.skin) { say('no skin reading, nothing recorded. Try again.', true); return; }

  /* Each patch is the median over the hold, the same way consolidate() takes the whole face. */
  const patches: Trial['patches'] = {};
  for (const name of PATCHES) {
    const ps = got!.frames.map((f) => f.skin?.patches?.[name]).filter((p): p is NonNullable<typeof p> => !!p);
    patches[name] = ps.length
      ? { L: median(ps.map((p) => p.lab.L)), a: median(ps.map((p) => p.lab.a)), b: median(ps.map((p) => p.lab.b)), ita: median(ps.map((p) => p.ita)) }
      : null;
  }
  const ns = got!.frames.map((f) => f.skin?.exposureNorm).filter((p): p is NonNullable<typeof p> => !!p);
  const norm = ns.length
    ? { L: median(ns.map((p) => p.lab.L)), a: median(ns.map((p) => p.lab.a)), b: median(ns.map((p) => p.lab.b)), ita: median(ns.map((p) => p.ita)) }
    : null;
  let eyeFull: Pick<Trial, 'eyeFullCct' | 'eyeFullVerdict' | 'eyeFullGains' | 'eyeFullPx'> = { eyeFullCct: null, eyeFullVerdict: null, eyeFullGains: null, eyeFullPx: null };
  if (eyeWhites.length) {
    const ew = { r: median(eyeWhites.map((c) => c.r)), g: median(eyeWhites.map((c) => c.g)), b: median(eyeWhites.map((c) => c.b)) };
    const el = readLight(ew, 0);
    const lv = 0.2126 * ew.r + 0.7152 * ew.g + 0.0722 * ew.b;
    eyeFull = {
      eyeFullCct: Math.round(el.cct), eyeFullVerdict: el.verdict,
      eyeFullGains: [ew.r, ew.g, ew.b].map((c) => (lv / (c || lv)).toFixed(3)).join('/'),
      eyeFullPx: Math.round(median(eyePx)),
    };
  }
  /* Paper, same frames. */
  const side = val('paperSide');
  let paper: Partial<Trial> = { paperSide: side || 'none' };
  if (side === 'left' || side === 'right') {
    paper.paperFrames = `${paperWhites.length}/${paperTried}`;
    paper.paperWhy = paperWhites.length ? (paperLastWhy.startsWith('partly') ? paperLastWhy : 'ok') : paperLastWhy || 'no paper found';
    paper.paperEv = val('paperEv');
    if (paperWhites.length >= 3 && raws.length) {
      const pw = { r: median(paperWhites.map((c) => c.r)), g: median(paperWhites.map((c) => c.g)), b: median(paperWhites.map((c) => c.b)) };
      const pl = readLight(pw, 0);
      const pv = 0.2126 * pw.r + 0.7152 * pw.g + 0.0722 * pw.b;
      const rawSkin = { r: median(raws.map((c) => c.r)), g: median(raws.map((c) => c.g)), b: median(raws.map((c) => c.b)) };
      const correct = (lo: number, hi: number) => {
        const g = (c: number) => Math.min(hi, Math.max(lo, pv / (c || pv)));
        const lab = linearToLab({ r: rawSkin.r * g(pw.r), g: rawSkin.g * g(pw.g), b: rawSkin.b * g(pw.b) });
        return { ...lab, ita: (Math.atan2(lab.L - 50, lab.b) * 180) / Math.PI };
      };
      paper = {
        ...paper,
        paperCct: Math.round(pl.cct), paperVerdict: pl.verdict,
        paperGains: [pw.r, pw.g, pw.b].map((c) => (pv / (c || pv)).toFixed(3)).join('/'),
        paperCoverage: median(paperReads.map((r) => r.coverage)),
        paperSpread: median(paperReads.map((r) => r.spread)),
        paperClip: median(paperReads.map((r) => r.clipped)),
        paperY: pv,
        skinY: 0.2126 * rawSkin.r + 0.7152 * rawSkin.g + 0.0722 * rawSkin.b,
        miredGap: frame.light?.cct ? Math.round(1e6 / frame.light.cct - 1e6 / pl.cct) : null,
        byPaper: correct(0.7, 1.45),
        byPaperFree: correct(0, Infinity),
      };
    }
  }
  const w = frame.skin.white;
  const wl = w ? 0.2126 * w.r + 0.7152 * w.g + 0.0722 * w.b : 0;

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
    capture: control?.report().locked ? 'controlled' : (frame.confidence?.capture ?? null),
    cct: frame.light ? Math.round(frame.light.cct) : null,
    samples: frame.skin.samples,
    de2000: ref ? ciede2000(ref, app) : null,
    dL: ref ? app.L - ref.L : null,
    da: ref ? app.a - ref.a : null,
    db: ref ? app.b - ref.b : null,
    facing: session.facing, res: session.res, caps: session.caps,
    lightVerdict: frame.light?.verdict ?? null,
    lightLevel: frame.light?.level ?? null,
    clipped: frame.skin.clipped,
    whiteBalanced: frame.skin.whiteBalanced,
    strongCast: frame.skin.strongCast,
    /* The raw gains the eye-white asks for, before the clamp. */
    gains: w ? [w.r, w.g, w.b].map((c) => (wl / (c || wl)).toFixed(3)).join('/') : null,
    patches,
    norm,
    ...eyeFull,
    ...paper,
    camctl: val('camctl') === 'on' ? 'on' : 'off',
    camctlNote: control?.report().note ?? '',
  };

  const all = read();
  all.push(t);
  write(all);
  render();
  say(t.paperSide && t.paperSide !== 'none'
    ? (t.paperCct ? `same frame: eyes ${t.cct ?? '?'}K, paper ${t.paperCct}K (${t.paperFrames} frames). Monk by eyes ${t.appMonk}, by paper ${monkFromIta(t.byPaper!.ita)}` : `paper not read: ${t.paperWhy} (${t.paperFrames} frames). Recorded anyway.`)
    : t.de2000 === null
    ? `${t.eyeFullCct ? `eyes ${t.cct ?? '?'}K / ${t.eyeFullCct}K full res. ` : ''}recorded, no instrument reading. L* ${app.L.toFixed(1)} a* ${app.a.toFixed(1)} b* ${app.b.toFixed(1)}, ITA ${t.appIta.toFixed(1)}`
    : `recorded. dE2000 ${t.de2000!.toFixed(2)}  (dL ${t.dL!.toFixed(1)} da ${t.da!.toFixed(1)} db ${t.db!.toFixed(1)})`);
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
  fill(body);
  for (const t of [...rows].reverse()) {
    const paper = t.paperSide && t.paperSide !== 'none'
      ? `${t.paperCct ?? '-'}K ${t.paperFrames ?? ''}${t.byPaper ? `, ITA ${f1(t.byPaper.ita)} (${monkFromIta(t.byPaper.ita)})` : ` ${t.paperWhy ?? ''}`}`
      : '-';
    body.appendChild(h('tr', {},
      h('td', {}, t.subject), h('td', {}, t.monkVisual), h('td', {}, t.site), h('td', {}, t.light),
      h('td', {}, t.device),
      h('td', {}, h('b', {}, f1(t.de2000, 2))),
      h('td', {}, f1(t.dL)), h('td', {}, f1(t.da)), h('td', {}, f1(t.db)),
      h('td', {}, `${f1(t.appIta)}${t.norm ? ` (${f1(t.norm.ita)})` : ''}`),
      h('td', {}, `${t.appMonk ?? '-'}${t.norm ? ` (${monkFromIta(t.norm.ita)})` : ''}`),
      h('td', {}, `${f1(t.patches?.cheekL?.ita)} / ${f1(t.patches?.cheekR?.ita)}`),
      h('td', {}, `${t.facing ?? '-'}${t.camctl === 'on' ? (t.capture === 'controlled' ? ' locked' : ' unlocked') : ''}`),
      h('td', {}, t.lightVerdict ?? '-'),
      h('td', {}, t.confidence?.toFixed(2) ?? '-'),
      h('td', {}, `${t.cct ?? '-'}${t.eyeFullCct ? ` / ${t.eyeFullCct}` : ''}`),
      h('td', {}, paper)));
  }

  const box = $('summary');
  if (!rows.length) { fill(box, h('p', { class: 'empty' }, 'No trials yet.')); return; }

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
    /* Camera and control in the key too: front against rear and control on against off are
       the comparisons this is for, and pooling them would hide exactly that difference. */
    const k = `${t.subject} / ${t.site} / ${t.light} / ${t.device} / ${t.facing ?? '?'} / control ${t.camctl ?? 'off'}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const table = (heads: string[], trs: HTMLElement[]) =>
    h('table', { class: 'sum' }, h('thead', {}, h('tr', {}, ...heads.map((x) => h('th', {}, x)))), h('tbody', {}, ...trs));
  const repeats = [...groups.entries()].filter(([, v]) => v.length > 1);
  if (repeats.length) {
    const trs = repeats.map(([k, v]) => {
      /* Every pair against every other, so one outlier cannot hide behind an average. */
      const ds: number[] = [];
      for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) ds.push(ciede2000(v[i].app, v[j].app));
      return h('tr', {}, h('td', {}, k), h('td', {}, v.length), h('td', {}, h('b', {}, median(ds).toFixed(2))), h('td', {}, Math.max(...ds).toFixed(2)));
    });
    fill(box, h('div', { class: 'big' }, 'Repeatability, no instrument needed'),
      table(['subject / site / light / device / camera / control', 'n', 'spread dE2000', 'worst pair'], trs));
  } else {
    fill(box, h('p', { class: 'empty' }, 'Capture the same subject, site and light more than once to get a repeatability figure. That one needs no instrument.'));
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
  const NB = ' ';
  box.append(h('div', { class: 'big' }, `Accuracy, against the instrument ${NB} n=${accuracy.length} ${NB} median dE2000 `,
    h('b', {}, median(accuracy.map((r) => r.de2000)).toFixed(2))));
  box.append(table(['Monk', 'n', 'median dE', 'bias dL', 'bias da', 'bias db'], bands.map(([name, test]) => {
    const r = accuracy.filter((x) => test(x.monkVisual));
    if (!r.length) return h('tr', {}, h('td', {}, name), h('td', {}, 0), h('td', { colspan: 4, class: 'empty' }, 'not covered yet'));
    return h('tr', {}, h('td', {}, name), h('td', {}, r.length), h('td', {}, h('b', {}, median(r.map((x) => x.de2000)).toFixed(2))),
      h('td', {}, median(r.map((x) => x.dL)).toFixed(1)), h('td', {}, median(r.map((x) => x.da)).toFixed(1)), h('td', {}, median(r.map((x) => x.db)).toFixed(1)));
  })));

  /* And by light, because the other half of the question is whether the room or the camera is
     doing the damage. */
  const lights = [...new Set(accuracy.map((r) => r.light))];
  if (lights.length > 1) {
    box.append(table(['light', 'n', 'median dE'], lights.map((l) => {
      const r = accuracy.filter((x) => x.light === l);
      return h('tr', {}, h('td', {}, l), h('td', {}, r.length), h('td', {}, h('b', {}, median(r.map((x) => x.de2000)).toFixed(2))));
    })));
  }
}

function csv() {
  const rows = read();
  const cols: Array<keyof Trial> = ['id', 'at', 'subject', 'monkVisual', 'site', 'light', 'device',
    'de2000', 'dL', 'da', 'db', 'appIta', 'appMonk', 'confidence', 'band', 'capture', 'cct', 'samples'];
  const extra: Array<keyof Trial> = ['paperEv', 'paperSide', 'paperFrames', 'paperWhy', 'paperCct', 'paperVerdict', 'paperGains', 'paperCoverage', 'paperSpread', 'paperClip', 'paperY', 'skinY', 'miredGap', 'eyeFullCct', 'eyeFullVerdict', 'eyeFullGains', 'eyeFullPx', 'camctl', 'camctlNote', 'facing', 'res', 'lightVerdict', 'lightLevel', 'clipped', 'whiteBalanced', 'strongCast', 'gains', 'caps'];
  const cell = (v: unknown) => {
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(4);
    const s = String(v ?? '');
    return /[",\n ]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const patchHead = ['byPaperL', 'byPaperA', 'byPaperB', 'byPaperIta', 'byPaperFreeL', 'byPaperFreeA', 'byPaperFreeB', 'byPaperFreeIta', 'normL', 'normA', 'normB', 'normIta', ...PATCHES.flatMap((p) => [`${p}L`, `${p}A`, `${p}B`, `${p}Ita`])];
  const head = [...cols, 'refL', 'refA', 'refB', 'appL', 'appA', 'appB', ...extra, ...patchHead].join(',');
  const lines = rows.map((t) => [
    ...cols.map((c) => {
      const v = t[c];
      return typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(4)) : String(v ?? '');
    }),
    t.ref ? t.ref.L.toFixed(2) : '', t.ref ? t.ref.a.toFixed(2) : '', t.ref ? t.ref.b.toFixed(2) : '',
    t.app.L.toFixed(2), t.app.a.toFixed(2), t.app.b.toFixed(2),
    ...extra.map((c) => cell(t[c])),
    ...[t.byPaper, t.byPaperFree].flatMap((v) => (v ? [v.L.toFixed(2), v.a.toFixed(2), v.b.toFixed(2), v.ita.toFixed(2)] : ['', '', '', ''])),
    ...(t.norm ? [t.norm.L.toFixed(2), t.norm.a.toFixed(2), t.norm.b.toFixed(2), t.norm.ita.toFixed(2)] : ['', '', '', '']),
    ...PATCHES.flatMap((p) => {
      const v = t.patches?.[p];
      return v ? [v.L.toFixed(2), v.a.toFixed(2), v.b.toFixed(2), v.ita.toFixed(2)] : ['', '', '', ''];
    }),
  ].join(','));
  return [head, ...lines].join('\n');
}

/* ---------------------------------------------------------------------------------------
   Wiring
   --------------------------------------------------------------------------------------- */

$('start').addEventListener('click', () => { void start(); });
$('capture').addEventListener('click', () => { void record(); });
$('paper').addEventListener('click', () => { void measurePaper(); });

/* Send to Oira: every trial on this phone that has not been sent yet goes to the study
   server's bench store, behind the team passphrase. Replaces copying and pasting the CSV.
   Sent ids are remembered here so nothing goes twice. */
const SENT = 'oira.study.sent';
const TEAM = 'oira.study.team';
$('send').addEventListener('click', async () => {
  let key = '';
  try { key = localStorage.getItem(TEAM) || ''; } catch { /* asked below */ }
  if (!key) key = (prompt('Team passphrase (from the Oira team, starts with OIRA-)') || '').trim();
  if (!key) return;
  let sent: string[] = [];
  try { sent = JSON.parse(localStorage.getItem(SENT) || '[]'); } catch { sent = []; }
  const todo = read().filter((t) => !sent.includes(t.id));
  if (!todo.length) { say('everything on this phone has already been sent'); return; }
  say(`sending ${todo.length} trials...`);
  try {
    const r = await fetch('/api/study/bench', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-oira-team': key },
      body: JSON.stringify({ trials: todo }),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { try { localStorage.removeItem(TEAM); } catch { /* fine */ } say('that passphrase was not right, tap Send again and re-enter it', true); return; }
    if (!r.ok) { say(`not sent (${j.error || r.status}). Nothing was lost; try again.`, true); return; }
    try { localStorage.setItem(TEAM, key); localStorage.setItem(SENT, JSON.stringify([...sent, ...todo.map((t) => t.id)])); } catch { /* fine */ }
    say(`sent ${j.stored} trials to Oira. Thank you.`);
  } catch {
    say('no connection, nothing was lost; try again', true);
  }
});

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
