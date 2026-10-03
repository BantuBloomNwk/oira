import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { DELETE_COPY } from '../lib/voice';
import { deleteEverything } from '../lib/identity';

/**
 * The way out.
 *
 * The Solana dApp Store publisher policy requires a means for a woman to delete her account,
 * and that is the floor rather than the reason. Oira tells her that what it knows about her
 * lives on her phone, and a claim like that is only true if she can end it in one place she
 * can actually find. So this is a plain row in the menu, not a link to a support form.
 *
 * The whole difficulty of this screen is the second paragraph. A seal already written to
 * Solana cannot be unwritten by anybody, us included, and telling her "everything is gone"
 * while a number remains on a public ledger would be exactly the comfortable lie this product
 * exists not to tell. So it says what goes, then it says what stays, then it says why what
 * stays cannot be turned back into her. She gets to decide with the real facts.
 */

interface DeleteEverythingProps {
  onDone: () => void;
}

export const DeleteEverything: React.FC<DeleteEverythingProps> = ({ onDone }) => {
  const [asking, setAsking] = useState(false);
  const [gone, setGone] = useState(false);

  const wipe = async () => {
    await deleteEverything();
    setGone(true);
    /* A beat on the confirmation, then back to a blank app. Reloading immediately would look
       like a crash rather than like something she chose. */
    setTimeout(() => { onDone(); location.reload(); }, 1600);
  };

  if (!asking) {
    return (
      <button
        onClick={() => setAsking(true)}
        className="w-full flex items-center gap-2.5 px-1 py-2.5 text-[12.5px] text-muted hover:text-ink cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
        {DELETE_COPY.row}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-[380px] bg-paper rounded-3xl px-5 py-5">
        {gone ? (
          <p className="text-[13px] leading-[1.55] text-ink text-center py-6">{DELETE_COPY.done}</p>
        ) : (
          <>
            <h2 className="font-display text-[18px] text-ink" style={{ fontWeight: 600 }}>
              {DELETE_COPY.title}
            </h2>
            <p className="text-[12.5px] leading-[1.55] text-muted mt-2">{DELETE_COPY.body}</p>
            <p className="text-[12px] leading-[1.55] text-ink mt-3 rounded-2xl bg-blush px-3.5 py-3">
              {DELETE_COPY.cannot}
            </p>
            <p className="text-[11px] leading-snug text-muted/85 mt-2.5">{DELETE_COPY.passkeyNote}</p>

            <button
              onClick={wipe}
              className="w-full mt-4 rounded-full py-3.5 text-[13px] font-semibold cursor-pointer text-paper bg-[#8C3A4E] active:scale-[0.98] transition-transform"
            >
              {DELETE_COPY.confirm}
            </button>
            <button
              onClick={() => setAsking(false)}
              className="w-full mt-2.5 text-[12px] text-muted hover:text-ink cursor-pointer"
            >
              {DELETE_COPY.cancel}
            </button>
          </>
        )}
      </div>
    </div>
  );
};
