import React, { useEffect, useState } from 'react';
import type { Owner } from '../lib/owner';
import { fetchBalance, sendUsdc, type Sent } from '../lib/send';
import { connectedWalletAddress } from '../lib/identity';
import { diag } from '../lib/diag';
import qrcode from 'qrcode-generator';

/* Her address as a QR code, for receiving. A data URL, which the in-app policy already allows. */
function qrFor(text: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 2);
}

/**
 * Her money, in and out.
 *
 * What brands paid her sits in an account only her key controls. This sends it where she says:
 * her own wallet, the deposit address of a card she already has, or anyone else. Her key signs
 * on this phone; Oira pays the network fee, so she never needs SOL. Every send is checked on the
 * phone before it is signed (see lib/signguard.ts), and the receipt links to the transaction.
 */

type Where = 'wallet' | 'card' | 'someone';

const WHERE: { id: Where; label: string; hint: string }[] = [
  { id: 'wallet', label: 'My wallet', hint: "Your Solana wallet's address. In your wallet app it's under Receive." },
  { id: 'card', label: 'My card', hint: "In your card app (Jupiter, RedotPay or KAST), find Deposit, pick USDC on Solana, and copy that address." },
  { id: 'someone', label: 'Someone else', hint: "Their Solana address. Double check it: a send can't be pulled back." },
];

const looksLikeAddress = (s: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());

interface SendSheetProps {
  getOwner: () => Promise<Owner | null>;
  onClose: () => void;
}

export const SendSheet: React.FC<SendSheetProps> = ({ getOwner, onClose }) => {
  const [mode, setMode] = useState<'send' | 'receive'>('send');
  const [copied, setCopied] = useState(false);
  const [owner, setOwner] = useState<Owner | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [where, setWhere] = useState<Where>('wallet');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const o = await getOwner();
        if (!alive) return;
        if (!o) { setError("I need to know it's you first. Open me and tap Use my fingerprint."); return; }
        setOwner(o);
        const b = await fetchBalance(o.address);
        setBalance(b);
        diag('send', `balance ${b} USDC for ${o.address.slice(0, 6)} (${o.assurance})`);
      } catch {
        if (alive) setError("I couldn't check your balance just now. Try again in a moment.");
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Her connected wallet, if she has one, fills itself in. */
  useEffect(() => {
    if (where === 'wallet' && !to) {
      const w = connectedWalletAddress();
      if (w) setTo(w);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [where]);

  const paste = async () => {
    try { setTo((await navigator.clipboard.readText()).trim()); } catch { setError('Long press the box and choose Paste instead.'); }
  };

  const value = Number(amount);
  const ready = !!owner && looksLikeAddress(to) && to.trim() !== owner?.address && value > 0 && balance != null && value <= balance + 1e-9;

  const send = async () => {
    if (!owner || !ready) return;
    setBusy(true);
    setError(null);
    try {
      const r = await sendUsdc(owner, to.trim(), Math.round(value * 1e6) / 1e6);
      setSent(r);
      setBalance((b) => (b == null ? b : Math.max(0, Math.round((b - r.amount) * 1e6) / 1e6)));
    } catch (e) {
      setError((e as Error)?.message || "It didn't send. Nothing left your account.");
    } finally {
      setBusy(false);
    }
  };

  const hint = WHERE.find((w) => w.id === where)!.hint;

  return (
    <div className="absolute inset-0 z-[60] bg-black/45 flex items-end justify-center">
      <div className="w-full max-w-[420px] bg-paper rounded-t-3xl px-5 pt-5 pb-7 max-h-[92%] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[19px] text-ink" style={{ fontWeight: 600 }}>
              {sent ? 'Sent, love' : mode === 'receive' ? 'Receive money' : 'Send your money'}
            </h2>
            <p className="text-[12.5px] leading-[1.55] text-muted mt-1">
              {balance == null ? 'Checking your balance...' : `You have $${balance.toFixed(2)} USDC. It's yours, and only your fingerprint can move it.`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-[12px] text-muted px-2 py-1 cursor-pointer" aria-label="Close">Close</button>
        </div>

        {!sent && (
          <div className="flex gap-1 mt-3 p-1 rounded-full bg-[#F3E6EA]">
            {(['send', 'receive'] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 text-[12.5px] py-1.5 rounded-full cursor-pointer ${mode === m ? 'bg-paper text-ink font-semibold shadow-sm' : 'text-muted'}`}>
                {m === 'send' ? 'Send' : 'Receive'}
              </button>
            ))}
          </div>
        )}

        {!sent && mode === 'receive' ? (
          <div className="mt-4 flex flex-col items-center text-center">
            {owner ? (
              <>
                <img src={qrFor(owner.address)} alt="Your Oira address as a QR code" width={196} height={196} className="rounded-xl border border-[#E6CFD6]" />
                <p className="mt-3 font-mono text-[12px] text-ink break-all leading-snug px-2">{owner.address}</p>
                <button type="button"
                  onClick={async () => { try { await navigator.clipboard.writeText(owner.address); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { setError('Long press the address and copy it instead.'); } }}
                  className="mt-3 rounded-full bg-ink text-paper px-6 py-2.5 text-[13px] font-semibold cursor-pointer active:scale-[0.98]">
                  {copied ? 'Copied' : 'Copy my address'}
                </button>
                <p className="text-[11.5px] text-muted leading-snug mt-3 max-w-[300px]">
                  Only send USDC on Solana here. It lands in the same place brands pay you, and only your fingerprint can move it.
                </p>
              </>
            ) : (
              <p className="text-[12.5px] text-muted">Checking it's you...</p>
            )}
            {error && <p className="text-[12px] text-[#A85578] leading-snug mt-3">{error}</p>}
          </div>
        ) : sent ? (
          <div className="mt-4 space-y-3">
            <p className="text-[13px] text-ink leading-snug">
              ${sent.amount.toFixed(2)} is on its way to {sent.to.slice(0, 4)}...{sent.to.slice(-4)}. I paid the fee, so it cost you nothing extra.
            </p>
            <a href={sent.explorer} target="_blank" rel="noopener" className="inline-block text-[12.5px] font-semibold text-[#A85578] underline">
              See the receipt on Solana
            </a>
            <button type="button" onClick={onClose} className="w-full mt-2 rounded-full bg-ink text-paper py-3 text-[13px] font-semibold cursor-pointer active:scale-[0.98]">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-1.5 mt-4">
              {WHERE.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => { setWhere(w.id); setTo(''); setError(null); }}
                  className={`flex-1 text-[12px] py-2 rounded-full border cursor-pointer ${where === w.id ? 'bg-ink text-paper border-ink' : 'border-[#E6CFD6] text-ink'}`}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <p className="text-[11.5px] text-muted leading-snug mt-2.5">{hint}</p>

            <div className="mt-3 flex gap-2">
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="Solana address"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 min-w-0 rounded-xl border border-[#E6CFD6] bg-white px-3 py-2.5 text-[12.5px] font-mono text-ink"
              />
              <button type="button" onClick={paste} className="shrink-0 rounded-xl border border-[#E6CFD6] px-3 text-[12px] text-ink cursor-pointer">Paste</button>
            </div>
            {to && !looksLikeAddress(to) && <p className="text-[11.5px] text-[#A85578] mt-1.5">That doesn't look like a Solana address yet.</p>}

            <div className="mt-3 flex gap-2 items-center">
              <div className="flex-1 flex items-center rounded-xl border border-[#E6CFD6] bg-white px-3">
                <span className="text-[13px] text-muted">$</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                  inputMode="decimal"
                  placeholder="0.00"
                  className="flex-1 min-w-0 py-2.5 px-1 text-[14px] text-ink bg-transparent outline-none"
                />
                <span className="text-[11px] text-muted">USDC</span>
              </div>
              <button
                type="button"
                onClick={() => balance != null && setAmount(String(balance))}
                className="shrink-0 rounded-xl border border-[#E6CFD6] px-3 py-2.5 text-[12px] text-ink cursor-pointer"
              >
                All
              </button>
            </div>
            {balance != null && value > balance + 1e-9 && <p className="text-[11.5px] text-[#A85578] mt-1.5">That's more than you have.</p>}

            {error && <p className="text-[12px] text-[#A85578] leading-snug mt-3">{error}</p>}

            <button
              type="button"
              onClick={send}
              disabled={!ready || busy}
              className="w-full mt-4 rounded-full bg-ink text-paper py-3 text-[13px] font-semibold cursor-pointer disabled:opacity-40 active:scale-[0.98]"
            >
              {busy ? 'Sending...' : value > 0 ? `Send $${value.toFixed(2)}` : 'Send'}
            </button>
            <p className="text-[10.5px] text-muted text-center mt-2">Oira pays the network fee. You'll never need SOL for this.</p>
          </>
        )}
      </div>
    </div>
  );
};
