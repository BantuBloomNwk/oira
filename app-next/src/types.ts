export interface ColorSwatch {
  id: string;
  name: string;
  hex: string;
  rgb: string;
  pantoneName: string;
  bestFor: string;
  makeupCategory: 'lips' | 'cheeks' | 'eyes' | 'wardrobe' | 'neutral';
  pairingTip: string;
  contrastScore: number;
}

export interface OnboardingModel {
  id: string;
  name: string;
  skinShade: string;
  depthLabel: string;
  undertone: 'Cool' | 'Warm' | 'Neutral' | 'Olive';
  fitzpatrickScale: string;
  image: string;
  seasonId: string;
  harmonyColors: string[];
}

export interface NightRulesConfig {
  lowestPayout: number; // in USD / stablecoin, e.g. 0.10
  brandLifetimeCap: number; // e.g. 3
  privacyGuaranteed: boolean;
  isWatching: boolean;
  totalEarned: number;
  totalQuestionsAnswered: number;
  lastAttestationHash: string;
}

export interface BrandQueryLog {
  id: string;
  brandName: string;
  brandLogo: string;
  question: string;
  shadeName: string;
  shadeHex: string;
  answer: 'YES' | 'NO';
  matchConfidence: number;
  payout: number;
  timestamp: string;
  onChainTx: string;
}

export interface SeasonPalette {
  id: string;
  name: string;
  tagline: string;
  undertone: 'Cool' | 'Warm' | 'Neutral' | 'Olive';
  depth: 'Deep' | 'Medium' | 'Light' | 'Fair';
  contrast: 'High' | 'Medium' | 'Low';
  description: string;
  bestMetals: string[];
  worstColors: string[];
  swatches: ColorSwatch[];
  makeupRecommendations: {
    lipstick: string;
    blush: string;
    eyeshadow: string;
    foundationUndertone: string;
  };
}

export interface TrendDataPoint {
  date: string;
  shortDate: string;
  toneConsistency: number; // 0 - 100
  radiance: number; // 0 - 100
  melaninIndex: number; // 0 - 100
  undertoneCoolness: number; // 0 - 100
  notes: string;
}

export interface ProductItem {
  id: string;
  brandLetter: string;
  brandName: string;
  badgeBg: string;
  title: string;
  description: string;
  price: number;
  category: 'Blush' | 'Lipstick' | 'Skincare' | 'Eye' | 'Wardrobe';
  cardBg: string; // e.g. '#381326' or '#D1828D' or '#E8B9BD'
  imageUrl: string;
  /* No matchScore here on purpose. It used to be hardcoded per product, every one of
     them between 95 and 99, which made the shelf useless. It is computed against her
     season now: see src/lib/match.ts. */
  shadeName: string;
  shadeHex: string;
  features: string[];
  rating: number;
  reviewsCount: number;
}

export interface UserProfile {
  /* What she is called. Hers to set; generated if she does not bother. Never the wallet. */
  name: string;
  /* Hers to choose. Deliberately allowed to be empty: the scan does NOT fill this in, and
     an empty string means "she has not picked one yet", which draws her initial rather
     than a stranger's photograph. */
  avatarUrl: string;
  walletId: string;
  isSealed: boolean;
  sealedDate: string;
  seasonId: string;
  /* Her curl, in Andre Walker codes, once she has confirmed it. */
  curl?: string;
  /* What she said she has been using, if she said. Free text, hers, never a picker. */
  routine?: string;
}
