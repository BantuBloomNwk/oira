import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/**
 * Reading her skin.
 *
 * The first pass sampled three small patches, averaged them in gamma-encoded sRGB, and
 * split depth on lightness. It called a medium-olive face "deep", and worse, that class of
 * mistake does not fall evenly: a naive lightness reading in a dim room shifts everyone
 * darker, and the women most often mis-served by beauty tech are the ones it then pushes
 * off the end of the scale. So this is built the other way round, from the failure modes.
 *
 * Four things carry it:
 *
 * 1. A real skin mask, not patches. The 468-point mesh gives a face oval; eyes, brows,
 *    lips and nostrils are cut out of it. Thousands of pixels instead of three.
 * 2. A white reference that does not depend on her skin. The sclera is close to the same
 *    reflectance on every human face, so the brightest non-specular pixels inside the eye
 *    contours give a per-frame white point. Grey-world, the usual shortcut, assumes the
 *    average of the scene is neutral, which on a close-up of a dark-skinned face is simply
 *    false and drags the reading lighter. Grey-world is only the fallback when no usable
 *    sclera is found.
 * 3. Linear light. sRGB is gamma-encoded; averaging it directly biases every statistic.
 * 4. ITA, the individual typology angle, rather than a lightness threshold. It is the
 *    measure dermatology actually uses, it is defined across the full range including
 *    brown and dark, and its band edges are published rather than invented here.
 */

/* ---------------------------------------------------------------------------------------
   Landmark regions
   --------------------------------------------------------------------------------------- */

export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

export const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
export const RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
export const LIPS = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185,
];
export const LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
export const RIGHT_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
/* The nose base, where nostril shadow sits and where a lightness reading goes wrong first. */
export const NOSE_BASE = [98, 97, 2, 326, 327, 358, 344, 278, 439, 455, 460, 250, 290, 305];

export type Poly = Array<{ x: number; y: number }>;

export const toPoly = (idx: number[], pts: NormalizedLandmark[], w: number, h: number): Poly =>
  idx.map((i) => ({ x: pts[i].x * w, y: pts[i].y * h }));

/* Ray casting. Cheap, and the polygons here are simple and closed. */
export function inside(poly: Poly, x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export function bounds(poly: Poly) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x0, y0, x1, y1 };
}

/* ---------------------------------------------------------------------------------------
   Colour
   --------------------------------------------------------------------------------------- */

/* sRGB transfer function, undone. Everything downstream works in linear light. */
export const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export type Lin = { r: number; g: number; b: number };

/* Relative luminance, used for ranking pixels rather than for any judgement about her. */
const luma = (p: Lin) => 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function linearToLab({ r, g, b }: Lin) {
  /* Linear sRGB to XYZ, D65. */
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/* ---------------------------------------------------------------------------------------
   The reading
   --------------------------------------------------------------------------------------- */

/* Individual typology angle. Chardon's bands, unchanged, because the whole point of using
   a published scale is not quietly moving its edges. The two darkest bands are the ones a
   four-step light/medium/deep scale collapses, and they are exactly the ones that have to
   be right here. */
export type SkinBand =
  | 'very-light' | 'light' | 'intermediate' | 'tan' | 'brown' | 'dark' | 'deepest';

export const BAND_ORDER: SkinBand[] = [
  'very-light', 'light', 'intermediate', 'tan', 'brown', 'dark', 'deepest',
];

/* Chardon's bands, with one addition at the bottom.
 *
 * His scale stops at "dark" because dermatology had no reason to go further: below about
 * -30 everything is the same answer to a clinical question. It is not the same answer to
 * a beauty question. Measured against real portraits, -55 and -78 are visibly different
 * women, and collapsing them repeats at the bottom of the scale exactly the mistake that
 * a four-step light/medium/deep scale makes in the middle of it. Splitting it is the
 * whole reason for building this rather than using an off-the-shelf four-way. */
function bandFromITA(ita: number): SkinBand {
  if (ita > 55) return 'very-light';
  if (ita > 41) return 'light';
  if (ita > 28) return 'intermediate';
  if (ita > 10) return 'tan';
  if (ita > -30) return 'brown';
  if (ita > -55) return 'dark';
  return 'deepest';
}

/* Oira's melanin ribbon, in the same order as the bands, so what she is told and what the
   app draws come from one number rather than two. */
export const RIBBON: Record<SkinBand, string> = {
  'very-light': '#F1DCCB',
  light: '#DDB699',
  intermediate: '#BC8563',
  tan: '#96603F',
  brown: '#6E4128',
  dark: '#4A2B1C',
  /* Past the end of the published ribbon, so it is extended rather than reused: giving
     the two deepest bands the same swatch would undo the split. */
  deepest: '#341D13',
};

export type Undertone = 'warm' | 'cool' | 'neutral' | 'olive';

/* Undertone from where the skin sits in the a-b chroma plane, not from a red-minus-blue guess.
   The hue angle is stable across depth, which is the property that matters: a warm deep
   skin and a warm fair skin should both come back warm. */
function undertoneFrom(a: number, b: number): Undertone {
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  const chroma = Math.hypot(a, b);
  /* Almost no colour left to read. Say balanced rather than invent a lean. */
  if (chroma < 9) return 'neutral';
  /* Olive is a green cast, so it needs a genuinely low red axis and not merely a high
     hue angle: a low a* alone tips the angle toward ninety whatever the skin is doing,
     which is how the first pass called a cool fair face olive. */
  if (hue > 68 && a < 8) return 'olive';
  if (hue > 56) return 'warm';
  if (hue > 46) return 'neutral';
  return 'cool';
}

export interface SkinReading {
  band: SkinBand;
  ita: number;
  undertone: Undertone;
  /* Lab of her skin after correction, kept so a later calibration pass has something to
     check itself against. */
  lab: { L: number; a: number; b: number };
  ribbonHex: string;
  /* Her skin in linear light BEFORE the sclera correction, so the study can correct it against
     a different white (paper beside her face) and compare. Never sealed. */
  raw: Lin;
  /* How many skin pixels the reading rests on. Under a few hundred and it is a guess. */
  samples: number;
  /* True when the sclera gave us a white point. False means the frame was left
     uncorrected, which is weaker, and the UI should be slower to commit to a season. */
  whiteBalanced: boolean;
  /* The room's light was tinted harder than the correction is allowed to go, so the
     undertone is the less trustworthy half of this reading. */
  strongCast: boolean;
  /* The sclera reference in linear light, or null when none was found. Handed out so the
     light can be judged from the same measurement rather than a second guess at it. */
  white: { r: number; g: number; b: number } | null;
  /* Share of skin pixels with no detail left at the top of the range. Direct sun and a
     lamp pointed at her both show up here. */
  clipped: number;  /* Small fixed patches on both cheeks, the forehead and the chin, corrected for the light
     the same way as the whole-face reading. Logged by the study page next to the
     whole-face number; the app does not use them yet. The whole face takes in the darker
     skin round the eyes and mouth, at the hairline and down the sides, which a
     spectrophotometer never reads. Whether the patches are closer is for the data to say. */
  patches: Partial<Record<PatchName, PatchReading | null>>;
  /* Where each patch sat, normalised 0..1 with its radius as a share of the frame width, so
     the study page can draw them on her face and anyone can see what was read. */
  patchAt: Partial<Record<PatchName, { x: number; y: number; r: number }>>;
  /* The whole-face reading again, with its brightness rescaled so the sclera sits at a fixed
     level. The camera's exposure moves every reading; this takes that out in software. On an
     A13 a dark background read her about 7 L* darker than a white wall did, and almost all of
     it was exposure: rescaled, the gap fell to about 2. Logged beside the plain reading until
     the data says which to trust. Null without a sclera. */
  exposureNorm: { lab: { L: number; a: number; b: number }; ita: number } | null;
}

/* The sclera level exposureNorm rescales to, in linear light. The same level camera control
   aims the camera at. */
export const SCLERA_TARGET = 0.55;

export type PatchName = 'cheekL' | 'cheekR' | 'forehead' | 'chin';
export interface PatchReading { lab: { L: number; a: number; b: number }; ita: number; n: number }

/* Centre landmarks on the MediaPipe face mesh. cheekL and cheekR are left and right as the
   picture shows them, not as she would say it. */
/* The cheeks sit on the cheekbones, below the outer corner of each eye. They were first put
   at nose height (205, 425), which on a bearded face is beard: an A13 bench read hair there.
   The cheekbone is also where a skin colour instrument usually goes. They stay on the outer
   cheekbone rather than nearer the nose: skin round the nose is often lighter than the cheeks
   and forehead, so a patch there would read her lighter than she is. The chin is kept but is
   only skin on a clean shaven face, so it is never the one to trust. */
const PATCH_CENTRES: Record<PatchName, number> = { cheekL: 117, cheekR: 346, forehead: 151, chin: 199 };


/* The sclera as a white point, from the pixels inside the eye contours. Shared by the
   scan's reading (on its 256 pixel wide frame) and scleraFullRes below, so the two can only
   differ in what they were given, never in how they choose. */
export function whiteFrom(eyePixels: Lin[]): Lin | null {
  if (eyePixels.length < 40) return null;
  /* The sclera is the brightest thing inside the eye contour. Take the top slice, but
     not the very top, which is a catchlight rather than a surface. */
  const sorted = [...eyePixels].sort((p, q) => luma(q) - luma(p));
  const from = Math.floor(sorted.length * 0.05);
  const to = Math.floor(sorted.length * 0.25);
  const slice = sorted.slice(from, Math.max(from + 1, to));
  const c: Lin = {
    r: median(slice.map((p) => p.r)),
    g: median(slice.map((p) => p.g)),
    b: median(slice.map((p) => p.b)),
  };
  /* A sclera that came back nearly black means the eyes are shut or in deep shadow. */
  return luma(c) > 0.05 ? c : null;
}

/**
 * The same white point, read from the eyes at the camera's own resolution.
 *
 * The scan reads every frame shrunk to 256 pixels wide, where an eye is about a dozen pixels
 * across and the brightest slice inside its contour takes in eyelid and skin. On a deep
 * skinned face that pulls the white warm: on a Galaxy A13 it read about 3000K warmer than a
 * sheet of white paper in the same light. Study only for now: logged beside the low
 * resolution white so the data can say how much of that warmth this removes.
 */
export function scleraFullRes(
  source: HTMLVideoElement,
  pts: NormalizedLandmark[],
  canvas: HTMLCanvasElement
): { white: Lin; pixels: number } | null {
  const W = source.videoWidth, H = source.videoHeight;
  if (!W || !H || pts.length < 468) return null;
  const all: Lin[] = [];
  for (const idx of [LEFT_EYE, RIGHT_EYE]) {
    const poly = toPoly(idx, pts, W, H);
    const b = bounds(poly);
    const x0 = Math.max(0, Math.floor(b.x0)), y0 = Math.max(0, Math.floor(b.y0));
    const cw = Math.min(W, Math.ceil(b.x1)) - x0, ch = Math.min(H, Math.ceil(b.y1)) - y0;
    if (cw < 4 || ch < 2) continue;
    canvas.width = cw; canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, x0, y0, cw, ch, 0, 0, cw, ch);
    const d = ctx.getImageData(0, 0, cw, ch).data;
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        if (!inside(poly, x0 + x + 0.5, y0 + y + 0.5)) continue;
        const i = (y * cw + x) * 4;
        all.push({ r: toLinear(d[i]), g: toLinear(d[i + 1]), b: toLinear(d[i + 2]) });
      }
    }
  }
  const white = whiteFrom(all);
  return white ? { white, pixels: all.length } : null;
}

export function readSkin(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  pts: NormalizedLandmark[]
): SkinReading | null {
  if (pts.length < 468) return null;

  const oval = toPoly(FACE_OVAL, pts, w, h);
  const cutouts = [LEFT_EYE, RIGHT_EYE, LIPS, LEFT_BROW, RIGHT_BROW, NOSE_BASE].map((idx) =>
    toPoly(idx, pts, w, h)
  );

  const at = (x: number, y: number): Lin => {
    const i = (y * w + x) * 4;
    return { r: toLinear(data[i]), g: toLinear(data[i + 1]), b: toLinear(data[i + 2]) };
  };

  /* --- the white point ------------------------------------------------------------- */
  const eyePolys = [toPoly(LEFT_EYE, pts, w, h), toPoly(RIGHT_EYE, pts, w, h)];
  const eyePixels: Lin[] = [];
  for (const poly of eyePolys) {
    const { x0, y0, x1, y1 } = bounds(poly);
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(w - 1, Math.ceil(x1)); x++) {
        if (inside(poly, x + 0.5, y + 0.5)) eyePixels.push(at(x, y));
      }
    }
  }

  const white = whiteFrom(eyePixels);

  /* --- the skin ---------------------------------------------------------------------- */
  const { x0, y0, x1, y1 } = bounds(oval);
  const skin: Lin[] = [];
  /* Step the scan on larger faces: a few thousand samples is plenty and the median does
     not get better for making the phone work harder. */
  const step = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 90));
  for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(h - 1, Math.ceil(y1)); y += step) {
    for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(w - 1, Math.ceil(x1)); x += step) {
      const px = x + 0.5, py = y + 0.5;
      if (!inside(oval, px, py)) continue;
      if (cutouts.some((c) => inside(c, px, py))) continue;
      skin.push(at(x, y));
    }
  }
  if (skin.length < 120) return null;

  /* Speculars read as lighter skin and sit disproportionately on the parts of a face that
     catch light, so they come off the top. A little comes off the bottom too, for the
     shadow under the jaw and any hair that strayed inside the oval. */
  /* Anything sitting at the very top of the range has had its detail thrown away by the
     sensor, and no amount of care downstream gets it back. */
  const clipped = skin.filter((p) => luma(p) > 0.97).length / skin.length;

  const byLuma = [...skin].sort((p, q) => luma(p) - luma(q));
  const lo = Math.floor(byLuma.length * 0.08);
  const hi = Math.floor(byLuma.length * 0.85);
  const core = byLuma.slice(lo, Math.max(lo + 1, hi));

  let px: Lin = {
    r: median(core.map((p) => p.r)),
    g: median(core.map((p) => p.g)),
    b: median(core.map((p) => p.b)),
  };

  const raw: Lin = { ...px };
  let whiteBalanced = false;
  let strongCast = false;
  if (white) {
    /* Scale each channel by the reference. This corrects the light she is standing in,
       which is the thing we want gone, and leaves her skin, which is the thing we want.
       The gains are clamped, because light bouncing off her own cheek tints the sclera
       slightly toward her skin, and an unclamped correction then subtracts the very thing
       it is trying to measure: it read a fair cool face at a* 1.6, which is not a colour
       skin comes in. A quarter stop either way is all a room's light should need. */
    const wl = luma(white) || 1;
    const raw = (c: number) => wl / (c || wl);
    const gain = (c: number) => Math.min(1.25, Math.max(0.8, raw(c)));
    px = { r: px.r * gain(white.r), g: px.g * gain(white.g), b: px.b * gain(white.b) };
    whiteBalanced = true;
    /* When the light is tinted harder than the clamp will correct, some of that colour is
       still sitting in the reading. Depth survives it, because ITA leans on lightness.
       Undertone does not, and it matters most at the deep end where the numbers are
       smaller and a residual cast moves the hue angle further. Say so rather than
       reporting a cool undertone that belongs to the room. */
    strongCast = [white.r, white.g, white.b].some((c) => {
      const g = raw(c);
      return g < 0.8 || g > 1.25;
    });
  }
  /* No sclera means no correction at all. Grey-world was the obvious fallback and it is
     the wrong one: on a portrait the subject dominates the frame, so the "average scene
     is neutral" assumption is simply false, and the gains it produces are large. It read
     a light-medium woman at a* 24 b* 38 and called her deep brown. An uncorrected reading
     in ordinary light beats a confidently wrong one, so the caller is told the reading is
     the weaker kind and the app hedges instead of committing to a season. */

  const lab = linearToLab(px);
  const ita = (Math.atan2(lab.L - 50, lab.b) * 180) / Math.PI;
  const band = bandFromITA(ita);

  /* --- the patches ------------------------------------------------------------------- */
  /* Same trim and the same light correction as the whole face, over a small disc. The disc
     scales with the face so a near and a far face sample the same patch of skin. */
  const faceW = Math.hypot((pts[454].x - pts[234].x) * w, (pts[454].y - pts[234].y) * h);
  const radius = Math.max(3, faceW * 0.06);
  const correct = (c: Lin): Lin => {
    if (!white) return c;
    const wl = luma(white) || 1;
    const gain = (v: number) => Math.min(1.25, Math.max(0.8, wl / (v || wl)));
    return { r: c.r * gain(white.r), g: c.g * gain(white.g), b: c.b * gain(white.b) };
  };
  const patch = (centre: number): PatchReading | null => {
    const cx = pts[centre].x * w, cy = pts[centre].y * h;
    const px2: Lin[] = [];
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(h - 1, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(w - 1, Math.ceil(cx + radius)); x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius * radius) px2.push(at(x, y));
      }
    }
    if (px2.length < 20) return null;
    const sorted = px2.sort((p, q) => luma(p) - luma(q));
    const keep = sorted.slice(Math.floor(sorted.length * 0.08), Math.max(1, Math.floor(sorted.length * 0.85)));
    const m = correct({ r: median(keep.map((p) => p.r)), g: median(keep.map((p) => p.g)), b: median(keep.map((p) => p.b)) });
    const pl = linearToLab(m);
    return { lab: pl, ita: (Math.atan2(pl.L - 50, pl.b) * 180) / Math.PI, n: px2.length };
  };
  const patches: Partial<Record<PatchName, PatchReading | null>> = {};
  const patchAt: Partial<Record<PatchName, { x: number; y: number; r: number }>> = {};
  for (const [name, idx] of Object.entries(PATCH_CENTRES) as [PatchName, number][]) {
    patches[name] = patch(idx);
    patchAt[name] = { x: pts[idx].x, y: pts[idx].y, r: radius / w };
  }

  /* Exposure taken out: scale the corrected skin so the sclera would sit at SCLERA_TARGET. */
  let exposureNorm: SkinReading['exposureNorm'] = null;
  if (white) {
    const k = SCLERA_TARGET / (luma(white) || SCLERA_TARGET);
    const nl = linearToLab({ r: px.r * k, g: px.g * k, b: px.b * k });
    exposureNorm = { lab: nl, ita: (Math.atan2(nl.L - 50, nl.b) * 180) / Math.PI };
  }

  return {
    band,
    ita,
    undertone: undertoneFrom(lab.a, lab.b),
    lab,
    ribbonHex: RIBBON[band],
    raw,
    samples: skin.length,
    whiteBalanced,
    strongCast,
    white,
    clipped,
    patches,
    patchAt,
    exposureNorm,
  };
}
