import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Copy, Check, Sparkles, Shield, Palette, Shirt, Heart } from 'lucide-react';
import { ColorSwatch, SeasonPalette } from '../types';

interface SwatchDetailModalProps {
  swatch: ColorSwatch | null;
  season: SeasonPalette;
  onClose: () => void;
}

export const SwatchDetailModal: React.FC<SwatchDetailModalProps> = ({
  swatch,
  season,
  onClose,
}) => {
  const [copiedHex, setCopiedHex] = useState(false);
  const [activePreviewType, setActivePreviewType] = useState<'fabric' | 'lipstick' | 'eyeshadow'>('fabric');

  if (!swatch) return null;

  const handleCopyHex = () => {
    navigator.clipboard.writeText(swatch.hex);
    setCopiedHex(true);
    setTimeout(() => setCopiedHex(false), 2000);
  };

  const isLight = swatch.hex.toLowerCase().includes('#f') || swatch.hex.toLowerCase().includes('#e');

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto no-scrollbar">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-[390px] max-h-[92%] bg-[#FBF3EE] rounded-[28px] overflow-hidden shadow-2xl border border-[#F3DDD6] my-auto flex flex-col"
        >
          {/* Top Decorative Gradient */}
          <div
            className="h-32 w-full relative flex items-center justify-center transition-colors"
            style={{ backgroundColor: swatch.hex }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />

            <button
              id="close-swatch-modal-btn"
              onClick={onClose}
              className="absolute top-4 right-4 p-2 rounded-full bg-black/30 hover:bg-black/50 text-white backdrop-blur-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Enlarged Signature Dish Swatch in Center */}
            <div className="relative -bottom-10 z-10">
              <div
                className={`w-22 h-22 rounded-full p-2 ${
                  isLight ? 'swatch-dish-light border border-[#F3DDD6]' : 'swatch-dish border border-white/20'
                }`}
                style={{ backgroundColor: swatch.hex }}
              >
                <div
                  className="w-full h-full rounded-full relative overflow-hidden flex items-center justify-center"
                  style={{ backgroundColor: swatch.hex }}
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/30 rounded-full" />
                  <Sparkles className={`w-5 h-5 ${isLight ? 'text-[#43203B]/60' : 'text-white/60'}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Content Body */}
          <div className="pt-12 px-6 pb-6 text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#C9799B]">
              {season.name} Palette
            </span>
            <h3 className="font-display text-[28px] font-normal text-[#1B1120] mt-0.5">
              {swatch.name}
            </h3>
            <p className="text-xs text-[#8A6580] font-mono mt-0.5">{swatch.pantoneName}</p>

            {/* Quick Hex / RGB Card */}
            <div className="mt-4 flex items-center justify-center gap-2">
              <div className="bg-white px-3.5 py-1.5 rounded-full border border-[#F3DDD6] flex items-center gap-2 shadow-2xs">
                <span className="font-mono text-xs font-semibold text-[#1B1120]">{swatch.hex}</span>
                <button
                  id="copy-hex-btn"
                  onClick={handleCopyHex}
                  className="text-[#8A6580] hover:text-[#C9799B] transition-colors p-0.5"
                  title="Copy Hex"
                >
                  {copiedHex ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="bg-white px-3 py-1.5 rounded-full border border-[#F3DDD6] shadow-2xs">
                <span className="text-[11px] font-medium text-[#8A6580]">
                  Match: <span className="font-bold text-[#C9799B]">{swatch.contrastScore}%</span>
                </span>
              </div>
            </div>

            {/* Interactive Virtual Fabric & Texture Preview */}
            <div className="mt-5 bg-white p-4 rounded-2xl border border-[#F3DDD6] text-left">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-[#43203B] flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[#C9799B]" />
                  Virtual Swatch Simulation
                </span>
                <div className="flex gap-1">
                  {(['fabric', 'lipstick', 'eyeshadow'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setActivePreviewType(type)}
                      className={`text-[10px] px-2 py-0.5 rounded-md capitalize font-medium transition-colors ${
                        activePreviewType === type
                          ? 'bg-[#43203B] text-white'
                          : 'bg-[#FBF3EE] text-[#8A6580] hover:text-[#1B1120]'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview Canvas */}
              <div
                className="h-16 rounded-xl relative overflow-hidden flex items-center justify-center border border-black/5"
                style={{ backgroundColor: swatch.hex }}
              >
                {activePreviewType === 'fabric' && (
                  <div className="w-full h-full opacity-30 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:8px_8px]" />
                )}
                {activePreviewType === 'lipstick' && (
                  <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-white/20 to-transparent" />
                )}
                {activePreviewType === 'eyeshadow' && (
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/40 via-transparent to-black/30" />
                )}
                <span className={`text-xs font-semibold z-10 ${isLight ? 'text-black/70' : 'text-white/90'}`}>
                  {activePreviewType.toUpperCase()} SIMULATION
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-[#8A6580]">
                <p>
                  <strong className="text-[#1B1120]">Best Application:</strong> {swatch.bestFor}
                </p>
                <p>
                  <strong className="text-[#1B1120]">Styling Tip:</strong> {swatch.pairingTip}
                </p>
              </div>
            </div>

            {/* Best Metals Pairing */}
            <div className="mt-3 flex items-center justify-between text-xs px-2 text-[#8A6580]">
              <span>Recommended Metals:</span>
              <span className="font-semibold text-[#1B1120]">
                {season.bestMetals.join(', ')}
              </span>
            </div>

            {/* Close / Action */}
            <div className="mt-5">
              <button
                id="done-swatch-modal-btn"
                onClick={onClose}
                className="w-full py-3 bg-[#43203B] hover:bg-[#43203B] text-white font-medium text-sm rounded-xl transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
