import React from 'react';

interface TopAestheticFiligreeProps {
  className?: string;
}

export const TopAestheticFiligree: React.FC<TopAestheticFiligreeProps> = ({
  className = '',
}) => {
  return (
    <div
      className={`absolute top-0 right-0 pointer-events-none select-none overflow-hidden z-0 ${className}`}
      style={{ width: '320px', height: '276px' }}
    >
      <svg
        viewBox="0 0 280 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <defs>
          {/* Soft Rose Gold & Champagne Gradient */}
          <linearGradient id="topAestheticGrad1" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#C9799B" stopOpacity="0.92" />
            <stop offset="50%" stopColor="#E7A6C0" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#D6A756" stopOpacity="0.34" />
          </linearGradient>

          <linearGradient id="topGildLine" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#A85578" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#C9799B" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#D6A756" stopOpacity="0.32" />
          </linearGradient>

          {/* A petal is a solid, so it gets a fill that behaves like one. */}
          <radialGradient id="topPetalFill" cx="38%" cy="26%" r="82%">
            <stop offset="0%" stopColor="#F9D5E0" stopOpacity="0.8" />
            <stop offset="52%" stopColor="#E7A6C0" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#A85578" stopOpacity="0.34" />
          </radialGradient>

          <linearGradient id="topSunburst" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF2E5" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#C9799B" stopOpacity="0.5" />
          </linearGradient>
        </defs>

        {/* Ethereal Sacred Crown Arc */}
        <circle
          cx="240"
          cy="20"
          r="160"
          stroke="url(#topGildLine)"
          strokeWidth="1.2"
          strokeDasharray="3 5"
          opacity="0.85"
        />

        <circle
          cx="240"
          cy="20"
          r="110"
          stroke="url(#topGildLine)"
          strokeWidth="1.6"
          opacity="0.7"
        />

        {/* Soft Organic Rose-Gold Petal Curves in Top-Right */}
        <path
          d="M 280,0 C 230,35 185,90 170,160 C 160,205 140,230 110,240"
          stroke="url(#topGildLine)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* Delicate Botanical Leaf Offshoot 1 */}
        <g transform="translate(200, 75) rotate(-35)">
          <path
            d="M 0,0 C -15,-10 -25,-4 -28,12 C -30,28 -18,40 -8,44 C 2,42 12,32 10,18 C 8,4 2,-6 0,0 Z"
            fill="url(#topAestheticGrad1)"
            stroke="url(#topGildLine)"
            strokeWidth="1.1"
          />
          <path d="M 0,0 Q -8,22 -3,38" stroke="#FFF4F6" strokeWidth="0.8" opacity="0.85" />
        </g>

        {/* Delicate Botanical Leaf Offshoot 2 */}
        <g transform="translate(172, 140) rotate(15) scale(0.85)">
          <path
            d="M 0,0 C -14,-8 -22,-2 -25,10 C -28,24 -16,34 -7,38 C 1,36 10,28 8,16 C 6,4 1,-5 0,0 Z"
            fill="url(#topAestheticGrad1)"
            stroke="url(#topGildLine)"
            strokeWidth="1.1"
          />
          <path d="M 0,0 Q -7,18 -3,32" stroke="#FFF4F6" strokeWidth="0.8" opacity="0.85" />
        </g>

        {/* Soft Gilded Petal Droplet */}
        <g transform="translate(140, 95) rotate(-60) scale(0.65)">
          <path
            d="M 0,0 C -10,-6 -16,-2 -18,8 C -20,18 -12,25 -5,28 C 1,26 8,20 6,12 C 4,3 1,-4 0,0 Z"
            fill="url(#topSunburst)"
            stroke="url(#topGildLine)"
            strokeWidth="1.1"
          />
        </g>

        {/* Two rose petals actually shed off the vine, with a fill dense enough to be seen.
            Everything above is line work; without a solid form the corner had nothing for
            the eye to land on and read as an empty page with a scratch in it. */}
        <g transform="translate(246, 34) rotate(24) scale(0.62)" opacity="0.72">
          <path
            d="M 0,0 C -16,-10 -30,-2 -32,16 C -34,34 -20,48 -6,50 C 6,48 20,36 19,18 C 18,4 8,-6 0,0 Z"
            fill="url(#topPetalFill)"
            stroke="url(#topGildLine)"
            strokeWidth="1"
          />
          <path d="M -6,2 Q -12,26 -7,46" stroke="#FFF7F9" strokeWidth="0.9" opacity="0.7" fill="none" />
        </g>

        <g transform="translate(186, 96) rotate(-48) scale(0.44)" opacity="0.6">
          <path
            d="M 0,0 C -16,-10 -30,-2 -32,16 C -34,34 -20,48 -6,50 C 6,48 20,36 19,18 C 18,4 8,-6 0,0 Z"
            fill="url(#topPetalFill)"
            stroke="url(#topGildLine)"
            strokeWidth="1"
          />
        </g>

        {/* Tiny Ambient Micro Star Accents */}
        <circle cx="210" cy="115" r="2" fill="#FFF2E5" opacity="1" />
        <circle cx="160" cy="55" r="1.8" fill="#FFF4F6" opacity="0.95" />
        <circle cx="130" cy="170" r="2" fill="#FFEFE0" opacity="0.95" />
      </svg>
    </div>
  );
};
