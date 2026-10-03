import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Info, X } from 'lucide-react';

/**
 * The tray notification.
 *
 * Checkout ended on `alert()`, which is the one piece of chrome in the app that is
 * unmistakably not ours: a grey system slab with the origin printed at the top, in the
 * middle of a moment that is supposed to feel like being handed something. It also blocks
 * the whole page and cannot be styled, so there was never a version of it that would do.
 *
 * This drops from the top of the frame the way a phone's own notifications do, on the
 * house curve, and it leaves on its own. It lives inside the phone rather than the browser
 * window: see the portal in App.tsx.
 */

export type ToastTone = 'good' | 'plain';

export interface ToastMessage {
  id: number;
  title: string;
  body?: string;
  tone?: ToastTone;
  /* A swatch, when the thing being announced has a colour. */
  swatch?: string;
  /* A figure worth reading as a figure. "Earned so far" is a number before it is a
     sentence, and the founder's call was that it arrives as a notification rather than
     sitting on the home page as another card. */
  amount?: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
  /* Milliseconds before it leaves by itself. */
  after?: number;
}

export const Toast: React.FC<ToastProps> = ({ toast, onDismiss, after = 4200 }) => {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, after);
    return () => clearTimeout(t);
  }, [toast, after, onDismiss]);

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          role="status"
          aria-live="polite"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ duration: 0.44, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-3 inset-x-3 z-[70] pointer-events-auto"
        >
          <div className="flex items-start gap-3 rounded-[20px_20px_20px_6px] bg-paper/95 backdrop-blur-md border border-line px-3.5 py-3 shadow-[0_16px_38px_rgba(67,32,59,.22)]">
            {toast.swatch ? (
              <span
                className="w-8 h-8 rounded-full shrink-0 border border-ink/10 swatch-dish-light"
                style={{ backgroundColor: toast.swatch }}
                aria-hidden
              />
            ) : (
              <span
                className={`w-8 h-8 rounded-full shrink-0 grid place-items-center ${
                  toast.tone === 'good' ? 'bg-gold/20 text-gold-deep' : 'bg-petal text-mauve-deep'
                }`}
                aria-hidden
              >
                {toast.tone === 'good' ? <Check className="w-4 h-4 stroke-[3]" /> : <Info className="w-4 h-4" />}
              </span>
            )}

            <div className="min-w-0 flex-1 leading-snug">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[12.5px] font-semibold text-ink">{toast.title}</div>
                {toast.amount && (
                  <div className="font-display text-[22px] text-ink leading-none shrink-0 tracking-tight">
                    {toast.amount}
                  </div>
                )}
              </div>
              {toast.body && <div className="text-[11.5px] text-muted mt-0.5 text-pretty">{toast.body}</div>}
            </div>

            <button
              onClick={onDismiss}
              aria-label="Dismiss"
              className="w-6 h-6 rounded-full grid place-items-center text-muted hover:text-ink hover:bg-petal shrink-0 cursor-pointer transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
