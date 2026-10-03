import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldCheck, CheckCircle2, Lock, ExternalLink, Sparkles } from 'lucide-react';
import { BrandQueryLog } from '../types';

interface BrandBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  brandLogs: BrandQueryLog[];
  brandLifetimeCap: number;
}

const verifiedBrands = [
  { name: 'Marigold Studio', logo: 'M', questionsUsed: 1, maxCap: 3, lastActive: '2:41 AM' },
  { name: 'Velour & Kin', logo: 'VK', questionsUsed: 1, maxCap: 3, lastActive: '4:15 AM' },
  { name: 'Kiln Cosmetics', logo: 'KC', questionsUsed: 1, maxCap: 3, lastActive: '5:50 AM' },
  { name: 'Saffron Row', logo: 'SR', questionsUsed: 0, maxCap: 3, lastActive: 'Queued' },
  { name: 'Northlight Beauty', logo: 'N', questionsUsed: 0, maxCap: 3, lastActive: 'Queued' },
  { name: 'Cocoa & Clay', logo: 'CC', questionsUsed: 0, maxCap: 3, lastActive: 'Queued' },
];

export const BrandBoardModal: React.FC<BrandBoardModalProps> = ({
  isOpen,
  onClose,
  brandLogs,
  brandLifetimeCap,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-50 flex items-center justify-center p-3 bg-black/65 backdrop-blur-xs overflow-y-auto no-scrollbar">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative w-full max-w-[390px] max-h-[92%] bg-[#FBF3EE] text-[#43203B] rounded-[32px] shadow-2xl border border-[#F3DDD6] p-5 select-none my-auto flex flex-col overflow-y-auto no-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[11px] tracking-wider text-moon/70 uppercase">
                Who asked
              </span>
              <h3 className="font-display text-[22px] text-[#43203B]">
                Brands On The Board
              </h3>
            </div>
            <button
              id="brand-board-close-btn"
              onClick={onClose}
              className="p-1.5 rounded-full bg-[#F3DDD6] hover:bg-[#EFDDE2] text-moon/70 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs text-moon/70 mb-4">
            Sample brands for now, so you can see how asking works. Real offers come with our first brand pilots, and none of them ever sees your photos.
          </p>

          {/* Brands List */}
          <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
            {verifiedBrands.map((brand, i) => (
              <div
                key={i}
                className="p-3 rounded-2xl bg-white border border-[#EFDDE2] flex items-center justify-between shadow-2xs"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#43203B] text-white flex items-center justify-center font-serif text-xs font-bold">
                    {brand.logo}
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-[#43203B] flex items-center gap-1">
                      {brand.name}
                      <CheckCircle2 className="w-3 h-3 text-[#B4813C]" />
                    </h4>
                    <span className="text-[10.5px] text-moon/70">
                      Last active: {brand.lastActive}
                    </span>
                  </div>
                </div>

                {/* Quota Segments */}
                <div className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {[...Array(brandLifetimeCap)].map((_, segIdx) => (
                      <div
                        key={segIdx}
                        className={`w-3.5 h-1.5 rounded-full ${
                          segIdx < brand.questionsUsed
                            ? 'bg-[#43203B]'
                            : 'bg-[#EFDDE2]'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] text-moon/70 font-mono block mt-0.5">
                    {brand.questionsUsed}/{brandLifetimeCap} used
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Privacy footnote */}
          <div className="mt-4 pt-3 border-t border-[#F3DDD6] flex items-center justify-between text-[11px] text-moon/70">
            <span className="flex items-center gap-1 text-[#B4813C]">
              <Lock className="w-3 h-3" />
              Answered privately
            </span>
            <button
              id="brand-board-done-btn"
              onClick={onClose}
              className="py-1 px-4 rounded-full bg-[#43203B] text-white text-xs font-medium hover:bg-[#43203B]"
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
