/**
 * Where she sits on the shade scale, and which scale that is.
 *
 * The app already measures ITA, which is the dermatological angle and the right thing to
 * compute. It is not the right thing to SHOW her. Nobody has ever looked at a foundation
 * shelf and thought "I am a minus fifty six". The Monk Skin Tone Scale is ten swatches
 * with a published mapping, it was built specifically because the older scales collapsed
 * the deep end, and it is what the shipping app at app/index.html already seals on chain.
 * Using anything else here would mean the two halves of Oira disagree about what shade she
 * is, which is worse than either answer.
 *
 * Boundaries and swatches are lifted unchanged from app/index.html, which took them from
 * skintone.google (Monk Skin Tone Scale, CC-BY-4.0). Do not tune them. The whole value of
 * a published scale is that its edges are not ours to move, and the app's own comment on
 * the matter is worth repeating: this is the one number in the reading that has real
 * ground truth behind it.
 */

/* The ten swatches, lightest to deepest. */
export const MONK_SWATCHES = [
  '#f6ede4', '#f3e7db', '#f7ead0', '#eadaba', '#d7bd96',
  '#a07e56', '#825c43', '#604134', '#3a312a', '#292420',
] as const;

/* ITA boundaries between adjacent swatches. Nine edges, ten bands. */
const MONK_ITA_BOUNDARIES = [81.6, 76.0, 68.2, 57.5, 30.6, -4.6, -37.8, -66.9, -81.3];

export function monkFromIta(ita: number): number {
  for (let i = 0; i < MONK_ITA_BOUNDARIES.length; i++) {
    if (ita > MONK_ITA_BOUNDARIES[i]) return i + 1;
  }
  return 10;
}

export const monkSwatch = (monk: number): string =>
  MONK_SWATCHES[Math.min(9, Math.max(0, Math.round(monk) - 1))];

/* What to call it out loud. She gets the number and the swatch; this is the word that goes
   in the sentence, and it stays plain rather than clinical. */
export function monkWord(monk: number): string {
  if (monk <= 2) return 'fair';
  if (monk <= 4) return 'light';
  if (monk <= 5) return 'medium';
  if (monk <= 6) return 'tan';
  if (monk <= 7) return 'brown';
  if (monk <= 8) return 'deep brown';
  return 'deepest';
}
