import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Cpu, Trash2, TriangleAlert, X } from 'lucide-react';
import {
  APPROX_BYTES, connection, DownloadFailed, downloadModel, forgetModel, gigabytes, modelState,
  type FailureKind, type ModelState, type Progress,
} from '../lib/localModel';

interface OnDeviceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onDone: (msg: { title: string; body: string; tone?: 'good' | 'plain' }) => void;
}

/**
 * Bringing Oira's brain onto the phone.
 *
 * Everything on this screen exists because the download is three gigabytes. The number is
 * the first thing she reads, not a footnote: an app that asks a woman on a data bundle for
 * three gigabytes without saying so has stolen from her, however good the feature is.
 *
 * The refusal built into it: there is no automatic path. This screen cannot be reached
 * except by opening it, and the download cannot start except by tapping the button that has
 * the size printed on it.
 */
export const OnDeviceSheet: React.FC<OnDeviceSheetProps> = ({ isOpen, onClose, onDone }) => {
  const [state, setState] = useState<ModelState>('unsupported');
  const [progress, setProgress] = useState<Progress | null>(null);
  /* Why it stopped, when it stopped for a reason that is not her tapping Stop. A three
     gigabyte download that vanishes back to a button teaches her the app is broken. */
  const [failed, setFailed] = useState<FailureKind | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const net = connection();

  useEffect(() => {
    if (!isOpen) return;
    let live = true;
    modelState().then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, [isOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const start = async () => {
    setState('downloading');
    setFailed(null);
    setProgress({ received: 0, total: APPROX_BYTES });
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await downloadModel(setProgress, ctrl.signal);
      setState('ready');
      onDone({
        tone: 'good',
        title: 'She is on your phone now',
        body: 'Ask Oira thinks here from now on. What you ask her stays on this phone, even when you have signal.',
      });
    } catch (e) {
      const kind = e instanceof DownloadFailed ? e.kind : 'network';
      setFailed(kind === 'aborted' ? null : kind);
      setState('absent');
      setProgress(null);
    } finally {
      abortRef.current = null;
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setFailed(null);
    setState('absent');
    setProgress(null);
  };

  const remove = async () => {
    await forgetModel();
    setState('absent');
    onDone({ title: 'Removed', body: 'You got the space back. She still answers, just not from here.' });
  };

  const pct = progress && progress.total ? Math.min(100, (progress.received / progress.total) * 100) : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="absolute inset-0 z-[66] flex flex-col justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 bg-night/45 backdrop-blur-[2px] cursor-pointer"
          />

          <motion.div
            role="dialog"
            aria-label="Oira on your phone"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            className="relative bg-blush rounded-t-[28px] border-t border-line shadow-[0_-18px_44px_rgba(67,32,59,.28)] max-h-[86%] overflow-y-auto no-scrollbar px-5 pt-4 pb-7"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="w-9 h-9 rounded-full grid place-items-center bg-petal text-mauve-deep shrink-0">
                  <Cpu className="w-4.5 h-4.5" />
                </span>
                <div className="min-w-0">
                  <div className="font-display text-[19px] text-ink leading-tight">Oira on your phone</div>
                  <div className="text-[11px] text-muted mt-0.5">
                    Your questions stop leaving too
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="w-8 h-8 rounded-full grid place-items-center bg-paper border border-line text-muted cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* This paragraph is the only place in the app that admits an exception to the
                promise, so it has to be exact about WHICH thing it is talking about.
                Two earlier drafts were not. "She only ever gets your season" left "she"
                ambiguous when Oira is "she" on every other screen, and "so nothing does"
                claimed more than the download delivers: sealing still goes out afterwards,
                and only her questions stop leaving. A privacy claim that is slightly too
                broad is worse than one that is slightly too narrow. */}
            <p className="text-[12.5px] leading-[1.65] text-ink">
              Your face has never left this phone and never will, whatever you do here. This is
              about a different thing: your <em>questions</em>. When you ask me something I
              cannot work out on my own, the question goes to a stronger AI model on my server,
              along with your season and your undertone. Never your face, never your photo, but
              the question does leave.
            </p>
            <p className="text-[12.5px] leading-[1.65] text-ink mt-2.5">
              Install the model below and I do that thinking here instead, so your questions
              stop leaving too. Sealing is separate and does not change: it still goes out when
              you seal, but it goes out sealed. What lands on the ledger is a scrambled number
              that cannot be turned back into you, never your reading itself.
            </p>

            {state === 'unsupported' && (
              <div className="mt-4 rounded-[16px_16px_16px_5px] bg-paper border border-line px-3.5 py-3">
                <div className="text-[12.5px] font-medium text-ink">Not this phone, love</div>
                <p className="text-[11.5px] leading-snug text-muted mt-1">
                  Her brain needs a graphics feature this browser does not have yet. Nothing
                  is wrong with your phone and nothing is missing from the app. Everything
                  else works exactly the same.
                </p>
              </div>
            )}

            {state === 'unhosted' && (
              <div className="mt-4 rounded-[16px_16px_16px_5px] bg-gold/[0.12] border border-gold/40 px-3.5 py-3">
                <div className="text-[12.5px] font-medium text-ink">Not ready yet</div>
                <p className="text-[11.5px] leading-snug text-muted mt-1">
                  Your phone can do this. We have not finished putting it somewhere you can
                  download it from. Check back.
                </p>
              </div>
            )}

            {state === 'absent' && (
              <>
                {/* What went wrong last time, if anything did. Named, because "it stopped"
                    and "your phone is full" ask for completely different things from her. */}
                {failed && (
                  <div className="mt-4 flex items-start gap-2.5 rounded-[16px_16px_16px_5px] bg-mauve/[0.10] border border-mauve/30 px-3.5 py-3">
                    <TriangleAlert className="w-4 h-4 text-mauve-deep shrink-0 mt-px" />
                    <div>
                      <div className="text-[12.5px] font-medium text-ink">
                        {failed === 'space' ? 'Your phone ran out of room' : 'That did not finish'}
                      </div>
                      <p className="text-[11.5px] leading-snug text-muted mt-0.5">
                        {failed === 'space'
                          ? 'She needs about three gigabytes free. Clear some space and try again, and nothing you already have is lost.'
                          : 'The connection went before it was done. Nothing was saved and nothing was charged twice; try again when the signal is steady.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* The number, before the button. */}
                <div className="mt-4 rounded-[16px_16px_16px_5px] bg-paper border border-line px-3.5 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[12.5px] font-medium text-ink">One download</span>
                    <span className="font-display text-[24px] text-ink leading-none">
                      {gigabytes(APPROX_BYTES)}
                    </span>
                  </div>
                  <p className="text-[11.5px] leading-snug text-muted mt-1.5">
                    That is a lot, and it is once. After it lands she works with no signal at
                    all, and a new version of the app will not make you fetch it again.
                  </p>
                </div>

                {(net.metered === true || net.saveData) && (
                  <div className="mt-2.5 flex items-start gap-2.5 rounded-[16px_16px_16px_5px] bg-mauve/[0.10] border border-mauve/30 px-3.5 py-3">
                    <TriangleAlert className="w-4 h-4 text-mauve-deep shrink-0 mt-px" />
                    <p className="text-[11.5px] leading-snug text-ink">
                      {net.saveData
                        ? 'Your phone is trying to save you data right now. I would wait for wifi.'
                        : 'You are on mobile data. Three gigabytes of a bundle is real money. Wait for wifi if you can.'}
                    </p>
                  </div>
                )}

                {net.metered === null && (
                  <p className="mt-2.5 text-[11px] leading-snug text-muted px-1">
                    I cannot tell whether you are on wifi from in here. If you are on data,
                    this is not the moment.
                  </p>
                )}

                <button
                  onClick={start}
                  className="w-full mt-4 rounded-full bg-ink text-paper py-3.5 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98]"
                >
                  {failed ? 'Try again' : `Download her, ${gigabytes(APPROX_BYTES)}`}
                </button>
                <button
                  onClick={onClose}
                  className="w-full mt-2 text-[11.5px] text-muted hover:text-ink cursor-pointer py-1"
                >
                  Not now
                </button>
              </>
            )}

            {state === 'downloading' && (
              <div className="mt-4">
                <div className="flex items-baseline justify-between text-[12px] mb-1.5">
                  <span className="text-ink font-medium">Coming down</span>
                  <span className="font-mono text-muted">
                    {gigabytes(progress?.received ?? 0)} of {gigabytes(progress?.total ?? APPROX_BYTES)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-line overflow-hidden">
                  <div
                    className="h-full bg-mauve transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[11px] leading-snug text-muted mt-2">
                  You can leave this screen, but keep the app open. If you stop it, nothing is
                  wasted next time; it picks up from a fresh start.
                </p>
                <button
                  onClick={stop}
                  className="w-full mt-3 rounded-full bg-paper border border-line text-ink py-3 text-[12.5px] font-medium cursor-pointer"
                >
                  Stop
                </button>
              </div>
            )}

            {state === 'ready' && (
              <>
                <div className="mt-4 flex items-start gap-2.5 rounded-[16px_16px_16px_5px] bg-[#7FB98B]/[0.14] border border-[#7FB98B]/40 px-3.5 py-3">
                  <Check className="w-4 h-4 text-[#4F9E7A] shrink-0 mt-px stroke-[3]" />
                  <div>
                    <div className="text-[12.5px] font-medium text-ink">She is here</div>
                    <p className="text-[11.5px] leading-snug text-muted mt-0.5">
                      Ask Oira thinks on this phone now. The green dot beside her answers means
                      it came from here and went nowhere.
                    </p>
                  </div>
                </div>
                <button
                  onClick={remove}
                  className="w-full mt-3.5 rounded-full bg-paper border border-line text-muted hover:text-ink py-3 text-[12.5px] font-medium cursor-pointer flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove her and get the space back
                </button>
              </>
            )}

            <p className="text-[10.5px] leading-snug text-muted/85 mt-4">
              Either way she answers. With this she answers from here; without it, from a
              service that is only ever told your season and your undertone.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
