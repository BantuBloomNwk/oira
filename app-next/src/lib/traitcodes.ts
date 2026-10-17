/* The numbers her reading is sealed as, and the numbers a brand's campaign targets.
 *
 * They have to be the same on both sides, because the match compares them exactly. The brand
 * studio, the bridge and the test suite all use these; the app used to seal cool as 1 and
 * neutral as 2, the other way round, so cool and neutral women answered each other's brands. */

export const UNDERTONE_CODE = { warm: 0, neutral: 1, cool: 2, olive: 3 } as const;

/* The brand studio's twelve seasons, in its order. */
export const SEASONS_12 = [
  'Bright Spring', 'True Spring', 'Light Spring', 'Light Summer', 'True Summer', 'Soft Summer',
  'Soft Autumn', 'True Autumn', 'Deep Autumn', 'Deep Winter', 'True Winter', 'Bright Winter',
] as const;

/* The app's six seasons, each placed on the studio's twelve. */
const APP_SEASON_TO_12: Record<string, (typeof SEASONS_12)[number]> = {
  'warm-autumn': 'True Autumn',
  'dark-winter': 'Deep Winter',
  'true-winter': 'True Winter',
  'cool-summer': 'True Summer',
  'deep-autumn': 'Deep Autumn',
  'bright-spring': 'Bright Spring',
};

export function undertoneCode(tone: string): number {
  const t = tone.toLowerCase();
  if (t.includes('cool')) return UNDERTONE_CODE.cool;
  if (t.includes('olive')) return UNDERTONE_CODE.olive;
  if (t.includes('neutral')) return UNDERTONE_CODE.neutral;
  return UNDERTONE_CODE.warm;
}

export function seasonCode(appSeasonId: string): number {
  const name = APP_SEASON_TO_12[appSeasonId];
  return name ? SEASONS_12.indexOf(name) : 0;
}
