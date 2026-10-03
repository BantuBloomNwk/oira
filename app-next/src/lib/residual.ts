/**
 * What this phone does to a colour we already know.
 *
 * The scan reads her skin through a camera nobody calibrated, in a room nobody chose, and
 * the numbers that come out carry both. `light.ts` removes as much of the room as a sclera
 * white point can. Nothing removes the camera. Two handsets pointed at the same face under
 * the same lamp do not agree, and the honest error on that disagreement has never been
 * measured here.
 *
 * This is how it gets measured, without a lab and without asking her to do anything for us.
 * When she photographs a product whose colour the catalogue already states, that photograph
 * contains a known answer. What her camera made of it, minus what it actually is, is a
 * residual: one datapoint about this camera in this light. Enough of them and the error
 * stops being an estimate.
 *
 * TWO RULES, AND THEY ARE THE WHOLE FILE.
 *
 * 1. IT NEVER LEAVES THE DEVICE. There is no fetch in this module and there must never be
 *    one. A residual is not about her, but the store is on her phone and it stays there.
 *    `clear()` exists and the UI that writes must offer it.
 *
 * 2. IT MEASURES, IT DOES NOT CHANGE ANYTHING. Nothing here alters a reading. Its only job
 *    is to put an honest number on how far off this camera is, so the confidence we show
 *    her is measured rather than guessed. Anything that ever acts on that number belongs in
 *    a different file.
 *
 * WHAT IS NEVER STORED: the photograph. Only the numbers derived from a patch of it. No
 * face ever enters this path at all, by construction: the input is a picture of a bottle.
 */

import { hexToLab, type Lab } from './match';
import type { CapturePath } from './confidence';

const STORE = 'oira_residuals';
const DEVICE = 'oira_device_key';

/* Residuals are tiny and only useful in bulk, but a store that grows without a bound on a
   phone is a bug waiting for the woman with the most to contribute. Oldest out first. */
const CAP = 400;

/* Which install this is.
 *
 * Deliberately random and generated once, not derived from anything about the handset. A
 * real device fingerprint would be more useful to us, since it would group residuals across
 * reinstalls and tell us the model outright, and it is exactly the thing this product exists
 * to refuse. Browsers are closing that door anyway. A random key groups the readings that
 * need grouping, which is all the maths needs, and identifies nobody. */
export function deviceKey(): string {
  try {
    const found = localStorage.getItem(DEVICE);
    if (found) return found;
    const made = (crypto.randomUUID?.() ?? String(Math.random()).slice(2)).slice(0, 12);
    localStorage.setItem(DEVICE, made);
    return made;
  } catch {
    /* Private mode, or storage refused. The measurement still works for this session, it
       just cannot be grouped later, which is better than throwing inside a scan. */
    return 'ephemeral';
  }
}

export interface Residual {
  /* The catalogue entry this was measured against, so a later pass can re-check it if the
     catalogue value itself turns out to be wrong. Marketing hexes are not measurements and
     some of them will be. */
  sku: string;
  catalog: Lab;
  measured: Lab;
  /* Signed, per axis. The sign is the whole point: a camera that runs warm and one that runs
     cool both show up as a large delta-E and they need opposite corrections. */
  delta: { dL: number; da: number; db: number };
  deltaE: number;
  /* The illuminant at the time, when it is known. A residual without one still says
     something about the camera, but it cannot be separated from the room, so the analysis
     has to be able to tell the two kinds apart. Null is common and is not a failure. */
  cct: number | null;
  capture: CapturePath;
  device: string;
  /* How good the patch measurement itself was. See measurePatch. */
  quality: number;
  at: number;
}

export interface PatchReading {
  lab: Lab;
  quality: number;
  /* Why the quality is not 1, worst first. Internal words, never shown to her. */
  reasons: string[];
}

/* sRGB byte to linear. The same curve match.ts uses on the catalogue side, because a
   residual between a linear measurement and a non-linear reference is not a residual. */
const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function linearToLab(r: number, g: number, b: number): Lab {
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((p, q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Read a flat patch of colour out of a photograph.
 *
 * Deliberately conservative, for the same reason the seal gate is: a residual measured off a
 * highlight or off the edge of a cap is not a weak datapoint, it is a wrong one, and wrong
 * datapoints do not average out. Better to refuse most photographs than to poison the store.
 *
 * The region is the caller's business. Passing the whole frame and hoping is the thing this
 * is built to survive rather than the way to use it: the intended caller hands in a small
 * box around a swatch she has pointed at.
 *
 * Three things get a photograph thrown out. Specular highlights, because a white blob is the
 * lamp and not the lipstick. Shadow, because there is no colour left down there to read.
 * And spread, because a patch that is not uniform is not a patch: it is a curved bottle, a
 * printed label, or the edge of something, and the median of it means nothing.
 */
export function measurePatch(data: Uint8ClampedArray): PatchReading | null {
  const reasons: string[] = [];
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  let clipped = 0, dark = 0, total = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    total++;
    /* Near white with almost no colour in it is the light source reflecting, not the
       product. It is excluded rather than averaged, and counted so the caller can be told
       the photograph was mostly glare. */
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max > 244 && max - min < 14) { clipped++; continue; }
    if (max < 26) { dark++; continue; }
    rs.push(toLinear(r)); gs.push(toLinear(g)); bs.push(toLinear(b));
  }

  if (rs.length < 200 || rs.length < total * 0.3) return null;

  const lab = linearToLab(median(rs), median(gs), median(bs));

  /* Uniformity, measured on the linear channels as a median absolute deviation rather than a
     standard deviation, so one bright speck does not decide the answer. */
  const mad = (xs: number[]) => {
    const m = median(xs);
    return median(xs.map((x) => Math.abs(x - m)));
  };
  const spread = (mad(rs) + mad(gs) + mad(bs)) / 3;

  let quality = 1;
  if (spread > 0.02) {
    quality -= Math.min(0.6, (spread - 0.02) * 12);
    reasons.push('not-uniform');
  }
  const glare = clipped / Math.max(1, total);
  if (glare > 0.05) {
    quality -= Math.min(0.35, (glare - 0.05) * 3);
    reasons.push('glare');
  }
  const shadow = dark / Math.max(1, total);
  if (shadow > 0.15) {
    quality -= Math.min(0.3, (shadow - 0.15) * 2);
    reasons.push('shadow');
  }
  if (rs.length < 800) {
    quality -= 0.15;
    reasons.push('small-patch');
  }

  return { lab, quality: Math.max(0, Math.min(1, quality)), reasons };
}

/* Under this a residual is noise wearing a number, and it is not written. */
const QUALITY_FLOOR = 0.5;

export interface RecordInput {
  sku: string;
  /* The catalogue colour, as the catalogue states it. */
  catalogHex: string;
  patch: PatchReading;
  cct?: number | null;
  capture?: CapturePath;
}

/**
 * Write one residual, or decline to.
 *
 * Returns null when the patch was not good enough, which is the common case and not an
 * error. The caller should say nothing to her about it: she photographed a lipstick, she did
 * not volunteer for a calibration run, and a message about patch quality would be the app
 * talking about itself.
 */
export function record({ sku, catalogHex, patch, cct = null, capture = 'browser' }: RecordInput): Residual | null {
  if (patch.quality < QUALITY_FLOOR) return null;

  const catalog = hexToLab(catalogHex);
  const delta = {
    dL: patch.lab.L - catalog.L,
    da: patch.lab.a - catalog.a,
    db: patch.lab.b - catalog.b,
  };

  const residual: Residual = {
    sku,
    catalog,
    measured: patch.lab,
    delta,
    deltaE: Math.hypot(delta.dL, delta.da, delta.db),
    cct,
    capture,
    device: deviceKey(),
    quality: patch.quality,
    at: Date.now(),
  };

  try {
    const all = read();
    all.push(residual);
    localStorage.setItem(STORE, JSON.stringify(all.slice(-CAP)));
  } catch {
    /* Storage full or refused. The measurement is lost and nothing else is affected. There
       is deliberately no retry and no fallback store: this is instrumentation, and
       instrumentation that fights for space on her phone has its priorities wrong. */
  }
  return residual;
}

function read(): Residual[] {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Residual[]) : [];
  } catch {
    return [];
  }
}

export const all = (): Residual[] => read();

export const count = (): number => read().length;

/* Hers to delete, like everything else here. Also the reset when the analysis has taken what
   it needs and the next run should start clean. */
export function clear(): void {
  try { localStorage.removeItem(STORE); } catch { /* nothing stored is the outcome asked for */ }
}

export interface Summary {
  n: number;
  /* Median signed error per axis. The number the whole exercise is for: a camera that reads
     consistently warm shows up here as a positive db that no amount of averaging removes,
     and that is the number worth knowing first. */
  bias: { dL: number; da: number; db: number };
  /* Median delta-E. How wrong this device is, before any correction. */
  deltaE: number;
  /* Spread of delta-E, as a median absolute deviation. A tight spread around a large bias is
     a calibration problem and fixable. A wide spread is the room, and it is not. */
  spread: number;
  devices: number;
  withIlluminant: number;
}

/**
 * What the store says so far. Internal only.
 *
 * This is the number that replaces the invented thresholds in confidence.ts once there is
 * enough of it, and it is the first honest measurement of cross-device error this project
 * has ever had. It is not shown to her and it is not sent anywhere.
 */
export function summary(rows: Residual[] = read()): Summary | null {
  if (!rows.length) return null;
  const es = rows.map((r) => r.deltaE);
  const mid = median(es);
  return {
    n: rows.length,
    bias: {
      dL: median(rows.map((r) => r.delta.dL)),
      da: median(rows.map((r) => r.delta.da)),
      db: median(rows.map((r) => r.delta.db)),
    },
    deltaE: mid,
    spread: median(es.map((e) => Math.abs(e - mid))),
    devices: new Set(rows.map((r) => r.device)).size,
    withIlluminant: rows.filter((r) => r.cct !== null).length,
  };
}
