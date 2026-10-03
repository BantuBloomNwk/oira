import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Check, Sparkles, Shield, ChevronRight } from 'lucide-react';
import { SeasonPalette } from '../types';
import { seasonalPalettes } from '../data/paletteData';

interface SeasonSelectorModalProps {
  isOpen: boolean;
  activeSeasonId: string;
  onClose: () => void;
  onSelectSeason: (season: SeasonPalette) => void;
}

export const SeasonSelectorModal: React.FC<SeasonSelectorModalProps> = ({
  isOpen,
  activeSeasonId,
  onClose,
  onSelectSeason,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto no-scrollbar">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          className="relative w-full max-w-[390px] max-h-[92%] bg-[#FBF3EE] rounded-[28px] p-5 shadow-2xl border border-[#F3DDD6] my-auto flex flex-col overflow-y-auto no-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[11px] font-bold text-[#C9799B] uppercase tracking-wider">
                12-Season Framework
              </span>
              <h3 className="font-display text-[24px] sm:text-[28px] text-[#1B1120] leading-tight">
                Seasonal Color Palettes
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[#F3DDD6] text-[#43203B] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-[#8A6580] mb-4">
            Select a seasonal palette to recalibrate your custom swatch discs, skin tone trends, and curated marketplace cosmetics.
          </p>

          {/* List of Seasons */}
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {seasonalPalettes.map((season) => {
              const isCurrent = season.id === activeSeasonId;

              return (
                <div
                  key={season.id}
                  onClick={() => {
                    onSelectSeason(season);
                    onClose();
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-white border-[#C9799B] luxury-card-shadow ring-1 ring-[#C9799B]/30'
                      : 'bg-white/80 hover:bg-white border-[#F3DDD6] hover:border-[#F3DDD6]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-display text-[20px] text-[#1B1120]">
                        {season.name}
                      </h4>
                      <span className="text-[11px] text-[#8A6580]">{season.tagline}</span>
                    </div>

                    {isCurrent ? (
                      <span className="text-xs font-semibold text-[#C9799B] bg-[#FBF3EE] px-2.5 py-0.5 rounded-full flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Active
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#8A6580]" />
                    )}
                  </div>

                  {/* Swatches preview bar */}
                  <div className="flex items-center gap-1.5 mt-3">
                    {season.swatches.map((swatch) => (
                      <div
                        key={swatch.id}
                        className="w-7 h-7 rounded-full swatch-dish border border-black/10"
                        style={{ backgroundColor: swatch.hex }}
                        title={swatch.name}
                      />
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-4 text-[11px] text-[#8A6580]">
                    <span>Undertone: <strong>{season.undertone}</strong></span>
                    <span>Depth: <strong>{season.depth}</strong></span>
                    <span>Contrast: <strong>{season.contrast}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
