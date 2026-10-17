import type { BrandQueryLog, SeasonPalette } from '../types';
import { PAYOUT_LADDER, payoutIndex } from './rules';

/* Sample overnight brand questions, answered against HER palette and HER rules.
 *
 * The brands are made up and every entry says it is a sample. What is real is the decision:
 * the same test the program runs in the rollup, at the level the app can see. Her undertone has
 * to match exactly and her depth has to be the one asked for. So most nights are a mix: some
 * yeses, more noes, and the odd question turned away because it broke one of her rules. She is
 * paid for a yes only. A no costs the brand nothing and tells it nothing about her. */

const BRANDS = [
  { name: 'Saffron Row', logo: 'SR' },
  { name: 'Northlight Beauty', logo: 'N' },
  { name: 'Cocoa & Clay', logo: 'CC' },
  { name: 'Marigold Studio', logo: 'M' },
  { name: 'Velour & Kin', logo: 'VK' },
  { name: 'Kiln Cosmetics', logo: 'KC' },
];

/* What a brand offers for one answer, in rungs of her own price ladder around what she has
   asked for. Most offers meet her price and some fall short. The higher she sets it, the more
   brands fall short, which is the real trade: fewer yeses, each one worth more. */
function offerFor(minimum: number, random: () => number): number {
  const at = payoutIndex(minimum);
  const high = at >= PAYOUT_LADDER.length - 5; // $4 and up
  const steps = high ? [-4, -2, -1, 0, 0, 1, 2] : [-3, -1, 0, 0, 1, 2, 4];
  const i = Math.min(PAYOUT_LADDER.length - 1, Math.max(0, at + steps[Math.floor(random() * steps.length)]));
  return PAYOUT_LADDER[i];
}

/* How often the brand happens to be asking about her own season. The rest of the time it is
   another season, which may or may not share her undertone and depth. */
const HER_SEASON_SHARE = 0.4;

export interface HerRules { lowestPayout: number; brandLifetimeCap: number }

export function sampleBrandQuery(
  her: SeasonPalette,
  rules: HerRules,
  earlier: BrandQueryLog[],
  seasons: SeasonPalette[],
  random: () => number = Math.random,
): BrandQueryLog {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
  const brand = pick(BRANDS);
  const others = seasons.filter((s) => s.id !== her.id);
  const target = random() < HER_SEASON_SHARE || !others.length ? her : pick(others);
  const shade = pick(target.swatches);
  const offer = offerFor(rules.lowestPayout, random);
  const base = {
    id: `sample-${Date.now()}-${Math.floor(random() * 1e6)}`,
    brandName: brand.name,
    brandLogo: brand.logo,
    question: `Does '${shade.name}' suit a ${target.name}?`,
    shadeName: shade.name,
    shadeHex: shade.hex,
    timestamp: 'Just now (sample)',
    /* A sample, so it carries no transaction. Real answers settle on chain and link to it. */
    onChainTx: '',
  };

  /* Her rules come first, and a question that breaks one is never looked at. */
  const asked = earlier.filter((l) => l.brandName === brand.name && l.answer !== 'DECLINED').length;
  if (asked >= rules.brandLifetimeCap) {
    return { ...base, answer: 'DECLINED', reason: 'This brand has asked as many times as you allow.', matchConfidence: 0, payout: 0 };
  }
  if (offer < rules.lowestPayout) {
    return { ...base, answer: 'DECLINED', reason: `Offered $${offer.toFixed(2)}, under your $${rules.lowestPayout.toFixed(2)}.`, matchConfidence: 0, payout: 0 };
  }

  const match = target.undertone === her.undertone && target.depth === her.depth;
  return match
    ? { ...base, answer: 'YES', matchConfidence: 90 + Math.floor(random() * 10), payout: offer }
    : { ...base, answer: 'NO', reason: 'Not your match. Nothing about you was shared.', matchConfidence: 5 + Math.floor(random() * 20), payout: 0 };
}
