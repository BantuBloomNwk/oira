import type { SeasonPalette } from '../types';

/**
 * Does this shade actually suit her?
 *
 * The marketplace arrived with a `matchScore` hardcoded on every product, and every one of
 * them sat between 95 and 99. A palette app where everything is a 97 percent match is not a
 * palette app, it is a shop with a rosette on every item, and she will work that out in
 * about a day. Worse, it wastes the only thing this product actually knows: her season.
 *
 * So the score is computed, it is allowed to be low, and it comes with the reason. A shade
 * that fights her colouring should say so and stay on the shelf. Being told "not this one"
 * by someone whose taste you trust is the service.
 */

/* ---------------------------------------------------------------------------------------
   Colour
   --------------------------------------------------------------------------------------- */

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export interface Lab { L: number; a: number; b: number }

export function hexToLab(hex: string): Lab {
  const h = hex.replace('#', '');
  const r = toLinear(parseInt(h.slice(0, 2), 16));
  const g = toLinear(parseInt(h.slice(2, 4), 16));
  const bl = toLinear(parseInt(h.slice(4, 6), 16));
  const x = (r * 0.4124564 + g * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = r * 0.2126729 + g * 0.7151522 + bl * 0.072175;
  const z = (r * 0.0193339 + g * 0.119192 + bl * 0.9503041) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/* CIE76. Not the most refined difference formula there is, but it is honest about what it
   measures and it does not pretend to a precision the inputs cannot support: these are
   marketing hexes for lipsticks, not spectrophotometer readings. */
const deltaE = (p: Lab, q: Lab) =>
  Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);

const hueAngle = (c: Lab) => (Math.atan2(c.b, c.a) * 180) / Math.PI;
const chroma = (c: Lab) => Math.hypot(c.a, c.b);

/* ---------------------------------------------------------------------------------------
   The verdict
   --------------------------------------------------------------------------------------- */

export interface Match {
  /* 0 to 100. Genuinely spans the range: things do score in the twenties. */
  score: number;
  /* The swatch in her palette this shade is closest to, so the card can show her why. */
  nearest: string;
  nearestHex: string;
  /* One line, in her voice, on why. */
  reason: string;
  verdict: 'yours' | 'workable' | 'not-yours';
}

/* Where the two ends of a season's undertone sit in hue degrees. Warm palettes want shades
   that lean gold, cool palettes want shades that lean blue, and a shade fighting that reads
   wrong on her however pretty it is in the tube. */
const UNDERTONE_HUE: Record<string, number> = {
  Warm: 62,
  Cool: 34,
  Neutral: 48,
  Olive: 72,
};

export function matchShade(shadeHex: string, season: SeasonPalette): Match {
  const shade = hexToLab(shadeHex);

  /* Nearest thing she already owns, colour-wise. */
  let nearest = season.swatches[0];
  let best = Infinity;
  for (const sw of season.swatches) {
    const d = deltaE(shade, hexToLab(sw.hex));
    if (d < best) { best = d; nearest = sw; }
  }

  /* Does it lean the way she leans? A neutral shade is nobody's enemy, so the penalty
     scales with how saturated the shade is: a strong colour pulling the wrong way is a
     real problem, a soft one barely registers. */
  const target = UNDERTONE_HUE[season.undertone] ?? 48;
  const lean = Math.abs(hueAngle(shade) - target);
  const pull = Math.min(1, chroma(shade) / 45);
  const leanPenalty = Math.min(30, (lean / 90) * 45) * pull;

  /* Does the season say outright that this family is wrong for her? The palettes carry a
     worstColors list and it is real editorial, so it is worth more than a distance. */
  const fights = season.worstColors.some((w) =>
    ['Mustard', 'Camel', 'Rust', 'Terracotta', 'Salmon', 'Beige'].includes(w.split(' ')[0]) &&
    hueAngle(shade) > 55 && chroma(shade) > 18 && season.undertone === 'Cool'
  );

  /* Distance maps to a score. 12 in Lab is close enough that most eyes call it the same
     family; past about 55 it is a different conversation entirely. */
  const proximity = Math.max(0, 100 - Math.max(0, best - 12) * 1.5);
  let score = Math.round(Math.max(4, Math.min(100, proximity - leanPenalty - (fights ? 18 : 0))));

  let verdict: Match['verdict'] = score >= 72 ? 'yours' : score >= 48 ? 'workable' : 'not-yours';

  const reason =
    verdict === 'yours'
      ? `Sits right beside your ${nearest.name.toLowerCase()}. Wear it.`
      : verdict === 'workable'
      ? `Not quite your ${nearest.name.toLowerCase()}, but close enough to work if you love it.`
      : lean > 40
      ? `This one leans the wrong way for you. Your ${nearest.name.toLowerCase()} does the same job better.`
      : `Too far from anything in your season. Skip it, love.`;

  return { score, nearest: nearest.name, nearestHex: nearest.hex, reason, verdict };
}
