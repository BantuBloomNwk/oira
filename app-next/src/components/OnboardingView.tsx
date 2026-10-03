import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, ChevronRight, Wallet, Check, ShieldCheck, ArrowRight } from 'lucide-react';
import { onboardingModels } from '../data/paletteData';
import { OnboardingModel } from '../types';

interface OnboardingViewProps {
  onContinue: (selectedModel?: OnboardingModel) => void;
  onUseWallet: () => void;
  /* She asked to see this again rather than arriving at it, so the button below goes back
     to where she was instead of opening the camera at a woman who is already sealed. */
  replay?: boolean;
}

export const OnboardingView: React.FC<OnboardingViewProps> = ({ onContinue, onUseWallet, replay = false }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  // Auto-cycle through the portraits, deepest first
  useEffect(() => {
    if (!isAutoPlaying) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % onboardingModels.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [isAutoPlaying, currentIndex]);

  const currentModel = onboardingModels[currentIndex];
  /* Which half of the promise this portrait carries. Read off the model's own measured
     depth rather than a hand-kept list, so adding a portrait cannot get it wrong. */
  const deepToned = ['Deepest', 'Rich Deep', 'Deep', 'Brown'].includes(currentModel.depthLabel);

  const handleSelectModel = (index: number) => {
    setIsAutoPlaying(false);
    setCurrentIndex(index);
  };

  return (
    <div className="relative w-full h-full min-h-full bg-[#1B1120] text-white flex flex-col justify-between overflow-hidden select-none">
      {/* Full-bleed Background Model Portrait (Seamless Studio Beauty Shot) */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentModel.id}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          className="absolute inset-0 w-full h-full"
        >
          <img
            src={currentModel.image}
            alt={currentModel.name}
            className="w-full h-full object-cover object-top filter brightness-[0.92] contrast-[1.05]"
            referrerPolicy="no-referrer"
          />

          {/* Luxury Vignette & Soft Gradient Masks matching reference 52ac06a80cab104d3e295017f460db64.webp */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/10 to-[#1B1120]/95" />
          <div className="absolute inset-0 bg-radial from-transparent via-transparent to-black/60 pointer-events-none" />
        </motion.div>
      </AnimatePresence>

      {/* Top Floating Brand & Model Spectrum Switcher */}
      <header className="relative z-20 pt-6 px-5 flex items-center justify-between">
        <div>
          <span className="font-display text-[28px] sm:text-[32px] tracking-tight text-white drop-shadow-md">
            Oira
          </span>
          <span className="block text-[11px] tracking-wider text-[#F3DDD6]/90 uppercase drop-shadow-sm">
            Skin & Chroma Intelligence
          </span>
        </div>

        {/* Melanin Spectrum Dot Pills */}
        <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20">
          {onboardingModels.map((model, idx) => (
            <button
              key={model.id}
              onClick={() => handleSelectModel(idx)}
              className={`transition-all duration-300 rounded-full cursor-pointer ${
                currentIndex === idx
                  ? 'w-5 h-2 bg-[#F3DDD6] shadow-xs'
                  : 'w-2 h-2 bg-white/40 hover:bg-white/70'
              }`}
              title={`${model.name} • ${model.skinShade}`}
            />
          ))}
        </div>
      </header>

      {/* Floating Glassmorphic Feature Tags (Matching reference image) */}
      <div className="relative z-20 px-5 my-auto pointer-events-none">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="ml-auto w-fit max-w-[200px] mb-6 p-2.5 rounded-2xl bg-black/40 backdrop-blur-md border border-white/20 text-right shadow-lg"
        >
          {/* This tag sits directly on her face, so it has to be true of the face it is
              sitting on. "Harmonised for melanin-rich skin" over a fair woman reads as a
              description of her rather than a claim about the product, and gets the whole
              thing exactly backwards. The deep-tone promise stays where it belongs and the
              lighter portraits carry the other half of the same promise, which is that
              nobody gets defaulted. */}
          <p className="text-[11.5px] font-medium text-white leading-tight">
            {deepToned ? 'Deep tone precision.' : 'Read as you are.'}
          </p>
          <span className="text-[10px] text-[#F3DDD6]/90">
            {deepToned
              ? 'Harmonised for melanin-rich skin'
              : 'Every undertone, none of them a default'}
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="mr-auto w-fit max-w-[210px] p-2.5 rounded-2xl bg-black/40 backdrop-blur-md border border-white/20 shadow-lg"
        >
          <p className="text-[11.5px] font-medium text-white leading-tight">
            Overnight Privacy.
          </p>
          <span className="text-[10px] text-[#EFDDE2]/90">
            Biometrics never leave your device
          </span>
        </motion.div>
      </div>

      {/* Bottom Content & Actions (Bold Typography matching reference image) */}
      <footer className="relative z-20 pb-6 px-5 flex flex-col justify-end">
        {/* Model Shade & Undertone Pill Badge */}
        {/* The portrait sits inside an AnimatePresence with mode="wait", so the outgoing
            photo stays on screen for the length of its exit while state has already moved
            on. Left outside, this pill named the next woman over the previous woman's face
            for most of a second, every single transition. It fades on the same key and the
            same curve so a name never lands on the wrong face. */}
        <div className="mb-2.5 flex items-center justify-between">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentModel.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
              className="bg-black/50 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 inline-flex items-center gap-2"
            >
              <div className="w-2.5 h-2.5 rounded-full bg-[#B4813C] animate-pulse" />
              <span className="text-xs text-white font-medium">
                {currentModel.name} • {currentModel.skinShade}
              </span>
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center -space-x-1.5 bg-black/40 backdrop-blur-md p-1 rounded-full border border-white/20">
            {currentModel.harmonyColors.slice(0, 4).map((c, i) => (
              <div
                key={i}
                className="w-3.5 h-3.5 rounded-full border border-white shadow-xs"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {/* Large Bold Headline */}
        <h2 className="text-[25px] sm:text-[28px] font-extrabold uppercase tracking-tight text-white leading-[1.1] mb-3.5 drop-shadow-md">
          DISCOVER YOUR SKIN’S <br />
          <span className="text-[#F3DDD6] font-serif italic font-normal lowercase tracking-normal text-[30px] sm:text-[34px]">
            real essentials
          </span>
        </h2>

        {/* Action Buttons.
            "GET STARTED" went straight to a dashboard showing a sealed palette she had
            never been read for. The next screen is the camera, so the button says so: a
            woman who is about to be asked for her face deserves to know one tap early,
            and she is the exact person who has good reason to be careful about it. */}
        <div className="space-y-2 w-full">
          <motion.button
            id="onboarding-get-started-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onContinue(currentModel)}
            className="w-full py-3.5 px-6 rounded-full bg-white text-[#1B1120] hover:bg-[#FBF3EE] font-bold text-[14px] tracking-wider uppercase shadow-[0_10px_25px_rgba(0,0,0,0.45)] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{replay ? 'BACK TO MY PALETTE' : 'READ MY SKIN'}</span>
            <ChevronRight className="w-4 h-4 text-[#1B1120] stroke-[3]" />
          </motion.button>

          {!replay && (
            <p className="text-center text-[10.5px] text-[#F3DDD6]/80 leading-snug px-2">
              Next is your camera, for about five seconds. The picture stays on this phone.
            </p>
          )}

          <motion.button
            id="onboarding-wallet-alt-btn"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onUseWallet}
            className="w-full py-2.5 px-4 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white border border-white/30 text-[12.5px] font-medium transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <Wallet className="w-3.5 h-3.5 text-[#F3DDD6]" />
            <span>{replay ? 'Skip the montage' : 'I already have a wallet'}</span>
          </motion.button>
        </div>
      </footer>
    </div>
  );
};
