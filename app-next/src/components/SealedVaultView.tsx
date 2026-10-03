import { whenSealed, type Proof } from '../lib/proof';
import React from 'react';
import { SEAL_COPY } from '../lib/voice';
import { DayDecor } from './Decor';

interface SealedVaultViewProps {
  /* Where her palette landed, if the ledger gave us something to show. Optional on
     purpose: the screen has to read the same whether or not the receipt arrived. */
  proof?: Proof | null;
  onContinue: () => void;
}

/* The seal. Preserved from app/index.html exactly, because it is the moment the whole
   privacy claim rests on and it already works. Wax, not plastic: an irregular perimeter,
   a light source above and to the left, a press, and a gloss that sweeps once it lands. */
export const SealedVaultView: React.FC<SealedVaultViewProps> = ({ proof, onContinue }) => (
  <div className="absolute inset-0 flex flex-col items-center text-center bg-blush px-5 pt-12 pb-6 overflow-hidden">
    <DayDecor />
    <div className="relative z-10 self-start font-display text-[18px] text-ink" style={{ fontWeight: 600 }}>
      Oira<span className="italic text-mauve-deep">.</span>
    </div>

    <div className="relative z-10 mt-14 flex items-center justify-center">
      <div className="glowring2" aria-hidden />
      <div className="seal">
        <span className="grain" aria-hidden />
        <img
          src="/brand/svg/oira-mark-silk-edge-light.svg"
          alt="Oira sealed"
          width={112}
          height={112}
          className="block relative"
          style={{ filter: 'drop-shadow(0 2px 10px rgba(214,167,86,.35))' }}
        />
      </div>
    </div>

    <h1 className="relative z-10 font-display text-[31px] leading-tight mt-7 text-ink">{SEAL_COPY.title}</h1>
    <p className="relative z-10 text-[12.5px] leading-[1.55] text-muted max-w-[225px] mt-2">
      {SEAL_COPY.body}
    </p>

    <div className="relative z-10 flex gap-1.5 justify-center mt-3">
      <span className="text-[11px] px-3 py-1.5 rounded-full border border-gold/40 bg-gold/[0.12] text-gold-deep font-medium">
        {SEAL_COPY.chips[0]}
      </span>
      <span className="text-[11px] px-3 py-1.5 rounded-full border border-line bg-paper text-muted">
        {SEAL_COPY.chips[1]}
      </span>
    </div>

    {/* What happened, in a sentence. The evidence is one tap away for anyone who wants it,
        and never the first thing she has to read. */}
    {proof && (
      <p className="relative z-10 text-[11.5px] leading-[1.5] text-muted mt-4 max-w-[260px]">
        {SEAL_COPY.saved(whenSealed(proof.at))}{' '}
        <a href={proof.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-mauve-deep">
          {SEAL_COPY.proof}
        </a>
      </p>
    )}

    <div className="relative z-10 mt-auto w-full pt-6">
      <button
        onClick={onContinue}
        className="w-full rounded-full bg-ink text-paper py-3.5 text-[13px] font-semibold cursor-pointer transition-transform active:scale-[0.98] shadow-[0_10px_22px_rgba(67,32,59,.25)]"
      >
        {SEAL_COPY.cta}
      </button>
    </div>
  </div>
);
