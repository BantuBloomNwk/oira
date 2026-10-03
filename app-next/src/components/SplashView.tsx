import React, { useMemo } from 'react';
import { GoldenFigBranch } from './GoldenFigBranch';

const SEEN_KEY = 'oira_splash';

/* Has she been here before? Wrapped, because a private window or a browser set to block
   site data throws on the read rather than returning null, and a splash is not worth an
   exception. */
export function splashSeen(): boolean {
  try {
    return !!localStorage.getItem(SEEN_KEY);
  } catch {
    return false;
  }
}

function markSplashSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* nothing to do: she just sees it again next time, which is survivable */
  }
}

const KINDS = ['', 'g', 'l'] as const;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const drift = () => `${rand(-58, 58).toFixed(0)}px`;

/* Fifteen petals, sparse and slow. Presence, not confetti. Ported from
   seedSplashPetals() in app/index.html. */
function seedPetals() {
  return Array.from({ length: 15 }, () => {
    const w = rand(8, 18);
    const dur = rand(7, 13);
    return {
      cls: KINDS[Math.floor(Math.random() * KINDS.length)],
      left: `${rand(2, 94).toFixed(1)}%`,
      width: `${w.toFixed(0)}px`,
      height: `${(w * rand(1.2, 1.45)).toFixed(0)}px`,
      blur: Math.random() < 0.35 ? `blur(${rand(0.6, 1.6).toFixed(1)}px)` : undefined,
      style: {
        '--o': rand(0.32, 0.6).toFixed(2),
        '--sx1': drift(), '--sx2': drift(), '--sx3': drift(), '--sx4': drift(),
        '--rot': `${rand(210, 440).toFixed(0)}deg`,
        animationDuration: `${dur.toFixed(1)}s`,
        animationDelay: `${(-rand(0, dur)).toFixed(1)}s`,
      } as React.CSSProperties,
    };
  });
}

interface SplashViewProps {
  onEnter: () => void;
}

/* The first thing she ever sees. Preserved from app/index.html rather than redrawn: the
   real animated Passing Light mark, the wordmark with the gloss travelling through its
   petal dot, and the drift behind it. */
export const SplashView: React.FC<SplashViewProps> = ({ onEnter }) => {
  const petals = useMemo(seedPetals, []);

  return (
    <div className="absolute inset-0 z-[60] splash-ground flex items-center justify-center text-center px-7 py-10 overflow-hidden">
      {/* The gold fig, quietly, at both far corners. Every aubergine surface in the app
          carries it; the splash was the first screen she ever sees and it was the one that
          did not, so the motif arrived a page late. Held well back of the mark, which is
          the only thing on this screen that is allowed to be loud. */}
      <GoldenFigBranch className="-top-12 -right-16 w-72 h-52 opacity-40" />
      <GoldenFigBranch className="-bottom-20 -left-20 w-72 h-56 opacity-25 transform -rotate-45 scale-90" />

      <div className="spetals" aria-hidden>
        {petals.map((p, i) => (
          <span
            key={i}
            className={`spetal ${p.cls}`}
            style={{ ...p.style, left: p.left, width: p.width, height: p.height, filter: p.blur }}
          />
        ))}
      </div>

      <div className="splashInner relative z-[2] flex flex-col items-center max-w-[300px]">
        <img
          className="plmark"
          src="/brand/svg/oira-mark-passing-light-animated.svg"
          alt="Oira"
          width={168}
          height={168}
        />
        <div className="swordmark">
          Oira<i className="pdot" />
        </div>
        <h1 className="shead">Your colour is yours alone.</h1>
        <p className="sbody">
          The way light falls on your skin. The shades that make you feel most like yourself. It
          stays sealed here, seen by no one unless you say so. It is all yours.
        </p>
        <button
          className="sbtn"
          onClick={() => {
            markSplashSeen();
            onEnter();
          }}
        >
          Come in
        </button>
      </div>
    </div>
  );
};
