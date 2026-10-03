import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Heart, ArrowLeft, X, Sparkles } from 'lucide-react';
import { colorWheelSegments } from '../data/paletteData';
import { SeasonPalette } from '../types';
import { hexToLab, matchShade } from '../lib/match';

interface ColorWheelViewProps {
  activeSeason: SeasonPalette;
  onBackToHome: () => void;
  onSaveSwatch?: (hex: string, name: string) => void;
}

// Convert HSL to Hex
function hslToHex(h: number, s: number, l: number): string {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
}

/* What to call the hue she has landed on, so the sheet can name it rather than print a
   number at her. Boundaries are the ordinary ones; nothing clever. */
function hueFamily(h: number): string {
  const d = ((h % 360) + 360) % 360;
  if (d < 12 || d >= 345) return 'red';
  if (d < 26) return 'scarlet';
  if (d < 42) return 'orange';
  if (d < 62) return 'gold';
  if (d < 78) return 'yellow';
  if (d < 100) return 'lime';
  if (d < 150) return 'green';
  if (d < 175) return 'emerald';
  if (d < 195) return 'teal';
  if (d < 220) return 'cyan blue';
  if (d < 250) return 'blue';
  if (d < 275) return 'indigo';
  if (d < 300) return 'violet';
  if (d < 325) return 'magenta';
  return 'fuchsia';
}

/* Where a shade belongs on her, from what the shade actually is. A deep saturated colour
   is a statement piece; a pale muted one is something worn near the face all day. */
function wearAs(h: number, s: number, l: number): string {
  const warmLip = (h < 30 || h > 320) && s > 45;
  if (warmLip && l < 48) return 'A lip. This is the one you put on when you want to be looked at.';
  if (warmLip) return 'A blush or a soft lip. Sheer it out and it will not wear you.';
  if (s < 30) return 'A knit, a scarf, anything that sits against your jaw all day.';
  if (l < 35) return 'A coat, a base, the thing everything else is worn over.';
  if (h > 150 && h < 260) return 'An eye, or a silk at the neck. It lifts the whites of your eyes.';
  return 'A wardrobe colour before a makeup one. Try it away from the face first.';
}

export const ColorWheelView: React.FC<ColorWheelViewProps> = ({
  activeSeason,
  onBackToHome,
  onSaveSwatch,
}) => {
  const [hue, setHue] = useState<number>(348); // crimson ruby default
  const [saturation, setSaturation] = useState<number>(85);
  const [lightness] = useState<number>(42);
  const [selectedSegmentIdx, setSelectedSegmentIdx] = useState<number>(0);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const currentHex = useMemo(() => hslToHex(hue, saturation, lightness), [hue, saturation, lightness]);

  /* The verdict comes from src/lib/match.ts, the same function the marketplace scores every
     product with. It used to be a second, softer rule set living only in this file, so the
     wheel could call a shade a signature that the shelf two screens up had already called
     not hers. One scorer, one answer, wherever she meets a colour. */
  const match = useMemo(() => matchShade(currentHex, activeSeason), [currentHex, activeSeason]);

  const statusText =
    match.verdict === 'yours'
      ? `${activeSeason.name} signature`
      : match.verdict === 'workable'
      ? 'Wearable, with care'
      : 'Fights your colouring';

  /* The long form. Everything she would want if she tapped through, written out rather
     than clipped to one line she can only see the front of. */
  const detail = useMemo(() => {
    const lab = hexToLab(currentHex);
    const chroma = Math.round(Math.hypot(lab.a, lab.b));
    const family = hueFamily(hue);
    /* The reason follows the verdict rather than running its own test. An earlier draft had
       a second heuristic here and it printed "this red leans the way you lean" over a forty
       eight percent score, which is the app arguing with itself in front of her. */
    const season = `${activeSeason.undertone.toLowerCase()} and ${activeSeason.depth.toLowerCase()}`;
    const why =
      match.verdict === 'yours'
        ? `This ${family} leans the way you lean. Your season is ${season}, and at ${saturation} percent it holds enough pigment to meet you rather than sit flat next to you.`
        : match.verdict === 'workable'
        ? `Your season is ${season}. This ${family} is not quite in it, but it is close enough that you will get away with it if you love it. Keep it away from your jaw and it will behave.`
        : `Your season is ${season}. This ${family} pulls the other way, and at ${saturation} percent there is plenty of it to show. Nothing here is a rule, but you will find it takes more from your face than it gives back.`;

    return {
      family,
      chroma,
      why,
      wear: wearAs(hue, saturation, lightness),
      nearest: match.nearest,
      nearestHex: match.nearestHex,
      metals: activeSeason.bestMetals.slice(0, 3).join(', '),
      careful: activeSeason.worstColors.slice(0, 3).join(', '),
    };
  }, [currentHex, hue, saturation, lightness, activeSeason, match]);

  const handleSelectSegment = (idx: number) => {
    setSelectedSegmentIdx(idx);
    const seg = colorWheelSegments[idx];
    setHue(seg.hue);
    setSaturation(seg.sat);
  };

  const handleSave = () => {
    if (onSaveSwatch) onSaveSwatch(currentHex, `${activeSeason.name} Match`);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2200);
  };

  /* Escape closes the sheet, the way every sheet she has used does. */
  useEffect(() => {
    if (!detailsOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDetailsOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailsOpen]);

  /* The live hue ring. Twelve stops of her current saturation and lightness, so the outer
     ring is not decoration: it shows what both sliders are doing at once, and the bead on
     it is where she is standing. */
  const hueRing = useMemo(() => {
    const stops = Array.from({ length: 13 }, (_, i) => {
      const h = (i * 30) % 360;
      return `${hslToHex(h, saturation, lightness)} ${((i / 12) * 100).toFixed(2)}%`;
    });
    return `conic-gradient(from 0deg, ${stops.join(', ')})`;
  }, [saturation, lightness]);

  const sheet = detailsOpen && (
    <AnimatePresence>
      <motion.div
        key="sheet"
        className="absolute inset-0 z-[60] flex flex-col justify-end"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      >
        <button
          aria-label="Close details"
          onClick={() => setDetailsOpen(false)}
          className="absolute inset-0 bg-night/45 backdrop-blur-[2px] cursor-pointer"
        />

        <motion.div
          role="dialog"
          aria-label={`${statusText}, full reading`}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-blush rounded-t-[28px] border-t border-line shadow-[0_-18px_44px_rgba(67,32,59,.28)] max-h-[78%] overflow-y-auto no-scrollbar"
        >
          <div className="sticky top-0 bg-blush/95 backdrop-blur-sm px-5 pt-3 pb-3 flex items-start gap-3 border-b border-line/70">
            <span className="w-10 h-10 rounded-xl shrink-0 border border-ink/10 swatch-dish-light" style={{ backgroundColor: currentHex }} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-[17px] text-ink leading-tight">{statusText}</div>
              <div className="text-[11px] font-mono text-muted">
                {currentHex} · {hue}° · {saturation}% · chroma {detail.chroma}
              </div>
            </div>
            <button
              onClick={() => setDetailsOpen(false)}
              aria-label="Close"
              className="w-8 h-8 rounded-full grid place-items-center bg-paper border border-line text-muted cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4 pb-8">
            <section>
              <div className="eyebrow mb-1.5">Why</div>
              <p className="text-[12.5px] leading-[1.6] text-ink">{detail.why}</p>
            </section>

            <section>
              <div className="eyebrow mb-1.5">Nearest thing you already own</div>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full border border-ink/10 shrink-0 swatch-dish-light" style={{ backgroundColor: detail.nearestHex }} />
                <p className="text-[12.5px] leading-[1.5] text-ink">
                  <span className="font-medium">{detail.nearest}</span>
                  <span className="block text-muted text-[11.5px] mt-0.5">
                    {match.verdict === 'yours'
                      ? 'Same family. Wear them together and nobody will see a join.'
                      : match.verdict === 'workable'
                      ? 'Near neighbours, not twins. This is the one to reach for instead on a day you cannot be bothered to think about it.'
                      : 'This is what your season does instead, and it does it better on you.'}
                  </span>
                </p>
              </div>
            </section>

            <section>
              <div className="eyebrow mb-1.5">Wear it as</div>
              <p className="text-[12.5px] leading-[1.6] text-ink">{detail.wear}</p>
            </section>

            <div className="grid grid-cols-2 gap-2.5">
              <section className="rounded-[16px_16px_16px_5px] bg-paper border border-line px-3.5 py-3">
                <div className="eyebrow mb-1">Metals</div>
                <p className="text-[11.5px] leading-snug text-ink">{detail.metals}</p>
              </section>
              <section className="rounded-[16px_16px_16px_5px] bg-paper border border-line px-3.5 py-3">
                <div className="eyebrow mb-1">Careful with</div>
                <p className="text-[11.5px] leading-snug text-muted">{detail.careful}</p>
              </section>
            </div>

            <p className="text-[10.5px] leading-snug text-muted/85">
              Read against {activeSeason.name}, {activeSeason.undertone.toLowerCase()} and{' '}
              {activeSeason.depth.toLowerCase()}. Change your season and every line above changes with it.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  const frame = typeof document !== 'undefined' ? document.getElementById('phone-frame') : null;

  return (
    <div className="relative w-full px-4 sm:px-6 pt-3 pb-24 flex flex-col items-center select-none">
      {/* Top Bar with Back Arrow and Brand Title */}
      <div className="w-full flex items-center justify-between mb-2">
        <button
          onClick={onBackToHome}
          className="p-2 rounded-full bg-white/80 hover:bg-white text-[#43203B] border border-[#EFDDE2] transition-colors cursor-pointer flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Home</span>
        </button>

        <span className="text-[11px] text-[#8A6580] tracking-wider uppercase font-medium">
          Chroma Wheel
        </span>
      </div>

      {/* Oira Brand Title */}
      <div className="text-center mb-2">
        <h1 className="font-display text-[36px] text-[#43203B] tracking-tight font-normal leading-none">
          Oira
        </h1>
        <p className="text-[12px] text-[#8A6580] mt-1 font-light">
          Personal chroma & spectral harmony wheel
        </p>
      </div>

      {/* The wheel.
          It was a flat pie with a decorative rainbow spinning around it, and neither ring
          knew anything about the sliders below. Now the outer ring IS the hue spectrum at
          her current saturation, with a bead on it showing where she is standing, and the
          pigment pans underneath sit in a bevelled pan with light falling across it from
          above left, the same place the seal is lit from. */}
      <div className="relative w-[232px] h-[232px] my-3 flex items-center justify-center">
        {/* The hue ring, live. */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: hueRing,
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 15px), #000 calc(100% - 14px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 15px), #000 calc(100% - 14px))',
          }}
          aria-hidden
        />
        {/* The channel the ring sits in, so it reads as inlaid rather than printed on. */}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            boxShadow:
              'inset 0 2px 5px rgba(67,32,59,.45), inset 0 -1px 3px rgba(255,251,247,.7), 0 1px 0 rgba(255,251,247,.9)',
          }}
          aria-hidden
        />

        {/* The bead, at the true hue angle. */}
        <div
          className="absolute inset-0 pointer-events-none transition-transform duration-150"
          style={{ transform: `rotate(${hue}deg)` }}
          aria-hidden
        >
          <span
            className="absolute left-1/2 -translate-x-1/2 -top-[3px] w-[21px] h-[21px] rounded-full"
            style={{
              background:
                'radial-gradient(circle at 34% 26%, #FFFDFA 0%, #F7E9DE 16%, #DCC4B6 44%, #F3E1D6 60%, #AC8F81 86%, #6E5347 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,251,247,.95), inset 0 -1px 2px rgba(67,32,59,.4), 0 0 0 1px rgba(67,32,59,.22), 0 3px 8px rgba(67,32,59,.4)',
            }}
          />
        </div>

        {/* The pigment pan. */}
        <div className="relative w-[186px] h-[186px] rounded-full overflow-hidden chroma-rim">
          <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
            <defs>
              {/* userSpaceOnUse, centred on the wheel. Object bounding box units give each
                  wedge its own little gradient about its own centre, which is why the first
                  pass came out as twelve pastel lozenges instead of a pan of pigment: the
                  shading has to be radial about the WHEEL for the pan to read as one dish. */}
              {colorWheelSegments.map((segment, idx) => (
                <radialGradient key={idx} id={`pan-${idx}`} gradientUnits="userSpaceOnUse" cx="50" cy="50" r="50">
                  <stop offset="0%" stopColor={segment.hex} stopOpacity="0.9" />
                  <stop offset="46%" stopColor={segment.hex} stopOpacity="1" />
                  <stop offset="86%" stopColor={segment.hex} stopOpacity="1" />
                  <stop offset="100%" stopColor="#1B1120" stopOpacity="0.42" />
                </radialGradient>
              ))}
            </defs>

            {colorWheelSegments.map((segment, idx) => {
              const sliceAngle = 360 / colorWheelSegments.length;
              const startAngle = idx * sliceAngle;
              const endAngle = (idx + 1) * sliceAngle;

              const x1 = 50 + 50 * Math.cos((Math.PI * startAngle) / 180);
              const y1 = 50 + 50 * Math.sin((Math.PI * startAngle) / 180);
              const x2 = 50 + 50 * Math.cos((Math.PI * endAngle) / 180);
              const y2 = 50 + 50 * Math.sin((Math.PI * endAngle) / 180);

              const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 0 1 ${x2} ${y2} Z`;
              const isSelected = selectedSegmentIdx === idx;

              return (
                <path
                  key={idx}
                  d={pathData}
                  fill={`url(#pan-${idx})`}
                  className="cursor-pointer transition-opacity duration-150 hover:opacity-92"
                  stroke={isSelected ? '#FFFBF7' : 'rgba(27,17,32,.28)'}
                  strokeWidth={isSelected ? '1.6' : '0.35'}
                  onClick={() => handleSelectSegment(idx)}
                >
                  <title>{`${segment.name}. ${segment.seasonVerdict}`}</title>
                </path>
              );
            })}
          </svg>

          {/* Light across the pan, and the shadow the far rim throws into it. */}
          <div className="absolute inset-0 rounded-full pointer-events-none chroma-sheen" aria-hidden />
          <div className="absolute inset-0 rounded-full pointer-events-none chroma-shade" aria-hidden />

          {/* The well, with the live colour dished into it. */}
          <div className="absolute inset-0 m-auto w-[84px] h-[84px] rounded-full bg-[#FBF3EE] chroma-well flex flex-col items-center justify-center">
            <div
              className="w-9 h-9 rounded-full swatch-dish-light transition-colors duration-200"
              style={{ backgroundColor: currentHex }}
            />
            <span className="text-[10px] font-mono mt-1 text-[#43203B] font-semibold">
              {currentHex}
            </span>
          </div>
        </div>
      </div>

      {/* Compatibility Preview.
          The verdict line used to be clipped to one line with no way to see the rest of it.
          The whole block is a button now, and it opens a sheet from the bottom of the phone
          with the full reading. A sheet rather than an inline expander because expanding in
          place pushes the two sliders she is holding off the screen, which is the one thing
          the founder asked it not to do. */}
      <div className="w-full mt-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] font-medium text-[#43203B] tracking-tight">
            Compatibility Preview
          </span>
          <span className="text-[10.5px] text-[#8A6580]">tap for the full reading</span>
        </div>

        <button
          id="compatibility-preview-btn"
          onClick={() => setDetailsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={detailsOpen}
          className="w-full text-left p-3.5 rounded-2xl bg-white/90 hover:bg-white border border-[#EFDDE2] shadow-2xs flex items-center gap-3 cursor-pointer transition-colors active:scale-[0.995]"
        >
          <div
            className="w-12 h-12 rounded-xl swatch-dish-light shrink-0 transition-colors duration-200"
            style={{ backgroundColor: currentHex }}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-[16px] text-[#43203B] tracking-wide truncate font-normal">
                {statusText}
              </span>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full border shrink-0 inline-flex items-center gap-1 ${
                  match.verdict === 'yours'
                    ? 'text-[#7A5320] bg-[#D6A756]/25 border-[#D6A756]/60'
                    : match.verdict === 'workable'
                    ? 'text-[#A85578] bg-[#F3DDD6] border-[#E9B8D2]'
                    : 'text-[#8A6580] bg-[#FBF3EE] border-[#EFDDE2]'
                }`}
              >
                {match.verdict === 'yours' && <Sparkles className="w-2.5 h-2.5" />}
                {match.score}%
              </span>
            </div>
            <p className="text-[11.5px] text-[#8A6580] line-clamp-1 mt-0.5">
              {match.reason}
            </p>
          </div>
        </button>
      </div>

      {/* The sliders. Carved channels with the pigment sitting down in them and a turned
          metal bead riding the groove. See .oira-range in src/index.css. */}
      <div className="w-full mt-4 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-[12.5px] font-medium text-[#43203B]">Hue Spectrum</span>
            <span className="text-[11px] font-mono text-[#8A6580]">{hue}° {hueFamily(hue)}</span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            value={hue}
            onChange={(e) => setHue(Number(e.target.value))}
            aria-label="Hue"
            aria-valuetext={`${hue} degrees, ${hueFamily(hue)}`}
            className="oira-range"
            style={{
              ['--oira-track' as string]:
                'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
            }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-0.5">
            <span className="text-[12.5px] font-medium text-[#43203B]">Saturation & Chroma</span>
            <span className="text-[11px] font-mono text-[#8A6580]">{saturation}%</span>
          </div>
          <input
            type="range"
            min="5"
            max="100"
            value={saturation}
            onChange={(e) => setSaturation(Number(e.target.value))}
            aria-label="Saturation"
            aria-valuetext={`${saturation} percent`}
            className="oira-range"
            style={{
              ['--oira-track' as string]:
                `linear-gradient(to right, ${hslToHex(hue, 5, lightness)} 0%, ${hslToHex(hue, 100, lightness)} 100%)`,
            }}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="w-full mt-5 pt-3 border-t border-[#EFDDE2] flex items-center gap-2.5">
        <button
          id="color-wheel-save-btn"
          onClick={handleSave}
          className={`flex-1 py-3.5 px-4 rounded-full font-medium text-xs tracking-tight transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
            savedSuccess
              ? 'bg-[#B4813C] text-white'
              : 'bg-white hover:bg-[#F3DDD6] text-[#43203B] border border-[#EFDDE2] shadow-xs'
          }`}
        >
          {savedSuccess ? (
            <>
              <Check className="w-3.5 h-3.5" />
              <span>Saved to Swatches</span>
            </>
          ) : (
            <>
              <Heart className="w-3.5 h-3.5 text-[#A85578]" />
              <span>Save Swatch</span>
            </>
          )}
        </button>

        <button
          id="color-wheel-done-btn"
          onClick={onBackToHome}
          className="py-3.5 px-6 rounded-full bg-[#43203B] hover:bg-[#43203B] text-white font-medium text-xs tracking-tight transition-colors cursor-pointer shadow-xs"
        >
          Done
        </button>
      </div>

      {/* The sheet belongs to the phone, not to this scrolling column, so it goes through a
          portal into the frame. Rendered inline as a fallback if the frame is not there. */}
      {frame && sheet ? createPortal(sheet, frame) : sheet}
    </div>
  );
};
