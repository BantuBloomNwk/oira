import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Share2, Copy, Check, Sparkles, ShieldCheck, Heart } from 'lucide-react';
import confetti from 'canvas-confetti';
import { UserProfile, SeasonPalette } from '../types';
import { canvasToFile, renderSeasonCard, shareLink } from '../lib/seasonCard';

interface ShareCardModalProps {
  profile: UserProfile;
  season: SeasonPalette;
  onClose: () => void;
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({
  profile,
  season,
  onClose,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const link = shareLink(profile);
  /* Whether this phone can hand a FILE to the share sheet. Android Chrome and iOS Safari
     both can; a desktop browser mostly cannot, and gets the download instead. */
  const canShareFile =
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    typeof navigator.share === 'function';

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#C9799B', '#A85578', '#B49BE0', '#D6A756', '#F3DDD6'],
    });
  };

  React.useEffect(() => {
    triggerConfetti();
  }, []);

  const handleCopyLink = () => {
    /* Her link, with her referral on it. It used to copy window.location.href, which on a
       draft deploy is a build hash nobody else can use. */
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    triggerConfetti();
    setTimeout(() => setCopiedLink(false), 2500);
  };

  /* One button, two outcomes, decided by what the phone can do rather than by asking her.
     If the share sheet takes files, the card goes straight into whatever she posts in. If
     it does not, it lands in her photos and the link goes on the clipboard, which is the
     same job in two steps. */
  const handleShare = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const canvas = await renderSeasonCard({ profile, season, link });
      const file = await canvasToFile(
        canvas,
        `${season.name.toLowerCase().replace(/\s+/g, '-')}-oira.png`
      );

      if (canShareFile && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: `${season.name}. Found my colours on Oira. ${link}`,
        });
        triggerConfetti();
        return;
      }

      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
      try { await navigator.clipboard.writeText(link); } catch { /* clipboard is optional */ }
      setSaved(true);
      triggerConfetti();
      setTimeout(() => setSaved(false), 2800);
    } catch {
      /* An aborted share sheet throws. She cancelled; that is not an error worth showing. */
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="absolute inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs overflow-y-auto no-scrollbar">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          className="relative w-full max-w-[390px] max-h-[92%] bg-[#FBF3EE] rounded-[28px] p-5 shadow-2xl border border-[#F3DDD6] my-auto flex flex-col overflow-y-auto no-scrollbar"
        >
          {/* Close button */}
          <button
            id="close-share-modal-btn"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/80 hover:bg-white text-[#43203B] shadow-xs transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="text-center mb-5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#F3DDD6] text-[#43203B] mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[#C9799B]" />
              Official Seasonal Card
            </span>
            <h3 className="font-display text-[28px] sm:text-[32px] font-normal text-[#1B1120] leading-tight">
              Share Your Season
            </h3>
            <p className="text-xs text-[#8A6580] max-w-sm mx-auto mt-1">
              Your sealed color analysis card is ready to export, share on Instagram stories, or save to your camera roll.
            </p>
          </div>

          {/* High-Fidelity Season Card Preview matching the screenshot aesthetic */}
          <div
            ref={cardRef}
            className="bg-white rounded-[26px] p-6 luxury-card-shadow border border-[#F3DDD6] text-left relative overflow-hidden"
          >
            {/* Background subtle watermark */}
            <div className="absolute -right-8 -bottom-8 w-40 h-40 rounded-full bg-[#FBF3EE] -z-0 pointer-events-none opacity-60" />

            <div className="relative z-10">
              {/* Header inside card */}
              <div className="flex items-center justify-between pb-3 border-b border-[#F3E9E4]">
                <div className="flex items-center gap-2.5">
                  {/* Her picture is hers, so it can be empty, and the preview has to cope
                      with that rather than render a broken image. */}
                  {profile.avatarUrl ? (
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover border border-white shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-[#F3DDD6] border border-white shadow-xs grid place-items-center font-display text-[17px] text-[#A85578]">
                      {(profile.name || 'o').slice(0, 1).toLowerCase()}
                    </span>
                  )}
                  <div>
                    <h4 className="font-bold text-xs text-[#1B1120]">{profile.name || 'Your palette'}</h4>
                    {/* The seal code used to sit here, on the preview of an image built to be
                        posted publicly. It is the address of her palette account. An app that
                        promises nothing about her is public should not be the thing that
                        publishes it. */}
                    <span className="text-[10px] text-[#8A6580]">{season.tagline}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-[11px] font-medium text-[#A85578] bg-[#F3E9E4] px-2 py-0.5 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Sealed</span>
                </div>
              </div>

              {/* Season Main Section */}
              <div className="mt-4">
                <span className="text-xs text-[#8A6580] block font-normal">Your season</span>
                <h2 className="font-display text-[32px] font-normal text-[#1B1120] tracking-tight mt-0.5">
                  {season.name}
                </h2>
              </div>

              {/* Swatch Discs */}
              <div className="mt-4 mb-4 flex items-center justify-between gap-1.5">
                {season.swatches.map((swatch) => {
                  const isLight = swatch.hex.toLowerCase().includes('#f') || swatch.hex.toLowerCase().includes('#e');
                  return (
                    <div
                      key={swatch.id}
                      className="aspect-square flex-1 max-w-[48px]"
                      title={swatch.name}
                    >
                      <div
                        className={`w-full h-full rounded-full p-[2px] ${
                          isLight ? 'swatch-dish-light border border-[#F3DDD6]' : 'swatch-dish border border-black/10'
                        }`}
                        style={{ backgroundColor: swatch.hex }}
                      >
                        <div
                          className="w-full h-full rounded-full relative overflow-hidden"
                          style={{ backgroundColor: swatch.hex }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/25 rounded-full" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Attributes */}
              <div className="flex items-center gap-5 text-xs text-[#43203B] font-medium pt-1">
                <div>
                  <span className="text-[#8A6580]">Undertone: </span>
                  <span className="font-semibold text-[#1B1120]">{season.undertone}</span>
                </div>
                <div>
                  <span className="text-[#8A6580]">Depth: </span>
                  <span className="font-semibold text-[#1B1120]">{season.depth}</span>
                </div>
                <div>
                  <span className="text-[#8A6580]">Contrast: </span>
                  <span className="font-semibold text-[#1B1120]">{season.contrast}</span>
                </div>
              </div>
            </div>
          </div>

          {/* One primary action, because there is one thing she came here to do.
              Download and copy were side by side as equals, which made a share sheet the
              thing she never found. */}
          <div className="mt-6 space-y-2.5">
            <button
              id="share-card-btn"
              onClick={handleShare}
              disabled={busy}
              className="w-full py-3.5 px-4 bg-[#43203B] text-white font-medium text-[13px] rounded-full shadow-[0_10px_24px_rgba(67,32,59,.22)] transition-transform active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {busy ? (
                <span>Making your card…</span>
              ) : saved ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Saved to your photos, link copied</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>{canShareFile ? 'Share my season' : 'Save my card'}</span>
                </>
              )}
            </button>

            <button
              id="copy-share-link-btn"
              onClick={handleCopyLink}
              className="w-full py-2.5 px-4 bg-white hover:bg-[#FFFBF7] text-[#43203B] border border-[#F3DDD6] font-medium text-xs rounded-full transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Just the link</span>
                </>
              )}
            </button>

            <p className="text-[10.5px] leading-snug text-[#8A6580] text-center px-2">
              The card carries your season and your shades. It never carries your seal code,
              your reading or your face.
            </p>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
