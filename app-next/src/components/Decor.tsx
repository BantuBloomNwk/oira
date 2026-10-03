import React from 'react';
import { GoldenFigBranch } from './GoldenFigBranch';
import { TopAestheticFiligree } from './TopAestheticFiligree';

/**
 * The background. Two families, one per surface.
 *
 * They are the same motif in two colourways: a leafed branch. Rose on the daylight pages,
 * gold on the After Dark ones. Nothing here is filler; it is what stops a screen reading
 * as an empty form, so it goes on every page rather than a chosen few.
 *
 * Daylight gets the rose vine down the right, the blush glows, and the deep brown velvet
 * curves along the bottom. After Dark gets the gold fig, and only that: the rose vine and
 * the brown curves both disappear against aubergine, and the fig is the one that reads.
 */

/* Why the bottom curves are short and at full strength rather than tall and dimmed.
 *
 * They were drawn as a near-black plum gradient held at 55 percent so the page text could
 * survive crossing them. Flat opacity over blush is how you make grey: what arrives is a
 * fifty-five percent mix of near-black and cream, which is the grey that came back from the
 * deploy, and it read as a bruise rather than as velvet.
 *
 * The dimming was there to solve a real problem. At 288 pixels tall these curves reached up
 * into the page and a long scroll slid "Skin Trends" straight across them, so plum ink was
 * landing on near-black. But height was the problem, not saturation. They are short now,
 * confined to the floor of the frame underneath the tab bar, and the colour is at full
 * strength: the melanin ribbon's two deepest browns, which are Oira's browns and not a new
 * colour. Nothing scrolls through them any more, so nothing has to be dimmed for it.
 *
 * The mask only softens the top edge, so the curve rises out of the page instead of being
 * cut out of it. */
/* Where the fade sits, and why it is this high up.
 *
 * The tab bar is 95 percent opaque and covers the bottom 76 pixels of the frame, so
 * anything the mask does down there is invisible. The first attempt faded from the very
 * bottom, which meant the only part of the curve she could actually see was the part being
 * faded out: a full strength brown that arrived on screen as taupe. The fade starts at the
 * bar line instead, so the band immediately above it is nearly solid and the colour is gone
 * by 130 pixels up, well clear of anything at rest.
 *
 * The pages that scroll carry enough bottom padding that nothing sits on this at rest. A
 * card passing over it mid-scroll is fine; it passes over the weak end. */
const VELVET_MASK =
  'linear-gradient(to top, #000 0%, #000 38%, rgba(0,0,0,.8) 56%, rgba(0,0,0,.32) 78%, transparent 100%)';

export const DayDecor: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`} aria-hidden>
    {/* The rose vine, down from the top right corner. */}
    <TopAestheticFiligree className="top-0 right-0" />

    {/* The splash the vine grows out of. It was a pair of thin washes that the eye read as
        nothing at all, so it is one dense pour now: rose at the corner falling to petal and
        then to nothing, with the corner itself carrying real saturation. */}
    <div
      className="absolute -top-40 -right-36 w-[22rem] h-[22rem] rounded-full blur-2xl"
      style={{
        background:
          'radial-gradient(closest-side, rgba(201,121,155,.85) 0%, rgba(231,166,192,.42) 42%, rgba(243,221,214,.14) 72%, rgba(243,221,214,0) 100%)',
      }}
    />
    <div
      className="absolute -top-24 -right-4 w-40 h-40 rounded-full blur-xl"
      style={{
        background:
          'radial-gradient(closest-side, rgba(168,85,120,.5) 0%, rgba(201,121,155,.16) 58%, transparent 100%)',
      }}
    />

    {/* Blush light, top left, then once more at mid height so the middle of a long page is
        not dead. */}
    <div className="absolute top-28 -left-16 w-72 h-72 bg-gradient-to-br from-petal/55 via-petal/25 to-transparent rounded-full blur-3xl" />
    <div className="absolute top-1/2 -right-20 w-60 h-60 bg-gradient-to-l from-mauve/35 via-petal/18 to-transparent rounded-full blur-2xl" />

    {/* The deep brown velvet curves along the bottom. The signature, and the thing that
        gives a light page its weight. Full-strength brown, masked away before it reaches
        the copy. See VELVET_MASK above. */}
    <div
      className="absolute bottom-0 left-0 w-60 h-52 rounded-tr-[130px] -ml-10"
      style={{
        background: 'linear-gradient(28deg, #2A160F 0%, #4A2B1C 42%, #6E4128 74%, #96603F 92%, #A85578 100%)',
        WebkitMaskImage: VELVET_MASK,
        maskImage: VELVET_MASK,
      }}
    />
    <div
      className="absolute bottom-0 right-0 w-48 h-44 rounded-tl-[112px] -mr-8"
      style={{
        background: 'linear-gradient(-28deg, #23120D 0%, #4A2B1C 48%, #6E4128 84%, #96603F 100%)',
        WebkitMaskImage: VELVET_MASK,
        maskImage: VELVET_MASK,
      }}
    />
    <div className="absolute bottom-2 left-1/3 w-40 h-28 bg-mauve/25 rounded-full blur-2xl" />
  </div>
);

export const NightDecor: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`} aria-hidden>
    {/* Aubergine depth first, so the gold has something to sit on. */}
    <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-b from-ink/45 via-ink/30 to-transparent rounded-full blur-3xl" />
    <div className="absolute top-1/3 -left-20 w-72 h-72 bg-gradient-to-tr from-mauve-deep/35 via-ink/20 to-transparent rounded-full blur-3xl" />
    <div className="absolute bottom-0 right-0 w-64 h-64 bg-gradient-to-tl from-ink/60 to-transparent rounded-2xl blur-2xl" />

    {/* The gold fig, high and clear of the display type, and a quieter one below left. */}
    <GoldenFigBranch className="z-0 -top-10 -right-8 w-72 h-52 opacity-85 transform scale-105" />
    <GoldenFigBranch className="z-0 -bottom-20 -left-24 w-64 h-52 opacity-55 transform -rotate-[38deg] scale-90" />
  </div>
);
