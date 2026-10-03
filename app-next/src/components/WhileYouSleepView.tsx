import React, { useState } from 'react';
import {
  SLEEP_CHIPS, SLEEP_HOW_CLOSE, SLEEP_HOW_OPEN, SLEEP_STATUS, SLEEP_STEPS,
} from '../lib/voice';
import { NightDecor } from './Decor';

export interface SleepStep {
  label: string;
  detail?: string;
  state: 'running' | 'done' | 'held';
}

/* The three steps, in her words. See src/lib/voice.ts for what they replaced and why. */
const DEFAULT_STEPS: SleepStep[] = SLEEP_STEPS.map((s) => ({
  label: s.label,
  detail: s.detail || undefined,
  state: 'done',
}));

interface WhileYouSleepViewProps {
  /* One sentence on what happened. Never a status code. */
  status?: string;
  steps?: SleepStep[];
  onSeeMorning: () => void;
}

export const WhileYouSleepView: React.FC<WhileYouSleepViewProps> = ({
  status = SLEEP_STATUS,
  steps = DEFAULT_STEPS,
  onSeeMorning,
}) => {
  const [showHow, setShowHow] = useState(false);

  return (
    <div className="absolute inset-0 flex flex-col items-center text-center bg-night text-moon px-5 pt-12 pb-6 overflow-y-auto no-scrollbar">
      {/* Aubergine, so it carries the gold fig. It was the one After Dark screen without it
          and it looked like a different app's page. */}
      <NightDecor />

      <div className="relative z-10 self-start flex items-center gap-[7px]">
        <img src="/brand/svg/oira-mark-mono-moonmilk.svg" width={22} height={22} alt="" className="block" />
        <span className="font-display text-[18px]" style={{ fontWeight: 600 }}>
          Oira<span className="italic text-rose-glow">.</span>
        </span>
      </div>

      {/* Preserved exactly: the iris ring, its emitted glow, and the passing light
          travelling through the O. */}
      <div className="relative z-10 moonwrap mt-6">
        <div className="moonseal">
          <span>O</span>
        </div>
      </div>

      <h1 className="relative z-10 font-display text-[31px] leading-tight mt-4">
        While you sleep<span className="italic text-rose-glow">.</span>
      </h1>
      <p className="relative z-10 text-[12.5px] leading-[1.55] text-moon/70 max-w-[235px] mt-2">{status}</p>

      <div className="relative z-10 flex gap-1.5 justify-center mt-3">
        <span className="text-[11px] px-3 py-1.5 rounded-full border border-gold/40 bg-gold/[0.14] text-gold font-medium">
          {SLEEP_CHIPS[0]}
        </span>
        <span className="text-[11px] px-3 py-1.5 rounded-full border border-moon/[0.16] bg-moon/[0.06] text-moon/70">
          {SLEEP_CHIPS[1]}
        </span>
      </div>

      <button
        onClick={() => setShowHow((v) => !v)}
        aria-expanded={showHow}
        className="relative z-10 mt-4 text-[11.5px] text-rose-glow/90 hover:text-rose-glow underline underline-offset-4 cursor-pointer"
      >
        {showHow ? SLEEP_HOW_CLOSE : SLEEP_HOW_OPEN}
      </button>

      {showHow && (
        <ul className="relative z-10 w-full mt-3 text-left space-y-0">
          {steps.map((s, i) => (
            <li
              key={i}
              className="flex gap-2.5 py-2 border-b border-moon/[0.10] last:border-b-0 items-start"
            >
              <span
                className={`w-[15px] h-[15px] rounded-full shrink-0 mt-0.5 border grid place-items-center text-[9px] ${
                  s.state === 'done'
                    ? 'border-[#7FB98B] bg-[#7FB98B]/25 text-[#BFE3C0]'
                    : 'border-moon/30 text-moon/50'
                }`}
                aria-hidden
              >
                {s.state === 'done' ? '✓' : ''}
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] text-moon leading-snug">{s.label}</span>
                {s.detail && (
                  <span className="block text-[10.5px] text-moon/55 mt-0.5">{s.detail}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="relative z-10 mt-auto w-full pt-6">
        <button
          onClick={onSeeMorning}
          className="w-full rounded-full bg-moon text-night py-3.5 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98]"
        >
          See the morning after
        </button>
      </div>
    </div>
  );
};
