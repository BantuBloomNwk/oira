/**
 * What she is willing to be paid for one answer.
 *
 * The stepper walked in five cent increments and stopped at two dollars, which put a
 * ceiling on the only number in the app that is entirely hers to set. The range is a tenth
 * of a dollar to ten dollars now, and it is a ladder rather than a linear sweep for two
 * reasons.
 *
 * The first is resolution. She starts at ten cents and the interesting decisions all
 * happen in the first dollar; a linear slider from 0.10 to 10.00 gives that whole region
 * nine percent of the travel and makes the cheap end unusable on a phone.
 *
 * The second is that these are prices. A person naming what her answer is worth says fifty
 * cents or two fifty, never $3.85. Every rung below is a price somebody would actually
 * say out loud, so there is no value on this control she would have to explain.
 */
export const PAYOUT_LADDER = [
  0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 1,
  1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10,
] as const;

export const PAYOUT_MIN = PAYOUT_LADDER[0];
export const PAYOUT_MAX = PAYOUT_LADDER[PAYOUT_LADDER.length - 1];

/* The nearest rung to a value that may not be on the ladder, because a config saved before
   this existed can carry anything. */
export function payoutIndex(value: number): number {
  let best = 0;
  let bestGap = Infinity;
  PAYOUT_LADDER.forEach((rung, i) => {
    const gap = Math.abs(rung - value);
    if (gap < bestGap) { bestGap = gap; best = i; }
  });
  return best;
}

export function payoutAt(index: number): number {
  const i = Math.min(PAYOUT_LADDER.length - 1, Math.max(0, Math.round(index)));
  return PAYOUT_LADDER[i];
}

/* One rung up or down. */
export function payoutStep(value: number, direction: 1 | -1): number {
  return payoutAt(payoutIndex(value) + direction);
}

/* Where a value sits along the control, 0 to 1, for painting the filled part of a track. */
export function payoutFraction(value: number): number {
  return payoutIndex(value) / (PAYOUT_LADDER.length - 1);
}

/* How many questions one brand may ever ask her. Ten is the ceiling the founder set and
   one is the floor: zero is not a cap, it is a block, and blocking belongs elsewhere. */
export const BRAND_CAP_MIN = 1;
export const BRAND_CAP_MAX = 10;
