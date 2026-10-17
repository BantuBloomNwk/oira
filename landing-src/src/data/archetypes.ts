import { SeasonalArchetype } from '../types';

export const FEATURED_ARCHETYPES: SeasonalArchetype[] = [
  {
    id: 'deep-autumn',
    code: 'ARCHETYPE 01',
    name: 'Deep Autumn',
    lRange: 'L* 38–45',
    description: 'Spiced clove, terracotta, burnt caramel, and blackened olive harmonies.',
    undertone: 'Warm',
    contrast: 'Deep',
    melaninDepth: 'Scale IV (Rich Bronze)',
    labCoordinates: { l: 42.1, a: 16.2, b: 24.8 },
    swatches: [
      { name: 'Spiced Terracotta', hex: '#9C4123', role: 'Hero Warm Accent', pantoneRef: '18-1443' },
      { name: 'Antique Mustard', hex: '#BD7B1B', role: 'Rich Ochre', pantoneRef: '16-0947' },
      { name: 'Burnt Caramel', hex: '#5C2C16', role: 'Deep Contrast', pantoneRef: '19-1220' },
      { name: 'Champagne Bronze', hex: '#D4AF37', role: 'Lustre Metal', pantoneRef: '14-1036' },
      { name: 'Plum Obsidian', hex: '#381E38', role: 'Shadow Anchor', pantoneRef: '19-2420' }
    ],
    recommendations: {
      lipPigments: ['Spiced Fig 04', 'Burnished Terracotta', 'Mulled Brick', 'Blackened Mahogany'],
      foundations: ['Ochre Warm 42', 'Chestnut Amber 44', 'Golden Espresso 40'],
      metals: ['Aged 18K Yellow Gold', 'Brushed Copper', 'Antique Brass'],
      fabrics: ['Raw Silk Dupioni', 'Heavy Spun Linen', 'Crushed Velvet in Clove']
    }
  },
  {
    id: 'deep-winter',
    code: 'ARCHETYPE 02',
    name: 'Deep Winter',
    lRange: 'L* 28–36',
    description: 'Chilled boysenberry, midnight obsidian, ruby ember, and frosted espresso.',
    undertone: 'Cool',
    contrast: 'High',
    melaninDepth: 'Scale V (Deep Obsidian)',
    labCoordinates: { l: 32.4, a: 8.4, b: 4.2 },
    swatches: [
      { name: 'Chilled Boysenberry', hex: '#781D42', role: 'High Drama Lip', pantoneRef: '19-2041' },
      { name: 'Midnight Sapphire', hex: '#1E3B70', role: 'Jeweled Counterpoint', pantoneRef: '19-4039' },
      { name: 'Plum Obsidian', hex: '#381E38', role: 'Core Royal Base', pantoneRef: '19-2420' },
      { name: 'Ruby Ember', hex: '#50182E', role: 'Vivid Sub-layer', pantoneRef: '19-1840' },
      { name: 'Frosted Jet', hex: '#1A1829', role: 'Absolute Noir', pantoneRef: '19-4007' }
    ],
    recommendations: {
      lipPigments: ['Glazed Blackberry', 'Crimson Noir', 'Iced Boysenberry', 'Electric Bordeaux'],
      foundations: ['Neutral Obsidian 30', 'Cool Espresso 32', 'Blue-Black Chestnut 28'],
      metals: ['Polished Platinum', 'Blackened Ruthenium', 'High-Shine White Gold'],
      fabrics: ['Heavy Duchess Satin', 'Lustrous Brocade', 'Glacial Cashmere']
    }
  },
  {
    id: 'warm-spring',
    code: 'ARCHETYPE 03',
    name: 'Warm Spring',
    lRange: 'L* 50–62',
    description: 'Luminous peach nectar, sunlit persimmon, amber pollen, and golden linen.',
    undertone: 'Warm',
    contrast: 'Medium-High',
    melaninDepth: 'Scale III (Sunlit Honey)',
    labCoordinates: { l: 56.8, a: 19.4, b: 32.1 },
    swatches: [
      { name: 'Luminous Coral', hex: '#E26D5C', role: 'Sunlit Pop', pantoneRef: '16-1544' },
      { name: 'Peach Nectar', hex: '#F4A261', role: 'Radiant Glow', pantoneRef: '14-1135' },
      { name: 'Amber Pollen', hex: '#CCA830', role: 'Warm Lustre', pantoneRef: '14-0955' },
      { name: 'Sage Linen', hex: '#7DAA6A', role: 'Earthy Counter', pantoneRef: '16-0220' },
      { name: 'Golden Chestnut', hex: '#8C512D', role: 'Depth Anchor', pantoneRef: '18-1142' }
    ],
    recommendations: {
      lipPigments: ['Juicy Tangerine Glass', 'Golden Guava', 'Warm Apricot Satin', 'Spiced Coral'],
      foundations: ['Sunlit Honey 54', 'Golden Ochre 58', 'Warm Sandstone 52'],
      metals: ['High-Carat Yellow Gold', 'Rose Gold Vermeil', 'Hammered Brass'],
      fabrics: ['Sheer Organza', 'Crisp Cotton Poplin', 'Sun-bleached Wild Silk']
    }
  },
  {
    id: 'cool-summer',
    code: 'ARCHETYPE 04',
    name: 'Cool Summer',
    lRange: 'L* 45–56',
    description: 'Rosewater veil, smoky lavender, ash-rose silk, and twilight periwinkle.',
    undertone: 'Cool',
    contrast: 'Subtle',
    melaninDepth: 'Scale III-IV (Cool Almond)',
    labCoordinates: { l: 49.3, a: 11.2, b: -2.8 },
    swatches: [
      { name: 'Rosewater Veil', hex: '#CF8BA3', role: 'Petal Flush', pantoneRef: '15-1912' },
      { name: 'Smoky Lavender', hex: '#8C7DAA', role: 'Hazy Contrast', pantoneRef: '17-3817' },
      { name: 'Slate Teal', hex: '#5B7B88', role: 'Subdued Contour', pantoneRef: '18-4417' },
      { name: 'Ash Silk', hex: '#B2A4C4', role: 'Mist Highlighter', pantoneRef: '14-3907' },
      { name: 'Twilight Periwinkle', hex: '#3B2C48', role: 'Velvet Base', pantoneRef: '19-3518' }
    ],
    recommendations: {
      lipPigments: ['Mauve Glaze', 'Vintage Dusty Rose', 'Smoked Blackberry', 'Plum Wash'],
      foundations: ['Cool Almond 48', 'Rosy Cocoa 50', 'Muted Mocha 46'],
      metals: ['Antique Sterling Silver', 'Pewter', 'Rhodium Frost'],
      fabrics: ['Faded Crepe de Chine', 'Smoky Georgette', 'Fine Gauge Cashmere']
    }
  }
];
