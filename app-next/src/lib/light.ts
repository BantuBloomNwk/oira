/**
 * Is she standing in light I can trust?
 *
 * Every number the scan produces is a number about the light as much as about her. Under a
 * tungsten bulb a cool skin reads warm; under a supermarket fluorescent everyone goes
 * slightly green; in a dim room the sensor lifts the gain and the noise floor comes up with
 * it. So the scan holds rather than finishing on a reading it would have to walk back, and
 * she gets told what would fix it in one short sentence.
 *
 * The reference is the sclera, the same white point the skin reading uses (src/lib/skin.ts).
 * It is close to neutral on every human face, so its measured chromaticity is very nearly a
 * direct read of the illuminant.
 */

export type LightVerdict =
  | 'good'        /* daylight or close enough to it */
  | 'dim'         /* not enough light to trust anything */
  | 'warm-bulb'   /* tungsten or a warm LED, everything reads golden */
  | 'cool-cast'   /* cold LED or overcast through glass, everything reads blue */
  | 'green-cast'  /* fluorescent, the one that flatters nobody */
  | 'blown'       /* direct sun or a lamp straight at her, highlights clipped */
  | 'camera-off'; /* the camera's own colours have broken, no room light does this */

export interface LightReading {
  verdict: LightVerdict;
  ok: boolean;
  /* Correlated colour temperature in kelvin. Daylight sits around 5000 to 6500. */
  cct: number;
  /* 0..1, how bright the white reference is. */
  level: number;
  /* Share of skin pixels sitting at the top of the range with no detail left in them. */
  clipped: number;
  /* Passed, but on the warm side of where the gate used to sit (CCT_MIN to WARM_EDGE). */
  warmish: boolean;
}

/* Daylight runs roughly 5000K at golden hour to 6500K at noon, and north-facing window
   light drifts higher. The band is deliberately generous at the top, because a slightly
   cool window is still daylight and still honest, and tight at the bottom, because a warm
   bulb is the failure that quietly turns every cool undertone warm. */
/* 3600, not 4200. The sclera is the white this reads, and on darker eyes it reads warm: with
   plain paper in the same frame as a deep skinned face, the sclera came out about 50 mired
   (1000 to 1400K) warmer than the paper. At 4200 that turned real daylight into "warm bulb"
   for exactly the women Oira is for, while a lighter face in cool shade passed. Readings
   between 3600 and WARM_EDGE pass but are flagged `warmish`, and confidence.ts caps them at
   fair: nobody who could seal before is refused now. */
const CCT_MIN = 3600;
const WARM_EDGE = 4200;
const CCT_MAX = 7800;
const LEVEL_MIN = 0.14;
const CLIP_MAX = 0.06;

/* McCamy's approximation. Good to a few percent across the range that matters here, and it
   costs one atan versus a lookup table we would have to carry. */
function cctFrom(x: number, y: number): number {
  const n = (x - 0.332) / (0.1858 - y);
  return 449 * n ** 3 + 3525 * n ** 2 + 6823.3 * n + 5520.33;
}

export function readLight(
  white: { r: number; g: number; b: number } | null,
  clipped: number
): LightReading {
  if (!white) {
    /* No sclera means no reference. Do not guess at the light; say it is too dim, which is
       the most common reason the eyes did not read in the first place. */
    return { verdict: 'dim', ok: false, cct: 0, level: 0, clipped, warmish: false };
  }

  const { r, g, b } = white;
  const level = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  /* Linear sRGB to CIE xy. */
  const X = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  const Y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  const Z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
  const sum = X + Y + Z || 1;
  const x = X / sum;
  const y = Y / sum;
  const cct = cctFrom(x, y);

  /* Fluorescent sits off the blackbody line rather than along it, so a colour temperature
     alone will not catch it: it can read as perfectly ordinary daylight while pushing green
     into everything. Green excess against the red and blue average is the cheap tell. */
  const greenExcess = g - (r + b) / 2;
  const green = greenExcess > 0.055 * level;

  /* A frame no light could have made. The white of the eye needing more than three times
     the gain on one channel than another is not a warm room, it is the camera rendering
     colour wrongly: a Galaxy A13 with its white balance locked turned every frame magenta
     and wanted a green gain of 768. Those frames came through as a confident Monk 10. Real
     daylight readings on two phones stayed between about 0.6 and 2. */
  const gains = [r, g, b].map((c) => level / (c || 1e-6));
  const broken = gains.some((k) => k > 3 || k < 1 / 3);

  let verdict: LightVerdict = 'good';
  if (broken) verdict = 'camera-off';
  else if (level < LEVEL_MIN) verdict = 'dim';
  else if (clipped > CLIP_MAX) verdict = 'blown';
  else if (green) verdict = 'green-cast';
  else if (cct < CCT_MIN) verdict = 'warm-bulb';
  else if (cct > CCT_MAX) verdict = 'cool-cast';

  return { verdict, ok: verdict === 'good', cct, level, clipped, warmish: verdict === 'good' && cct < WARM_EDGE };
}
