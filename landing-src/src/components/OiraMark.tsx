import { useId } from 'react';

// The live Oira mark and wordmark, carried over from the old landing page.
// The defs live inside each svg because a mask referenced across svg elements is unreliable.
const O_PATH =
  'M 90 26 C 132 26 152 56 152 90 C 152 124 132 154 90 154 C 48 154 28 124 28 90 C 28 56 48 26 90 26 Z M 90 42 C 58 42 46 62 46 90 C 46 118 58 138 90 138 C 122 138 134 118 134 90 C 134 62 122 42 90 42 Z';

export function OiraMark({ dark = false }: { dark?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <span className="flex items-center gap-2.5 shrink-0">
      <svg className="w-[34px] h-[34px] sm:w-[38px] sm:h-[38px] block shrink-0" viewBox="0 0 180 180" aria-hidden="true">
        <defs>
          <linearGradient id={`pl${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F4A7B9" />
            <stop offset="28%" stopColor="#E8C79A" />
            <stop offset="52%" stopColor="#BFE3C0" />
            <stop offset="76%" stopColor="#A9CBEF" />
            <stop offset="100%" stopColor="#C9A9EF" />
          </linearGradient>
          <mask id={`rg${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="180" height="180">
            <path d={O_PATH} fill="#fff" fillRule="evenodd" transform="rotate(-18 90 90)" />
          </mask>
        </defs>
        <path d={O_PATH} fill={dark ? '#F6E4EE' : '#43203B'} fillRule="evenodd" transform="rotate(-18 90 90)" />
        <g mask={`url(#rg${id})`}>
          <g className="omark-light">
            <ellipse cx="90" cy="30" rx="62" ry="46" fill={`url(#pl${id})`} />
          </g>
        </g>
      </svg>
      <img
        className="h-[22px] w-auto block"
        src={dark ? '/brand/png/wordmark-dark-2000w.png' : '/brand/png/wordmark-light-2000w.png'}
        alt="Oira"
        width={120}
        height={22}
      />
    </span>
  );
}
