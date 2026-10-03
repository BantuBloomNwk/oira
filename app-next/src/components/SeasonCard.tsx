import React from 'react';
import { motion } from 'motion/react';
import { Share2, Sparkles, Eye, Info } from 'lucide-react';
import { SeasonPalette, ColorSwatch } from '../types';

interface SeasonCardProps {
  season: SeasonPalette;
  onSelectSwatch: (swatch: ColorSwatch) => void;
  onShareCard: () => void;
  onOpenSeasonPicker: () => void;
}

export const SeasonCard: React.FC<SeasonCardProps> = ({
  season,
  onSelectSwatch,
  onShareCard,
  onOpenSeasonPicker,
}) => {
  return (
    <div
      id="your-season-card"
      className="bg-white rounded-[28px] p-6 sm:p-7 luxury-card-shadow border border-[#F3DDD6] transition-all relative overflow-hidden"
    >
      {/* Top subtle decorative seasonal indicator */}
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[13px] sm:text-[14px] text-[#43203B] font-normal tracking-normal block">
            Your season
          </span>
          <h2 className="font-display text-[32px] sm:text-[38px] font-normal text-[#1B1120] tracking-tight leading-tight mt-0.5">
            {season.name}
          </h2>
        </div>

        <button
          id="season-info-badge-btn"
          onClick={onOpenSeasonPicker}
          className="text-xs px-2.5 py-1 rounded-full bg-[#FBF3EE] hover:bg-[#F3DDD6] text-[#43203B] border border-[#F3DDD6] flex items-center gap-1 transition-colors"
          title="Switch or customize season palette"
        >
          <Sparkles className="w-3 h-3 text-[#C9799B]" />
          <span>Explore</span>
        </button>
      </div>

      {/* Palette Swatches Row with signature concave dish look */}
      <div className="mt-5 mb-5">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2.5">
          {season.swatches.map((swatch, idx) => {
            const isLight = swatch.hex.toLowerCase().includes('#f') || swatch.hex.toLowerCase().includes('#e');
            return (
              <motion.button
                key={swatch.id}
                id={`swatch-btn-${idx}`}
                whileHover={{ scale: 1.1, y: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onSelectSwatch(swatch)}
                className="relative group focus:outline-none flex-1 aspect-square max-w-[54px] sm:max-w-[62px]"
                title={`${swatch.name} (${swatch.hex}) - Tap to inspect shade details`}
              >
                {/* Outer ring */}
                <div
                  className={`w-full h-full rounded-full transition-transform flex items-center justify-center p-[2px] sm:p-[3px] ${
                    isLight ? 'swatch-dish-light border border-[#F3DDD6]' : 'swatch-dish border border-black/10'
                  }`}
                  style={{ backgroundColor: swatch.hex }}
                >
                  {/* Inner recessed concave surface */}
                  <div
                    className="w-full h-full rounded-full relative overflow-hidden"
                    style={{
                      backgroundColor: swatch.hex,
                      boxShadow: isLight
                        ? 'inset 0 2px 4px rgba(0,0,0,0.06), inset 0 -2px 3px rgba(255,255,255,0.9)'
                        : 'inset 0 3px 6px rgba(0,0,0,0.4), inset 0 -1px 3px rgba(255,255,255,0.25)',
                    }}
                  >
                    {/* Subtle optical light reflection curve */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/25 pointer-events-none rounded-full" />
                  </div>
                </div>

                {/* Hover indicator dot */}
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  <span className="text-[10px] font-semibold bg-[#1B1120] text-white px-1.5 py-0.5 rounded shadow">
                    {swatch.name}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Metadata Row: Undertone & Depth */}
      <div className="flex items-center gap-6 sm:gap-8 text-[15px] sm:text-[16px] text-[#43203B] font-medium pt-1 pb-4">
        <div className="flex items-center gap-1.5">
          <span className="text-[#8A6580] font-normal">Undertone:</span>
          <span className="font-semibold text-[#1B1120]">{season.undertone}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[#8A6580] font-normal">Depth:</span>
          <span className="font-semibold text-[#1B1120]">{season.depth}</span>
        </div>
      </div>

      {/* Primary CTA Button */}
      <motion.button
        id="share-season-card-main-btn"
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={onShareCard}
        className="w-full py-3.5 sm:py-4 px-6 bg-[#1B1120] hover:bg-[#43203B] active:bg-[#1B1120] text-white text-[15px] sm:text-[16px] font-medium rounded-2xl shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        <Share2 className="w-4 h-4 text-white/90" />
        <span>Share your season card</span>
      </motion.button>
    </div>
  );
};
