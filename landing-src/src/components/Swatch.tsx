// Three overlapping shade chips, deep to light. Sits where an eyebrow dot would.
export function Swatch({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex items-center shrink-0 ${className}`}>
      <span className="w-2.5 h-2.5 rounded-full bg-[#4A2416] ring-1 ring-cream-luminous/80" />
      <span className="w-2.5 h-2.5 rounded-full bg-[#B9824F] ring-1 ring-cream-luminous/80 -ml-1" />
      <span className="w-2.5 h-2.5 rounded-full bg-[#EBC4A2] ring-1 ring-cream-luminous/80 -ml-1" />
    </span>
  );
}
