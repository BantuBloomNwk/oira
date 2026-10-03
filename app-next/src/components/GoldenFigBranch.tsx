import React from 'react';

/* Why the leaves are line work with a whisper of fill rather than filled shapes.
 *
 * A half opaque gold laid over aubergine does not come back gold. It comes back brown, and
 * a fig leaf the size of a fist rendered in brown on a dark purple page is a smudge, which
 * is exactly what the deploy showed: the motif was there and nobody could see it. The far
 * stops made it worse by falling to #4A1835 and #300B22, so the leaf dissolved into the
 * ground at its own edge.
 *
 * Gilding is drawn, not poured. The fills are down near a tenth so they only lift the leaf
 * off the page, and the light lives in the veins and the outline, where it stays gold at
 * any opacity because it is thin enough never to mix with what is behind it. */
interface GoldenFigBranchProps {
  className?: string;
  variant?: 'subtle' | 'rich';
}

export const GoldenFigBranch: React.FC<GoldenFigBranchProps> = ({
  className = '',
  variant = 'rich',
}) => {
  return (
    <div className={`absolute pointer-events-none select-none overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 400 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          {/* Metallic Gold Gradient */}
          <linearGradient id="goldStemGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F9E6B3" stopOpacity="0.85" />
            <stop offset="45%" stopColor="#D4AF37" stopOpacity="0.95" />
            <stop offset="80%" stopColor="#C79430" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#A87C22" stopOpacity="0.7" />
          </linearGradient>

          {/* Fig Leaf Fill & Glow */}
          <linearGradient id="goldLeafGrad1" x1="20%" y1="10%" x2="80%" y2="90%">
            <stop offset="0%" stopColor="#FDF1D6" stopOpacity="0.2" />
            <stop offset="35%" stopColor="#E5C07B" stopOpacity="0.13" />
            <stop offset="70%" stopColor="#C89736" stopOpacity="0.07" />
            <stop offset="100%" stopColor="#8A6320" stopOpacity="0.02" />
          </linearGradient>

          <linearGradient id="goldLeafGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFECC7" stopOpacity="0.22" />
            <stop offset="50%" stopColor="#D8A542" stopOpacity="0.11" />
            <stop offset="100%" stopColor="#7A5518" stopOpacity="0.03" />
          </linearGradient>

          {/* Golden Dewdrop Glow Filter */}
          <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Ambient Celestial Orbit Arc */}
        <path
          d="M -30,60 Q 180,40 380,180"
          stroke="url(#goldStemGrad)"
          strokeWidth="0.8"
          strokeDasharray="4 6"
          opacity="0.35"
        />

        {/* Main Fig Branch Stem */}
        <path
          d="M 390,-10 C 330,40 260,80 180,110 C 120,135 60,140 -20,130"
          stroke="url(#goldStemGrad)"
          strokeWidth="2.2"
          strokeLinecap="round"
        />

        {/* Branch Offshoot 1 */}
        <path
          d="M 280,70 C 240,40 210,15 190,-10"
          stroke="url(#goldStemGrad)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Branch Offshoot 2 */}
        <path
          d="M 190,105 C 160,140 140,170 120,210"
          stroke="url(#goldStemGrad)"
          strokeWidth="1.4"
          strokeLinecap="round"
        />

        {/* Fig Leaf 1 (Large 3-lobed classic fig leaf profile) */}
        <g transform="translate(240, 30) rotate(-25)">
          <path
            d="M 0,0 C -25,-15 -45,-8 -50,15 C -55,35 -40,55 -25,60 C -15,75 5,85 20,80 C 35,75 50,55 45,30 C 40,5 20,-10 0,0 Z"
            fill="url(#goldLeafGrad1)"
            stroke="url(#goldStemGrad)"
            strokeWidth="1.2"
          />
          {/* Leaf Veins */}
          <path d="M 0,0 Q -5,40 -2,75" stroke="#FFF3D6" strokeWidth="1.1" opacity="0.9" />
          <path d="M -3,25 Q -25,20 -38,18" stroke="#F6E2AE" strokeWidth="0.75" opacity="0.72" />
          <path d="M -2,45 Q -25,48 -35,52" stroke="#F6E2AE" strokeWidth="0.75" opacity="0.72" />
          <path d="M 0,22 Q 22,20 32,24" stroke="#F6E2AE" strokeWidth="0.75" opacity="0.72" />
          <path d="M 0,42 Q 20,46 30,55" stroke="#F6E2AE" strokeWidth="0.75" opacity="0.72" />
        </g>

        {/* Fig Leaf 2 (Upper branch) */}
        <g transform="translate(195, -5) rotate(-65) scale(0.75)">
          <path
            d="M 0,0 C -20,-12 -35,-5 -40,15 C -45,30 -30,48 -18,52 C -10,65 5,72 18,68 C 28,62 38,45 35,25 C 30,5 15,-8 0,0 Z"
            fill="url(#goldLeafGrad2)"
            stroke="url(#goldStemGrad)"
            strokeWidth="1.2"
          />
          <path d="M 0,0 Q -3,35 0,65" stroke="#FFF3D6" strokeWidth="1" opacity="0.88" />
          <path d="M -2,20 Q -20,18 -30,16" stroke="#F6E2AE" strokeWidth="0.7" opacity="0.7" />
          <path d="M 0,18 Q 18,18 26,22" stroke="#F6E2AE" strokeWidth="0.7" opacity="0.7" />
        </g>

        {/* Fig Leaf 3 (Lower branch drooping gently) */}
        <g transform="translate(130, 185) rotate(35) scale(0.85)">
          <path
            d="M 0,0 C -25,-12 -42,-4 -45,18 C -48,35 -35,52 -20,58 C -12,72 8,78 22,72 C 32,65 42,48 38,28 C 34,8 18,-6 0,0 Z"
            fill="url(#goldLeafGrad1)"
            stroke="url(#goldStemGrad)"
            strokeWidth="1.2"
          />
          <path d="M 0,0 Q -4,38 2,70" stroke="#FFF3D6" strokeWidth="1" opacity="0.88" />
          <path d="M -2,22 Q -22,22 -32,20" stroke="#F6E2AE" strokeWidth="0.7" opacity="0.7" />
          <path d="M 0,20 Q 20,22 28,26" stroke="#F6E2AE" strokeWidth="0.7" opacity="0.7" />
        </g>

        {/* Small Golden Fig Fruit on Branch Node */}
        <g transform="translate(280, 70)">
          {/* Fig Fruit Body */}
          <path
            d="M 0,0 C -8,5 -12,14 -10,22 C -8,30 2,36 10,34 C 18,32 24,24 22,15 C 20,6 10,2 0,0 Z"
            fill="url(#goldStemGrad)"
            opacity="0.55"
          />
          {/* Golden Dew Highlight */}
          <circle cx="2" cy="18" r="2.5" fill="#FFF8E7" opacity="0.9" filter="url(#goldGlow)" />
        </g>

        {/* Second Small Fig Fruit */}
        <g transform="translate(190, 105) scale(0.8)">
          <path
            d="M 0,0 C -6,4 -10,12 -8,18 C -6,24 2,28 8,27 C 14,25 18,18 16,12 C 14,5 8,2 0,0 Z"
            fill="url(#goldStemGrad)"
            opacity="0.5"
          />
          <circle cx="1" cy="14" r="2" fill="#FFF8E7" opacity="0.9" />
        </g>

        {/* Floating Golden Fig Petals & Sparkle Dew Drops */}
        <g transform="translate(90, 75) rotate(15)">
          <path
            d="M 0,0 C -6,-10 -15,-6 -16,4 C -17,12 -8,18 0,16 C 8,14 14,8 12,0 C 10,-6 4,-8 0,0 Z"
            fill="url(#goldLeafGrad2)"
            stroke="url(#goldStemGrad)"
            strokeWidth="1"
            opacity="0.6"
          />
        </g>

        <g transform="translate(320, 160) rotate(-40)">
          <path
            d="M 0,0 C -5,-8 -12,-5 -13,3 C -14,10 -6,14 0,13 C 6,12 11,6 10,0 Z"
            fill="url(#goldLeafGrad1)"
            stroke="url(#goldStemGrad)"
            strokeWidth="1"
            opacity="0.55"
          />
        </g>

        {/* Golden Stardust / Dew Points */}
        <circle cx="260" cy="115" r="2" fill="#FFF4D0" opacity="0.85" filter="url(#goldGlow)" />
        <circle cx="150" cy="80" r="1.5" fill="#FFEAA7" opacity="0.7" />
        <circle cx="70" cy="160" r="2" fill="#FFF4D0" opacity="0.8" />
        <circle cx="340" cy="60" r="1.5" fill="#FFEAA7" opacity="0.75" />
        <circle cx="210" cy="180" r="1.8" fill="#FFF8E7" opacity="0.85" filter="url(#goldGlow)" />
      </svg>
    </div>
  );
};
