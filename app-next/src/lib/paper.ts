/**
 * Plain white paper beside her face, as a white reference in the same frame as her skin.
 *
 * Why: the sclera, which the scan uses as its white, reads warm on many darker eyes. On a
 * Galaxy A13 the founder's sclera read thousands of kelvin warmer than a sheet of office
 * paper, although that first comparison was confounded: the paper was read in a separate
 * capture, after the camera's own white balance had re-adapted to a frame full of white.
 * Reading the paper in the SAME frame as the face takes that confound out.
 *
 * STUDY ONLY for now. Nothing in the app reads this. Whether paper becomes part of the scan
 * waits on bench data against criteria fixed in advance.
 *
 * Where the paper is looked for: a zone beside the cheek on the side she chose, from just
 * outside the face outline to about 0.7 face widths out, between eye level and mouth level.
 * Inside the zone only bright, nearly colourless pixels count as paper. A wall, a top, or
 * her hand shadow are rejected by the coverage, uniformity and clipping checks below.
 */

import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { toLinear, type Lin } from './skin';

export type PaperSide = 'left' | 'right';

export interface PaperRead {
  white: Lin;
  /* Share of the zone that passed as paper, 0..1. */
  coverage: number;
  /* Pixels that passed. */
  n: number;
  /* Colour agreement across a 3x3 grid of the zone: the largest spread of the r/g and b/g
     ratios between cells, as a fraction. Small is a flat, evenly lit sheet. */
  spread: number;
  /* Share of paper pixels with a channel at 250 or above. */
  clipped: number;
  /* The zone, normalised to the frame, so the study page can draw it. */
  zone: { x: number; y: number; w: number; h: number };
  ok: boolean;
  why: string;
}

const luma = (p: Lin) => 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
const med = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The zone beside the cheek, in normalised frame coordinates. "left" is the left of the picture. */
export function paperZone(pts: NormalizedLandmark[], side: PaperSide) {
  const faceW = Math.abs(pts[454].x - pts[234].x);
  const edge = side === 'left' ? Math.min(pts[234].x, pts[454].x) : Math.max(pts[234].x, pts[454].x);
  const near = side === 'left' ? edge - 0.1 * faceW : edge + 0.1 * faceW;
  const far = side === 'left' ? edge - 0.7 * faceW : edge + 0.7 * faceW;
  const top = Math.min(pts[33].y, pts[263].y);
  const bottom = Math.max(pts[61].y, pts[291].y);
  const x0 = Math.max(0, Math.min(near, far)), x1 = Math.min(1, Math.max(near, far));
  return { x: x0, y: top, w: Math.max(0, x1 - x0), h: Math.max(0, bottom - top) };
}

/** Read the paper in the zone, at the camera's own resolution. */
export function readPaper(
  source: HTMLVideoElement,
  pts: NormalizedLandmark[],
  side: PaperSide,
  canvas: HTMLCanvasElement,
  /* Hold the zone still: pass the zone from the start of the hold and it is used as is. On a
     Galaxy A13 the landmarks wobble enough that a zone recomputed every frame jumped about
     and she had to chase it with the paper. */
  fixed?: { x: number; y: number; w: number; h: number }
): PaperRead | null {
  const W = source.videoWidth, H = source.videoHeight;
  if (!W || !H || pts.length < 468) return null;
  const zone = fixed ?? paperZone(pts, side);
  const x0 = Math.floor(zone.x * W), y0 = Math.floor(zone.y * H);
  const cw = Math.floor(zone.w * W), ch = Math.floor(zone.h * H);
  const fail = (why: string): PaperRead => ({ white: { r: 0, g: 0, b: 0 }, coverage: 0, n: 0, spread: 1, clipped: 0, zone, ok: false, why });
  if (cw < 12 || ch < 12) return fail('zone off the frame');

  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, x0, y0, cw, ch, 0, 0, cw, ch);
  const d = ctx.getImageData(0, 0, cw, ch).data;

  /* Paper: bright and nearly colourless. Brightness is judged against the zone itself, so a
     dim room still works: anything in the top half of the zone's brightness that is close to
     grey. */
  const all: { p: Lin; x: number; y: number; hot: boolean }[] = [];
  const lumas: number[] = [];
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      const p = { r: toLinear(d[i]), g: toLinear(d[i + 1]), b: toLinear(d[i + 2]) };
      const mx = Math.max(p.r, p.g, p.b), mn = Math.min(p.r, p.g, p.b);
      if (mx <= 0 || (mx - mn) / mx > 0.35) continue;
      all.push({ p, x, y, hot: d[i] >= 250 || d[i + 1] >= 250 || d[i + 2] >= 250 });
      lumas.push(luma(p));
    }
  }
  if (all.length < 800) return { ...fail('no paper found beside the face'), n: all.length, coverage: all.length / (cw * ch) };
  const cut = med(lumas) * 0.75;
  const paper = all.filter((q) => luma(q.p) >= cut);
  const coverage = paper.length / (cw * ch);
  const clipped = paper.filter((q) => q.hot).length / paper.length;

  /* Flat and evenly coloured: compare the r/g and b/g ratios of each third of the zone. A fold,
     a shadow from her hand or a second surface shows up as cells that disagree. */
  const cells: { rg: number; bg: number }[] = [];
  for (let cy = 0; cy < 3; cy++) {
    for (let cx = 0; cx < 3; cx++) {
      const inCell = paper.filter((q) => Math.floor((q.x / cw) * 3) === cx && Math.floor((q.y / ch) * 3) === cy);
      if (inCell.length < 20) continue;
      const g = med(inCell.map((q) => q.p.g)) || 1e-6;
      cells.push({ rg: med(inCell.map((q) => q.p.r)) / g, bg: med(inCell.map((q) => q.p.b)) / g });
    }
  }
  const range = (xs: number[]) => (xs.length ? (Math.max(...xs) - Math.min(...xs)) / (med(xs) || 1) : 1);
  const spread = cells.length >= 4 ? Math.max(range(cells.map((c) => c.rg)), range(cells.map((c) => c.bg))) : 1;

  /* Blown paper has lost its colour where it clipped, so read only the paper that kept it.
     On a deep skinned face the phone exposes for her skin and a white sheet beside it blows
     out: the first bench on a Galaxy A13 and an iPhone rejected every frame for that. If
     enough unclipped paper is left, use it and say so; the part that survived is the less
     lit part of the sheet, so this is weaker than clean paper, and the trial is marked. */
  const unclipped = paper.filter((q) => !q.hot);
  const partly = clipped > 0.05 && unclipped.length >= 800 && unclipped.length / (cw * ch) >= 0.2;
  const use = clipped > 0.05 ? unclipped : clipped > 0.02 ? [...paper].sort((a, b) => luma(a.p) - luma(b.p)).slice(0, Math.ceil(paper.length / 2)) : paper;
  const white = use.length
    ? { r: med(use.map((q) => q.p.r)), g: med(use.map((q) => q.p.g)), b: med(use.map((q) => q.p.b)) }
    : { r: 0, g: 0, b: 0 };

  let why = 'ok';
  if (coverage < 0.4) why = 'paper covers too little of the zone';
  else if (clipped > 0.05 && !partly) why = `paper is overexposed (${Math.round(clipped * 100)}% blown)`;
  else if (spread > 0.1) why = `paper is uneven (spread ${spread.toFixed(2)})`;
  else if (partly) why = `partly clipped (${Math.round(clipped * 100)}% blown, used the rest)`;
  return { white, coverage, n: use.length, spread, clipped, zone, ok: why === 'ok' || partly && why.startsWith('partly'), why };
}
