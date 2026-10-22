import React, { useState } from 'react';
import { Fingerprint } from 'lucide-react';
import type { Owner } from '../lib/owner';
import { migrateToPasskey, type Step } from '../lib/migrate';

/**
 * Moving her Palette from this phone's own key to a passkey.
 *
 * Offered only to women who sealed before the app could make passkeys. Their Palette is tied to a
 * key that lives on this phone alone, so losing the phone loses it. Said plainly, with what
 * happens and what doesn't, and each step shown as it finishes.
 */

interface MoveSheetProps {
  rules: { minPayout: number; maxPerBrand: number } | null;
  onDone: (owner: Owner) => void;
  onClose: () => void;
}

const STEPS: Array<{ id: Step; label: string }> = [
  { id: 'passkey', label: 'Making your passkey' },
  { id: 'sealed', label: 'Sealing your reading to it' },
  { id: 'moved', label: 'Bringing your money across' },
  { id: 'rules', label: 'Putting your rules on it' },
  { id: 'retired', label: 'Closing the old one' },
];

export const MoveSheet: React.FC<MoveSheetProps> = ({ rules, onDone, onClose }) => {
  const [reached, setReached] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await migrateToPasskey({ rules, onStep: (s) => setReached((r) => (r.includes(s) ? r : [...r, s])) });
      setDone(true);
      onDone(next);
    } catch (e) {
      setError((e as Error)?.message || "That didn't finish. Nothing's lost; tap again and I'll carry on from where it stopped.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[60] bg-black/45 flex items-end justify-center">
      <div className="w-full max-w-[420px] bg-paper rounded-t-3xl px-5 pt-5 pb-7">
        <h2 className="font-display text-[19px] text-ink" style={{ fontWeight: 600 }}>
          {done ? 'All moved, love' : 'Take your Palette with you'}
        </h2>
        {!done ? (
          <p className="text-[12.5px] leading-[1.55] text-muted mt-1.5">
            Right now your Palette lives on this phone's own key, so if you lose the phone, it's gone.
            Move it to a passkey and your fingerprint brings it back on any phone. It takes about a
            minute, needs no new scan, and your money and rules come with you. Oira pays the fees.
          </p>
        ) : (
          <p className="text-[12.5px] leading-[1.55] text-muted mt-1.5">
            Your Palette, your money and your rules now follow your fingerprint. Brands will ask the
            new one from now on.
          </p>
        )}

        {(busy || reached.length > 0) && (
          <ul className="mt-4 space-y-1.5">
            {STEPS.map((s) => (
              <li key={s.id} className={`text-[12.5px] flex items-center gap-2 ${reached.includes(s.id) ? 'text-ink' : 'text-muted/70'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${reached.includes(s.id) ? 'bg-[#C9799B]' : 'bg-[#E6CFD6]'}`} />
                {s.label}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-[12px] text-[#A85578] leading-snug mt-3">{error}</p>}

        {!done ? (
          <>
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="w-full mt-4 rounded-full py-3.5 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98] text-paper shadow-[0_8px_24px_rgba(201,121,155,.38)] flex items-center justify-center gap-2 disabled:opacity-70"
              style={{ background: 'linear-gradient(150deg, #E7A6C0, #C9799B)' }}
            >
              <Fingerprint className="w-4 h-4" />
              {busy ? 'Moving...' : error ? 'Carry on' : 'Move it with my fingerprint'}
            </button>
            <button type="button" onClick={onClose} disabled={busy} className="w-full mt-2 py-2.5 text-[12.5px] text-muted cursor-pointer disabled:opacity-50">
              Not now
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose} className="w-full mt-4 rounded-full bg-ink text-paper py-3 text-[13px] font-semibold cursor-pointer active:scale-[0.98]">
            Lovely
          </button>
        )}
      </div>
    </div>
  );
};
