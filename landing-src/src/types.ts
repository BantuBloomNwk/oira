export interface Swatch {
  name: string;
  hex: string;
  role?: string;
  pantoneRef?: string;
}

export interface SeasonalArchetype {
  id: string;
  code: string;
  name: string;
  lRange: string;
  description: string;
  undertone: 'Warm' | 'Cool' | 'Neutral-Warm' | 'Neutral-Cool';
  contrast: 'High' | 'Medium-High' | 'Deep' | 'Subtle';
  swatches: Swatch[];
  labCoordinates: {
    l: number;
    a: number;
    b: number;
  };
  melaninDepth: string;
  recommendations: {
    lipPigments: string[];
    foundations: string[];
    metals: string[];
    fabrics: string[];
  };
}
