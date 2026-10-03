import { whenSealed, type Proof } from '../lib/proof';
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Eye, Lock, ShieldCheck, X } from 'lucide-react';

interface PrivacySheetProps {
  isOpen: boolean;
  onClose: () => void;
  /* How many questions have been answered for her. Nothing about what they were. */
  answered: number;
  proof: Proof | null;
}

/**
 * Your privacy, proven.
 *
 * This is its own surface, not a row that opens the brand board. Both it and "earned so
 * far" used to land on the same board, which made the drawer look like it had two entries
 * for one thing; they are different questions and one of them is the question the whole
 * product rests on. Patterned on the psheet in app/index.html, which answers it the right
 * way round: not "trust us", but here is the entire public record, read it yourself.
 *
 * The honesty problem this build has, and the reason the last block exists: the shipping
 * app reads the real account off Solana and shows her what came back. This one is not wired
 * to a chain yet. Showing her a green tick and the words "verified live" over a simulation
 * would be the single worst thing in the app, because it would be lying about the one thing
 * she is being asked to take on faith. So the shape is here, the mechanism is named, and the
 * fact that it is not yet reading a real ledger is the first thing on the screen rather than
 * a footnote at the bottom.
 */
export const PrivacySheet: React.FC<PrivacySheetProps> = ({ isOpen, onClose, answered, proof }) => (
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
          aria-label="Your privacy, proven"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-blush rounded-t-[28px] border-t border-line shadow-[0_-18px_44px_rgba(67,32,59,.28)] max-h-[86%] overflow-y-auto no-scrollbar"
        >
          <div className="sticky top-0 bg-blush/95 backdrop-blur-sm px-5 pt-4 pb-3 flex items-start gap-3 border-b border-line/70">
            <span className="w-9 h-9 rounded-full grid place-items-center bg-[#7FB98B]/20 text-[#4F9E7A] shrink-0">
              <ShieldCheck className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[18px] text-ink leading-tight">Your privacy, proven</div>
              <div className="text-[11px] text-muted mt-0.5">
                {answered} {answered === 1 ? 'question answered' : 'questions answered'}, none of them about you
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

          <div className="px-5 py-4 space-y-4 pb-8">
            <div className="rounded-[16px_16px_16px_5px] bg-gold/[0.12] border border-gold/40 px-3.5 py-3">
              <div className="eyebrow text-gold-deep">Read this first</div>
              <p className="text-[12px] leading-[1.6] text-ink mt-1">
                {proof ? (
                  <>
                    {proof.at ? `Your colours were sealed ${whenSealed(proof.at)}.` : 'Your colours are sealed.'} Everything below is all
                    the world can see about you, and you can check it yourself.{' '}
                    <a href={proof.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-mauve-deep">
                      See the proof
                    </a>
                  </>
                ) : (
                  <>
                    You haven't sealed your colours yet. When you do, this is exactly what the
                    world will be able to see about you, and nothing more.
                  </>
                )}
              </p>
            </div>

            <p className="text-[12.5px] leading-[1.65] text-ink">
              Your colours get sealed into a public record that nobody can edit, us included.
              Here is everything the whole world would be able to see about you, and
              everything that stays only yours.
            </p>

            <section>
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-muted" />
                <h3 className="text-[12.5px] font-semibold text-ink">What anyone can see</h3>
              </div>
              <ul className="space-y-2">
                <li className="rounded-[16px_16px_16px_5px] bg-paper border border-line px-3.5 py-2.5">
                  <div className="text-[12px] text-ink">A scrambled blob</div>
                  <div className="text-[10.5px] text-muted mt-0.5">
                    Encrypted bytes that nobody can unscramble, including us.
                  </div>
                </li>
                <li className="rounded-[16px_16px_16px_5px] bg-paper border border-line px-3.5 py-2.5">
                  <div className="text-[12px] text-ink">A one-way fingerprint</div>
                  <div className="text-[10.5px] text-muted mt-0.5">
                    A mark that can never be turned back into your colours.
                  </div>
                </li>
                <li className="rounded-[16px_16px_16px_5px] bg-paper border border-line px-3.5 py-2.5">
                  <div className="text-[12px] text-ink">That is the whole record.</div>
                </li>
              </ul>
            </section>

            <section>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-[#4F9E7A]" />
                <h3 className="text-[12.5px] font-semibold text-ink">What stays only yours</h3>
              </div>
              <ul className="space-y-1.5">
                {[
                  'Your face, and every photograph of it',
                  'Your season, your undertone and your shade',
                  'Your key, which only this phone holds',
                  "Each brand's yes or no, and which brand asked",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2.5 px-1">
                    <Lock className="w-3.5 h-3.5 text-[#4F9E7A] shrink-0 mt-0.5" />
                    <span className="text-[12px] leading-snug text-ink">{line}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11.5px] leading-snug text-[#4F9E7A] font-medium mt-2.5 px-1">
                None of it ever touches the public record.
              </p>
            </section>

            <p className="text-[10.5px] leading-snug text-muted">
              A brand asking whether a shade suits you learns one word, yes or no. It does not
              learn your shade, your season, your name or that you exist. That is the whole
              trade, and it is the only one on offer.
            </p>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);
