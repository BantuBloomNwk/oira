import React, { useState } from 'react';

/**
 * One question before the first reading: is she 18 or over?
 *
 * It comes before the camera and before her sign-in, so nothing about her is read or created
 * until she says yes. A "not yet" is answered kindly and goes no further.
 */

interface AgeSheetProps {
  onYes: () => void;
  onClose: () => void;
}

export const AgeSheet: React.FC<AgeSheetProps> = ({ onYes, onClose }) => {
  const [tooYoung, setTooYoung] = useState(false);

  return (
    <div className="absolute inset-0 z-[60] bg-black/45 flex items-end justify-center">
      <div className="w-full max-w-[420px] bg-paper rounded-t-3xl px-5 pt-5 pb-7">
        {!tooYoung ? (
          <>
            <h2 className="font-display text-[19px] text-ink" style={{ fontWeight: 600 }}>
              Quick one before we start
            </h2>
            <p className="text-[12.5px] leading-[1.55] text-muted mt-1.5">
              Oira's for grown-ups, because brands can pay you through it. Are you 18 or over?
            </p>
            <button
              type="button"
              onClick={onYes}
              className="w-full mt-4 rounded-full py-3.5 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98] text-paper shadow-[0_8px_24px_rgba(201,121,155,.38)]"
              style={{ background: 'linear-gradient(150deg, #E7A6C0, #C9799B)' }}
            >
              Yes, I'm 18 or over
            </button>
            <button
              type="button"
              onClick={() => setTooYoung(true)}
              className="w-full mt-2 py-2.5 text-[12.5px] text-muted cursor-pointer"
            >
              Not yet
            </button>
          </>
        ) : (
          <>
            <h2 className="font-display text-[19px] text-ink" style={{ fontWeight: 600 }}>
              Then we'll wait for you
            </h2>
            <p className="text-[12.5px] leading-[1.55] text-muted mt-1.5">
              Oira's only for 18 and over, love. Come back when you're 18 and we'll find your
              colours together. Nothing about you was read or saved.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full mt-4 rounded-full bg-ink text-paper py-3 text-[13px] font-semibold cursor-pointer active:scale-[0.98]"
            >
              Okay
            </button>
          </>
        )}
      </div>
    </div>
  );
};
