/**
 * How much of this reading is her, and how much is the room?
 *
 * Every number the scan produces already carries its own doubt. `skin.ts` knows whether it
 * found a white point to correct against, whether the light was tinted harder than the
 * correction is allowed to go, how many skin pixels it actually measured and how many of
 * them had no detail left in them. `light.ts` knows what the room was doing. `scan.ts`
 * knows how many frames survived the hold. All of it was computed, none of it was used,
 * and the seal took whatever the last good frame said with the same confidence every time.
 *
 * That is the gap this file closes, and it is not a polish item. The product sells a yes to
 * a brand on the strength of a sealed reading. A yes derived from an uncorrected frame under
 * a tungsten bulb is not a cheaper yes, it is a wrong one, and the first time somebody
 * checks our answer against a real instrument the whole claim goes with it. Worse on deep
 * skin than anywhere else, because that is where the camera is least honest to begin with,
 * and it is the exact place a misread would deserve to cost us.
 *
 * So: a reading below the floor is not sealed and is not sold. She is asked for another one.
 * A low-confidence scan is a recapture, never a quiet no.
 *
 * WHAT THIS IS NOT. It is not accuracy. Nothing here has been checked against a colorimeter
 * yet, so these weights are a defensible ordering of known failure modes, not a calibrated
 * error model. When the measured error table exists, the thresholds below get replaced by
 * numbers that came from an instrument, and the shape of this file should survive that.
 * Until then it is deliberately pessimistic: it would rather send her back to a window than
 * seal something we would have to walk back.
 */

import type { LightReading } from './light';
import type { SkinReading } from './skin';

/* How the frame was taken. Today there is one answer and it is the weakest one: a browser
   getUserMedia stream, where the phone's own processing has already guessed the white
   balance and crushed the highlights before we see a pixel. It is recorded anyway, from the
   first sealed reading, because the whole point of the native capture work is to be able to
   say which readings came through it, and a field added later cannot describe the readings
   taken before it existed. */
export type CapturePath = 'browser' | 'native' | 'controlled';
/* browser: a web page, camera fully automatic.
   native: the app shell, camera still fully automatic. Before 2026-10-04 this label was also
   written when the shell had "locked" the camera through a plugin that never held anything,
   so older readings labelled native were not locked either.
   controlled: exposure was held still on the stream we read, and the camera itself reported
   it (lib/camera-control.ts). White balance is never locked. */

export type ConfidenceBand =
  | 'firm'   /* corrected against a real white point in light worth trusting */
  | 'fair'   /* usable, with something specific working against it */
  | 'thin';  /* not sealed, and she is told why in one sentence */

export interface Confidence {
  /* 0..1. Only ever read as a band or compared to the floor; it is not a percentage to
     show her, because a number that precise about a thing this rough is its own lie. */
  score: number;
  band: ConfidenceBand;
  /* The gate. False means the reading does not get sealed at all. */
  sealable: boolean;
  /* Why it is not firm, worst first, in words she could read. Empty when it is firm. */
  reasons: string[];
  capture: CapturePath;
}

/* Below this, nothing is sealed. Set where it is because every failure that lands under it
   is one she can actually fix by moving, and asking her to move is a far smaller cost than
   sealing a reading her palette is then built on. */
const FLOOR = 0.55;
const FIRM = 0.78;

/* A reading resting on fewer skin pixels than this is a guess dressed as a measurement. The
   number is the same order as the one skin.ts already calls "under a few hundred and it is
   a guess", kept here so the two do not drift apart silently. */
const SAMPLES_MIN = 600;

/* The hold runs 3.2 seconds and samples throughout. Three surviving frames is the minimum
   consolidate() will medianate over at all; below about six the median is doing very little
   work and a single blink or a passing shadow still moves the answer. */
const FRAMES_GOOD = 6;

export interface ConfidenceInput {
  skin: SkinReading | null;
  light: LightReading | null;
  /* How many frames with a usable skin reading went into the median. */
  frames: number;
  capture?: CapturePath;
}

export function assess({ skin, light, frames, capture = 'browser' }: ConfidenceInput): Confidence {
  const reasons: string[] = [];

  /* No skin reading at all is not a low score, it is the absence of a measurement. */
  if (!skin) {
    return { score: 0, band: 'thin', sealable: false, reasons: ['no-skin'], capture };
  }

  let score = 1;

  /* The heaviest single penalty, and it is heavy on purpose. Without the sclera there was
     no white point, so the frame was never corrected: what is being reported is whatever
     the camera decided the light was. That is the failure that reads a light-medium woman
     as deep brown, which this codebase has already been caught doing once. */
  if (!skin.whiteBalanced) {
    score -= 0.34;
    reasons.push('no-white-point');
  }

  /* The correction ran but clamped. The depth survives this better than the undertone does,
     because a cast moves the colour axes long before it moves lightness. */
  if (skin.strongCast) {
    score -= 0.2;
    reasons.push('strong-cast');
  }

  /* Clipped pixels carry no information at all, and they are not evenly distributed: they
     come off the lit side of her face, so they bias the reading lighter exactly when the
     lamp is worst placed. light.ts refuses outright past 6 percent; this handles the range
     underneath that, which is common and currently invisible. */
  if (skin.clipped > 0.02) {
    score -= Math.min(0.22, (skin.clipped - 0.02) * 6);
    reasons.push('highlights-clipped');
  }

  if (skin.samples < SAMPLES_MIN) {
    score -= Math.min(0.25, (1 - skin.samples / SAMPLES_MIN) * 0.25);
    reasons.push('small-sample');
  }

  if (frames < FRAMES_GOOD) {
    score -= Math.min(0.18, (1 - frames / FRAMES_GOOD) * 0.18);
    reasons.push('few-frames');
  }

  /* The room, as light.ts judged it. A scan should not normally reach here on a bad verdict
     because the hold does not release until the light is good, but the verdict can turn
     between the last gate and the shutter, and a reading is allowed to know that. */
  if (light && !light.ok) {
    score -= 0.15;
    reasons.push('light-turned');
  }

  score = Math.max(0, Math.min(1, score));

  /* Warm side of the light gate (light.ts). Passed, because on darker eyes the sclera reads
     warm and refusing here refused deep skinned women in daylight; never firm, because some
     of these really are warm rooms. A cap, not a penalty: what sealed before still seals. */
  if (light?.warmish) {
    score = Math.min(score, FIRM - 0.01);
    reasons.push('warm-edge');
  }

  const band: ConfidenceBand = score >= FIRM ? 'firm' : score >= FLOOR ? 'fair' : 'thin';

  return { score, band, sealable: band !== 'thin', reasons, capture };
}

/* What actually gets sealed.
 *
 * Not a Monk integer and not a season name. Those are labels derived from the measurement,
 * and a label sealed on its own cannot be re-derived, re-checked, or corrected when the
 * calibration improves. What is kept is the measurement plus the conditions it was taken
 * in, so that a brand query can gate on confidence, a later scan can be compared against
 * this one honestly, and a reading taken through the browser today stays distinguishable
 * from one taken through a native camera tomorrow.
 *
 * There is no face in here, and there is no image. That is the entire claim, and it holds
 * because of what this type does not have room for. */
export interface SealedReading {
  lab: { L: number; a: number; b: number };
  ita: number;
  /* The illuminant this was read under, in kelvin, or null when the light could not be
     judged. A reading without its illuminant is not comparable to anything. */
  cct: number | null;
  confidence: number;
  band: ConfidenceBand;
  capture: CapturePath;
  /* Milliseconds. Skin moves with heat, blood flow and whatever was on it, so a trend line
     built without knowing when each point was taken is a trend line about nothing. */
  at: number;
}

export function seal(
  skin: SkinReading,
  light: LightReading | null,
  confidence: Confidence
): SealedReading {
  return {
    lab: skin.lab,
    ita: skin.ita,
    cct: light ? Math.round(light.cct) : null,
    confidence: Math.round(confidence.score * 100) / 100,
    band: confidence.band,
    capture: confidence.capture,
    at: Date.now(),
  };
}
