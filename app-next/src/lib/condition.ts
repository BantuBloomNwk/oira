import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { FACE_OVAL, LEFT_BROW, LEFT_EYE, LIPS, NOSE_BASE, RIGHT_BROW, RIGHT_EYE, bounds, inside, toPoly } from './skin';

/**
 * How her skin and her lips are DOING, as opposed to what colour they are.
 *
 * The colour reading (src/lib/skin.ts) deliberately throws away exactly the information
 * this needs. It averages, medians and white balances, because a shade is a property of
 * the whole cheek. Condition is the opposite: it lives in the pixel-to-pixel differences
 * that averaging is designed to destroy, so it gets its own pass at its own resolution.
 *
 * The heuristics are ported from analyzeSkinCondition() in app/index.html, which is the
 * shipping app's on-device condition scanner, along with the honesty that came with them.
 * That file says it plainly and it is worth repeating rather than rediscovering: unlike
 * the Monk mapping, these thresholds have no public ground truth behind them. There is no
 * reference standard for how rough dry skin is. They are a reasoned starting point, they
 * are allowed to answer "not enough light to judge" instead of guessing, and every word
 * they produce downstream stays soft and optional. Nothing here is a diagnosis and nothing
 * here goes near a medical claim.
 *
 * One improvement on the original: the shipping app samples a fixed ellipse, because
 * BlazeFace only gave it six keypoints. This has the 468 point mesh, so it reads the real
 * face oval with the eyes, brows, lips and nostril shadow cut out of it. A fixed ellipse
 * puts the hairline and the mouth inside the "skin" region on plenty of faces, and both of
 * those are far rougher than skin, which is how a texture reading quietly punishes women
 * with a low hairline or a full mouth.
 */

export type Dryness = 'hydrated' | 'normal' | 'dry';
export type Shine = 'matte' | 'balanced' | 'shiny';
export type LipState = 'smooth' | 'a little dry' | 'dry';

export interface ConditionReading {
  /* False when the frame is too dark or too blown out to say anything honest. */
  lightOk: boolean;
  dryness: Dryness;
  shine: Shine;
  /* Deliberately conservative. A miss costs nothing; telling a woman she has a blemish
     when she has a freckle costs trust that does not come back. */
  blemish: boolean;
  lips: LipState;
  /* The raw numbers, kept so the calibration harness has something to check against. */
  roughness: number;
  shineDelta: number;
  lipRoughness: number;
}

const luma = (r: number, g: number, b: number) => (r + g + b) / 3;

/* Grey world, on the BACKGROUND only. The face is deliberately excluded: averaging her
   skin toward neutral is the mistake src/lib/skin.ts exists to avoid, and here we only
   need enough correction that a warm bulb does not read as shine. */
function greyWorld(data: Uint8ClampedArray, w: number, h: number, oval: ReturnType<typeof toPoly>) {
  let ar = 0, ag = 0, ab = 0, n = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      if (inside(oval, x + 0.5, y + 0.5)) continue;
      const i = (y * w + x) * 4;
      ar += data[i]; ag += data[i + 1]; ab += data[i + 2]; n++;
    }
  }
  if (n < 40) return { kr: 1, kg: 1, kb: 1 };
  ar /= n; ag /= n; ab /= n;
  const grey = (ar + ag + ab) / 3;
  return { kr: grey / (ar || 1), kg: grey / (ag || 1), kb: grey / (ab || 1) };
}

export function readCondition(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  pts: NormalizedLandmark[]
): ConditionReading | null {
  if (pts.length < 468) return null;

  const oval = toPoly(FACE_OVAL, pts, w, h);
  const cutouts = [LEFT_EYE, RIGHT_EYE, LIPS, LEFT_BROW, RIGHT_BROW, NOSE_BASE].map((idx) =>
    toPoly(idx, pts, w, h)
  );
  const lipPoly = toPoly(LIPS, pts, w, h);

  const { kr, kg, kb } = greyWorld(data, w, h, oval);
  const bal = (x: number, y: number): [number, number, number] => {
    const i = (y * w + x) * 4;
    return [
      Math.min(255, data[i] * kr),
      Math.min(255, data[i + 1] * kg),
      Math.min(255, data[i + 2] * kb),
    ];
  };

  const { x0, y0, x1, y1 } = bounds(oval);
  const X0 = Math.max(1, Math.floor(x0)), X1 = Math.min(w - 1, Math.ceil(x1));
  const Y0 = Math.max(1, Math.floor(y0)), Y1 = Math.min(h - 1, Math.ceil(y1));

  /* The mask, once.
   *
   * Deciding whether a pixel is skin means one ray cast against the face oval and six more
   * against the cutouts, each walking a thirty-odd point polygon. The first draft asked
   * that question inside all four of the passes below, and the texture pass asked it three
   * times per pixel for the neighbours. Over a face-sized box that is tens of millions of
   * polygon edge tests for a single frame, which is not a slow scan on a cheap Android, it
   * is a locked one.
   *
   * Answering it once into a byte per pixel makes every pass below an array lookup. */
  const bw = X1 - X0, bh = Y1 - Y0;
  const skinMask = new Uint8Array(Math.max(0, bw * bh));
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      if (!inside(oval, x + 0.5, y + 0.5)) continue;
      if (cutouts.some((c) => inside(c, x + 0.5, y + 0.5))) continue;
      skinMask[(y - Y0) * bw + (x - X0)] = 1;
    }
  }
  const isSkin = (x: number, y: number) =>
    x >= X0 && x < X1 && y >= Y0 && y < Y1 && skinMask[(y - Y0) * bw + (x - X0)] === 1;

  let sumL = 0, nSkin = 0;
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      if (!isSkin(x, y)) continue;
      const [r, g, b] = bal(x, y);
      sumL += luma(r, g, b);
      nSkin++;
    }
  }
  if (nSkin < 200) return null;
  const meanL = sumL / nSkin;

  const dark = meanL < 26;
  const blown = meanL > 232;
  if (dark || blown) {
    return {
      lightOk: false, dryness: 'normal', shine: 'balanced', blemish: false,
      lips: 'smooth', roughness: 0, shineDelta: 0, lipRoughness: 0,
    };
  }

  /* Texture. Neighbour-to-neighbour luminance differences across the lower cheeks, where
     it is skin rather than anatomy doing the varying, normalised by overall exposure so a
     bright room does not read as rough skin. */
  const cheekTop = y0 + (y1 - y0) * 0.52, cheekBot = y0 + (y1 - y0) * 0.86;
  let rough = 0, roughN = 0;
  for (let y = Math.floor(cheekTop); y < cheekBot; y++) {
    for (let x = X0; x < X1; x++) {
      if (!isSkin(x, y) || !isSkin(x - 1, y) || !isSkin(x, y - 1)) continue;
      const [r0, g0, b0] = bal(x, y);
      const [r1, g1, b1] = bal(x - 1, y);
      const [r2, g2, b2] = bal(x, y - 1);
      const l0 = luma(r0, g0, b0);
      rough += Math.abs(l0 - luma(r1, g1, b1)) + Math.abs(l0 - luma(r2, g2, b2));
      roughN++;
    }
  }
  const roughness = roughN ? rough / roughN / meanL : 0;

  /* Shine, as a differential. Specular pixel density across the forehead and nose against
     the rest of the face, so a bright frame does not read as an oily one. */
  const tzTop = y0 + (y1 - y0) * 0.05, tzBot = y0 + (y1 - y0) * 0.48;
  const tzL = x0 + (x1 - x0) * 0.32, tzR = x0 + (x1 - x0) * 0.68;
  const isSpec = (r: number, g: number, b: number) =>
    r > 238 && g > 236 && b > 228 && Math.max(r, g, b) - Math.min(r, g, b) < 18;
  let tzSpec = 0, tzN = 0, restSpec = 0, restN = 0;
  for (let y = Y0; y < Y1; y++) {
    for (let x = X0; x < X1; x++) {
      if (!isSkin(x, y)) continue;
      const [r, g, b] = bal(x, y);
      const inTz = x >= tzL && x <= tzR && y >= tzTop && y <= tzBot;
      if (inTz) { tzN++; if (isSpec(r, g, b)) tzSpec++; }
      else { restN++; if (isSpec(r, g, b)) restSpec++; }
    }
  }
  const shineDelta = (tzN ? tzSpec / tzN : 0) - (restN ? restSpec / restN : 0);

  /* Blemish. A coarse grid, and a patch is only flagged when it is a genuine outlier
     against the median absolute deviation of the rest, never against a raw threshold.
     Redness thresholds are exactly the kind of thing that historically under-serves deep
     skin on cheap sensors, which is the failure this product criticises in other people. */
  const GX = 6, GY = 7, cellA: number[] = [];
  for (let gy = 0; gy < GY; gy++) {
    for (let gx = 0; gx < GX; gx++) {
      if (gy >= GY * 0.6 && gx > GX * 0.3 && gx < GX * 0.7) continue;
      const cx0 = Math.floor(x0 + ((x1 - x0) * gx) / GX), cx1 = Math.floor(x0 + ((x1 - x0) * (gx + 1)) / GX);
      const cy0 = Math.floor(y0 + ((y1 - y0) * gy) / GY), cy1 = Math.floor(y0 + ((y1 - y0) * (gy + 1)) / GY);
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let y = Math.max(Y0, cy0); y < Math.min(Y1, cy1); y++) {
        for (let x = Math.max(X0, cx0); x < Math.min(X1, cx1); x++) {
          if (!isSkin(x, y)) continue;
          const [r, g, b] = bal(x, y);
          sr += r; sg += g; sb += b; n++;
        }
      }
      if (n < 12) continue;
      /* a* of the patch, the red-green axis, as a plain opponent difference. The full Lab
         transform is not worth it here: we only ever compare these to each other. */
      cellA.push((sr - sg) / n);
    }
  }
  let blemish = false;
  if (cellA.length >= 10) {
    const sorted = [...cellA].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const dev = cellA.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
    const mad = dev[Math.floor(dev.length / 2)] || 1;
    if ((Math.max(...cellA) - med) / Math.max(mad, 1.5) > 3.2) blemish = true;
  }

  /* Lips, the same texture measure inside the vermilion. Chapping is the one thing a
     camera can honestly see about a lip, and it is the thing worth telling her before she
     puts a matte on it. */
  const lb = bounds(lipPoly);
  let lipRough = 0, lipN = 0, lipL = 0, lipLN = 0;
  for (let y = Math.max(1, Math.floor(lb.y0)); y < Math.min(h - 1, lb.y1); y++) {
    for (let x = Math.max(1, Math.floor(lb.x0)); x < Math.min(w - 1, lb.x1); x++) {
      if (!inside(lipPoly, x + 0.5, y + 0.5)) continue;
      const [r, g, b] = bal(x, y);
      lipL += luma(r, g, b); lipLN++;
      if (!inside(lipPoly, x - 0.5, y + 0.5)) continue;
      const [r1, g1, b1] = bal(x - 1, y);
      lipRough += Math.abs(luma(r, g, b) - luma(r1, g1, b1));
      lipN++;
    }
  }
  const lipMean = lipLN ? lipL / lipLN : 1;
  const lipRoughness = lipN && lipMean ? lipRough / lipN / lipMean : 0;

  return {
    lightOk: true,
    dryness: roughness > 0.055 ? 'dry' : roughness > 0.032 ? 'normal' : 'hydrated',
    shine: shineDelta > 0.05 ? 'shiny' : shineDelta > 0.015 ? 'balanced' : 'matte',
    blemish,
    lips: lipRoughness > 0.075 ? 'dry' : lipRoughness > 0.048 ? 'a little dry' : 'smooth',
    roughness,
    shineDelta,
    lipRoughness,
  };
}
