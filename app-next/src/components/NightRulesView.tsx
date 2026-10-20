import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowLeft, 
  Minus, 
  Plus, 
  Check, 
  Moon, 
  ShieldCheck, 
  Sparkles, 
  Droplets, 
  Play, 
  Lock,
  Flower2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { NightRulesConfig, BrandQueryLog, SeasonPalette } from '../types';
import type { MyAnswer } from '../lib/answers';
import { buildRituals } from '../lib/rituals';
import { NightDecor } from './Decor';
import {
  BRAND_CAP_MAX, BRAND_CAP_MIN, PAYOUT_LADDER, PAYOUT_MAX, PAYOUT_MIN,
  payoutAt, payoutIndex, payoutStep,
} from '../lib/rules';

interface NightRulesViewProps {
  /* Rituals are built from these, so the tab stops showing the same two paragraphs of
     product copy to every woman who opens it. */
  season: SeasonPalette;
  reading?: {
    curlFamily?: string;
    skinDryness?: string;
    skinShine?: string;
    skinBlemish?: boolean;
  };
  routine?: string;
  config: NightRulesConfig;
  onUpdateConfig: (newConfig: NightRulesConfig) => void;
  onSimulateBrandQuery?: (rules: { lowestPayout: number; brandLifetimeCap: number }) => BrandQueryLog;
  /* Real answers to real brand briefs. null until loaded. */
  myAnswers?: { answers: MyAnswer[]; earned: number } | null;
  answersState?: 'idle' | 'loading' | 'failed';
  sealed?: boolean;
  onRefreshAnswers?: () => void;
  onOpenSend?: () => void;
  onBackToHome: () => void;
  /* Goodnight. Her rules are set, so she goes to the sleeping screen. */
  onGoodnight?: () => void;
}

export const NightRulesView: React.FC<NightRulesViewProps> = ({
  season,
  reading,
  routine,
  config,
  onUpdateConfig,
  onSimulateBrandQuery,
  myAnswers = null,
  answersState = 'idle',
  sealed = false,
  onRefreshAnswers,
  onBackToHome,
  onOpenSend,
  onGoodnight,
}) => {
  const [lowestPayout, setLowestPayout] = useState(config.lowestPayout);
  const [brandCap, setBrandCap] = useState(config.brandLifetimeCap);
  const [activeTab, setActiveTab] = useState<'rules' | 'rituals'>('rules');
  const [isSimulating, setIsSimulating] = useState(false);
  const [lastTry, setLastTry] = useState<BrandQueryLog | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const { rituals, note: ritualNote } = buildRituals({
    season,
    curlFamily: reading?.curlFamily,
    skinDryness: reading?.skinDryness,
    skinShine: reading?.skinShine,
    skinBlemish: reading?.skinBlemish,
    routine,
  });

  const handleDecreasePayout = () => setLowestPayout((prev) => payoutStep(prev, -1));
  const handleIncreasePayout = () => setLowestPayout((prev) => payoutStep(prev, 1));

  const handleDecreaseCap = () => {
    setBrandCap((prev) => Math.max(BRAND_CAP_MIN, prev - 1));
  };

  const handleIncreaseCap = () => {
    setBrandCap((prev) => Math.min(BRAND_CAP_MAX, prev + 1));
  };

  const handleSaveRules = () => {
    onUpdateConfig({
      ...config,
      lowestPayout,
      brandLifetimeCap: brandCap,
    });
    setSavedSuccess(true);
    confetti({
      particleCount: 35,
      spread: 50,
      origin: { y: 0.8 },
      colors: ['#C9799B', '#D6A756', '#FBF3EE'],
    });
    setTimeout(() => {
      setSavedSuccess(false);
      onGoodnight?.();
    }, 1500);
  };

  /* One sample brand question, decided against her palette and the rules on this screen as
     they stand right now, saved or not. */
  const handleTriggerSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      const q = onSimulateBrandQuery?.({ lowestPayout, brandLifetimeCap: brandCap }) ?? null;
      setLastTry(q);
      setIsSimulating(false);
    }, 1000);
  };

  return (
    <div className="relative w-full min-h-full bg-[#1B1120] text-[#F3E9E4] px-4 pt-3 pb-8 flex flex-col justify-between select-none overflow-hidden">
      <NightDecor />

      {/* Top Header & Tab Switcher */}
      <div className="relative z-10">
        {/* Home, then the two tabs. The row overflowed the frame at 420px and pushed
            "Rituals" off the right edge, so the tabs are tighter and the row is allowed to
            shrink rather than being told to space-between at any width. */}
        <div className="w-full flex items-center justify-between gap-2 mb-3">
          <button
            onClick={onBackToHome}
            className="px-2.5 py-2 rounded-full bg-white/10 hover:bg-white/20 text-[#EFDDE2] transition-colors cursor-pointer flex items-center gap-1 text-xs shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Home</span>
          </button>

          <div className="flex items-center gap-1 bg-white/10 p-1 rounded-full border border-white/10 text-[11px] shrink-0">
            <button
              id="night-tab-rules-btn"
              onClick={() => setActiveTab('rules')}
              className={`px-2.5 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'rules'
                  ? 'bg-[#43203B] text-white shadow-xs font-medium'
                  : 'text-moon/70 hover:text-white'
              }`}
            >
              Night Rules
            </button>
            <button
              id="night-tab-rituals-btn"
              onClick={() => setActiveTab('rituals')}
              className={`px-2.5 py-1.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'rituals'
                  ? 'bg-[#43203B] text-white shadow-xs font-medium'
                  : 'text-moon/70 hover:text-white'
              }`}
            >
              Rituals
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Moon className="w-4 h-4 text-[#C9799B]" />
            <span className="text-[11px] tracking-wider text-[#C9799B] uppercase font-medium">
              WHILE YOU SLEEP
            </span>
          </div>
          <h1 className="font-display text-[34px] sm:text-[38px] text-white leading-tight font-normal">
            Tonight's Rules
          </h1>
          <p className="text-[12px] text-moon/70 leading-snug">
            Brands can ask whether their shades suit you while you sleep. They never see your face, your photos or your name. You decide what it costs them.
          </p>
        </div>

        {activeTab === 'rules' ? (
          /* Rules Content */
          <div className="space-y-3.5">
            {/* Card 1: What one answer costs.
                The stepper alone used to be the whole control and it stopped at two
                dollars. The slider carries the range now and the stepper stays for the
                last rung either way, which is the pattern every price field she has
                already used works to. */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[12.5px] font-medium text-white block">
                    What one answer costs
                  </span>
                  <span className="text-[11px] text-moon/70">
                    The least you will take for a yes or a no
                  </span>
                </div>

                {/* Stepper Controls */}
                <div className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded-full border border-white/15 shrink-0">
                  <button
                    id="decrease-payout-btn"
                    onClick={handleDecreasePayout}
                    disabled={lowestPayout <= PAYOUT_MIN}
                    aria-label="Ask for less"
                    className="w-6 h-6 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-sm font-semibold text-[#F3DDD6] min-w-[52px] text-center">
                    ${lowestPayout.toFixed(2)}
                  </span>
                  <button
                    id="increase-payout-btn"
                    onClick={handleIncreasePayout}
                    disabled={lowestPayout >= PAYOUT_MAX}
                    aria-label="Ask for more"
                    className="w-6 h-6 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div>
                <input
                  id="payout-slider"
                  type="range"
                  min={0}
                  max={PAYOUT_LADDER.length - 1}
                  step={1}
                  value={payoutIndex(lowestPayout)}
                  onChange={(e) => setLowestPayout(payoutAt(Number(e.target.value)))}
                  aria-label="What one answer costs"
                  aria-valuetext={`$${lowestPayout.toFixed(2)}`}
                  className="oira-range on-night"
                  style={{
                    ['--oira-track' as string]:
                      'linear-gradient(to right, #43203B 0%, #A85578 42%, #C9799B 68%, #D6A756 100%)',
                  }}
                />
                <div className="flex items-center justify-between text-[10px] font-mono text-moon/45 -mt-0.5">
                  <span>${PAYOUT_MIN.toFixed(2)}</span>
                  <span className="text-moon/35 font-sans tracking-wide">
                    ask more and fewer brands will meet it
                  </span>
                  <span>${PAYOUT_MAX.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Card 2: Brand Lifetime Question Cap */}
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[12.5px] font-medium text-white block">
                    How often one brand may ask
                  </span>
                  <span className="text-[11px] text-moon/70">
                    Ever. After this they are done asking you.
                  </span>
                </div>

                <div className="flex items-center gap-2 bg-black/40 px-2 py-1 rounded-full border border-white/15">
                  <button
                    id="decrease-cap-btn"
                    onClick={handleDecreaseCap}
                    disabled={brandCap <= BRAND_CAP_MIN}
                    aria-label="Let them ask less often"
                    className="w-6 h-6 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="font-mono text-sm font-semibold text-[#F3DDD6] min-w-[30px] text-center">
                    {brandCap}
                  </span>
                  <button
                    id="increase-cap-btn"
                    onClick={handleIncreaseCap}
                    disabled={brandCap >= BRAND_CAP_MAX}
                    aria-label="Let them ask more often"
                    className="w-6 h-6 rounded-full hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Ten segments, filled to the cap. Drawing only the chosen number of bars
                  and stretching them to the width made three and ten look identical, which
                  is the one thing a gauge must never do. */}
              <div className="flex items-center gap-1 pt-1" aria-hidden>
                {[...Array(BRAND_CAP_MAX)].map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                      i < brandCap ? 'bg-[#A85578]' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Zero Knowledge Privacy Guarantee */}
            <div className="p-3 rounded-xl bg-[#1B1120] border border-[#43203B] flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-[#B4813C] shrink-0" />
              <p className="text-[11.5px] text-[#EFDDE2] leading-tight">
                Your photos never leave this phone. Not to them, not to me.
              </p>
            </div>

            {/* Real brands, real answers. Only hers, fetched with her own signature. */}
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-[#EFDDE2]/70">Brands that asked you</span>
                {sealed && onRefreshAnswers && (
                  <button onClick={onRefreshAnswers} disabled={answersState === 'loading'} className="text-[11px] text-[#F3DDD6] underline disabled:opacity-40 cursor-pointer">
                    {answersState === 'loading' ? 'Checking...' : 'Check again'}
                  </button>
                )}
              </div>
              {!sealed ? (
                <p className="text-[11.5px] text-[#EFDDE2]/70 mt-1.5">Seal your reading first, then brands can ask and the answers show up here.</p>
              ) : answersState === 'failed' ? (
                <p className="text-[11.5px] text-[#EFDDE2]/70 mt-1.5">I couldn't check just now. Tap "Check again" in a moment.</p>
              ) : !myAnswers ? (
                <p className="text-[11.5px] text-[#EFDDE2]/70 mt-1.5">Checking who's asked...</p>
              ) : myAnswers.answers.length === 0 ? (
                <p className="text-[11.5px] text-[#EFDDE2]/70 mt-1.5">No brand has asked you yet. When one does, you'll see it here, and they'll never see you.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11.5px] text-[#F3DDD6]">${myAnswers.earned.toFixed(2)} earned from {myAnswers.answers.filter((a) => a.outcome === 'yes').length} yes{myAnswers.answers.filter((a) => a.outcome === 'yes').length === 1 ? '' : 'es'}</p>
                    {onOpenSend && myAnswers.earned > 0 && (
                      <button type="button" onClick={onOpenSend} className="shrink-0 text-[11.5px] font-semibold text-[#D6A756] underline cursor-pointer">Send it</button>
                    )}
                  </div>
                  {myAnswers.answers.slice(0, 8).map((a, i) => (
                    <div key={i} className="p-2.5 rounded-xl bg-[#1B1120] border border-[#43203B] text-[11.5px] leading-snug">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#F3DDD6] font-semibold truncate">{a.brand}</span>
                        <span className={a.outcome === 'yes' ? 'text-[#D6A756] font-semibold shrink-0' : 'text-[#EFDDE2]/70 shrink-0'}>
                          {a.outcome === 'yes' ? `Yes, +$${a.amount.toFixed(2)}` : a.outcome === 'no' ? 'No, $0.00' : 'Turned away'}
                        </span>
                      </div>
                      <p className="text-[#EFDDE2]/75 mt-0.5">{a.category} for a {a.season}, ${a.payout.toFixed(2)} a yes</p>
                      <p className="text-[#EFDDE2]/55 mt-0.5">
                        {a.outcome === 'yes' ? 'It suits you. They learned that, and nothing else.' : a.outcome === 'no' ? 'Not your match. Nothing about you was shared.' : a.reason || 'It broke one of your rules.'}
                        {a.explorer && <> <a href={a.explorer} target="_blank" rel="noopener" className="underline text-[#F3DDD6]">See the payment</a></>}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Overnight Simulator Test Trigger */}
            <div className="pt-1">
              <button
                onClick={handleTriggerSimulation}
                disabled={isSimulating}
                className="w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs text-[#F3E9E4] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Play className="w-3 h-3 text-[#F3DDD6]" />
                <span>
                  {isSimulating ? 'Asking for you...' : 'Try a sample brand question'}
                </span>
              </button>
              {lastTry && !isSimulating && (
                <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10 text-[11.5px] leading-snug">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[#F3DDD6] font-semibold">{lastTry.brandName} <span className="font-normal text-[#EFDDE2]/60">(sample)</span></span>
                    <span className={lastTry.answer === 'YES' ? 'text-[#D6A756] font-semibold' : 'text-[#EFDDE2]/70'}>
                      {lastTry.answer === 'YES' ? `Yes, +$${lastTry.payout.toFixed(2)}` : lastTry.answer === 'NO' ? 'No, $0.00' : 'Turned away'}
                    </span>
                  </div>
                  <p className="text-[#EFDDE2]/80 mt-1">{lastTry.question}</p>
                  {lastTry.answer === 'YES'
                    ? <p className="text-[#EFDDE2]/60 mt-1">It suits you. They learn that, and nothing else.</p>
                    : <p className="text-[#EFDDE2]/60 mt-1">{lastTry.reason}</p>}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Rituals, built from her reading rather than written once for everybody.
             See src/lib/rituals.ts. Each card says why it is here, because "tailored" is
             a word anybody can type over a paragraph that is not. */
          <div className="space-y-3">
            {ritualNote && (
              <div className="p-3.5 rounded-2xl bg-gold/[0.12] border border-gold/40 flex items-start gap-2.5">
                <Droplets className="w-4 h-4 text-gold shrink-0 mt-px" />
                <p className="text-[11.5px] leading-snug text-[#EFDDE2]">{ritualNote}</p>
              </div>
            )}

            {rituals.map((r) => (
              <div key={r.key} className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2 text-[#C9799B]">
                  <Flower2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wider">{r.title}</span>
                </div>
                <p className="text-[12.5px] text-[#EFDDE2] leading-relaxed">{r.body}</p>
                <p className="text-[10.5px] text-moon/50 leading-snug pt-0.5">{r.because}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Save Action */}
      <div className="relative z-10 pt-4">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSaveRules}
          className={`w-full py-3.5 px-4 rounded-full font-medium text-xs tracking-tight transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
            savedSuccess
              ? 'bg-[#B4813C] text-white'
              : 'bg-gradient-to-r from-[#A85578] to-[#43203B] text-white hover:opacity-95'
          }`}
        >
          {savedSuccess ? (
            <>
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Rules Saved for Tonight</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-[#F3DDD6]" />
              <span>That is tonight sorted</span>
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
};
