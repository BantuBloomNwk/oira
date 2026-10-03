import React, { useEffect, useState } from 'react';
import { Fingerprint, Wallet } from 'lucide-react';
import { DOOR_COPY } from '../lib/voice';
import {
  useFingerprint, useWallet, fingerprintAvailable, walletAvailable, type Owner,
} from '../lib/identity';
import { listWallets, unavailableMessage, type WalletChoice } from '../lib/wallet';

/**
 * The two doors, at the one moment they matter.
 *
 * Shown just before her first seal, not at onboarding. A woman arrives here about her skin,
 * and asking her to pick an identity model on the way in would be asking a question she has
 * no reason to have an opinion about yet. By the time she has been read and wants it kept,
 * "lock this to me" is a sentence that explains itself.
 *
 * The hierarchy on screen is the product decision, not a layout preference. The fingerprint
 * is the button. The wallet is a line of small text underneath, because the women it is for
 * will find it and the women it is not for should never have to wonder what they are
 * declining. Nothing on this screen says crypto, key, seed or sign.
 */

interface IdentitySheetProps {
  onReady: (owner: Owner) => void;
  onSkip: () => void;
}

type Busy = null | 'fingerprint' | 'wallet';

export const IdentitySheet: React.FC<IdentitySheetProps> = ({ onReady, onSkip }) => {
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletChoice[]>([]);
  const [picking, setPicking] = useState(false);

  const canFinger = fingerprintAvailable();
  const canWallet = walletAvailable();

  /* Asked once on mount rather than on every render: listWallets() walks the Wallet Standard
     registry and registers MWA on Android the first time it runs. */
  useEffect(() => { if (canWallet) setWallets(listWallets()); }, [canWallet]);

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<Owner>) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      onReady(await fn());
    } catch (e) {
      /* Her wallet's own words where there are any, ours otherwise. A wallet refuses for real
         reasons and paraphrasing them sends her looking in the wrong place. */
      setError((e as Error)?.message || DOOR_COPY.failed);
      setBusy(null);
    }
  };

  return (
    <div className="absolute inset-0 z-[60] bg-black/45 flex items-end justify-center">
      <div className="w-full max-w-[420px] bg-paper rounded-t-3xl px-5 pt-5 pb-7">
        <h2 className="font-display text-[19px] text-ink" style={{ fontWeight: 600 }}>
          {DOOR_COPY.title}
        </h2>
        <p className="text-[12.5px] leading-[1.55] text-muted mt-1.5">{DOOR_COPY.body}</p>

        {/* Door one. The one almost everybody takes. */}
        <button
          onClick={() => run('fingerprint', useFingerprint)}
          disabled={!!busy}
          className="w-full mt-4 rounded-full py-3.5 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98] text-paper shadow-[0_8px_24px_rgba(201,121,155,.38)] flex items-center justify-center gap-2 disabled:opacity-70"
          style={{ background: 'linear-gradient(150deg, #E7A6C0, #C9799B)' }}
        >
          <Fingerprint className="w-4 h-4" />
          {busy === 'fingerprint' ? DOOR_COPY.fingerprintBusy : DOOR_COPY.fingerprint}
        </button>
        <p className="text-[11px] leading-snug text-muted/85 mt-2 text-center">
          {canFinger ? DOOR_COPY.fingerprintWhy : DOOR_COPY.noFingerprint}
        </p>

        {/* Door two. Quiet on purpose. */}
        {canWallet && (
          <div className="mt-5 pt-4 border-t border-line">
            <p className="text-[11.5px] text-muted">{DOOR_COPY.walletTitle}</p>

            {!picking ? (
              <button
                onClick={() => {
                  /* One wallet, or none listed on Android where MWA is always attemptable:
                     connect straight away rather than showing a list of one. */
                  if (wallets.length > 1) { setPicking(true); return; }
                  run('wallet', () => useWallet());
                }}
                disabled={!!busy}
                className="mt-1.5 text-[12.5px] font-medium text-mauve-deep cursor-pointer hover:underline flex items-center gap-1.5 disabled:opacity-70"
              >
                <Wallet className="w-3.5 h-3.5" />
                {busy === 'wallet' ? DOOR_COPY.walletBusy : DOOR_COPY.wallet}
              </button>
            ) : (
              <div className="mt-2">
                <p className="text-[11px] text-muted/85 mb-1.5">{DOOR_COPY.walletPick}</p>
                <div className="flex flex-wrap gap-2">
                  {wallets.map((w) => (
                    <button
                      key={w.name}
                      onClick={() => run('wallet', () => useWallet(w.name))}
                      disabled={!!busy}
                      className="flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-[12px] text-ink cursor-pointer hover:border-mauve disabled:opacity-70"
                    >
                      {w.icon && <img src={w.icon} alt="" className="w-4 h-4 rounded" />}
                      {w.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No wallet path on this device. Said plainly, because a silent missing option reads
            as something broken. unavailableMessage() is platform specific and every version
            of it ends by pointing back at the fingerprint. */}
        {!canWallet && (
          <p className="text-[11px] leading-snug text-muted/75 mt-5 pt-4 border-t border-line">
            {unavailableMessage()}
          </p>
        )}

        {error && (
          <p className="text-[11.5px] leading-snug text-ink mt-3.5 rounded-2xl bg-blush px-3.5 py-3">
            {error}
          </p>
        )}

        <button
          onClick={onSkip}
          disabled={!!busy}
          className="w-full mt-4 text-[11.5px] text-muted hover:text-ink cursor-pointer disabled:opacity-70"
        >
          {DOOR_COPY.skip}
        </button>
      </div>
    </div>
  );
};
