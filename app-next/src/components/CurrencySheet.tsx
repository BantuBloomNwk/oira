import React, { useEffect, useMemo, useState } from 'react';
import { availableCurrencies, dollars, local, refreshRates, setPref, useCurrency } from '../lib/currency';

/**
 * How her money is shown: US dollars, or her local currency with the dollar amount beside it.
 * She's always paid in USDC; this only changes what she sees, and it says so.
 */

interface CurrencySheetProps { onClose: () => void }

const minutesAgo = (at: number) => {
  const m = Math.max(0, Math.round((Date.now() - at) / 60_000));
  return m < 1 ? 'just now' : m === 1 ? 'a minute ago' : m < 60 ? `${m} minutes ago` : `${Math.round(m / 60)} hours ago`;
};

export const CurrencySheet: React.FC<CurrencySheetProps> = ({ onClose }) => {
  const { pref, rate } = useCurrency();
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const names = useMemo(() => {
    try { return new Intl.DisplayNames(undefined, { type: 'currency' }); } catch { return null; }
  }, []);
  const nameOf = (code: string) => names?.of(code) || code;
  const list = availableCurrencies().filter((c) => {
    const s = q.trim().toLowerCase();
    return !s || c.code.toLowerCase().includes(s) || c.name.toLowerCase().includes(s);
  });

  useEffect(() => { if (picking) void refreshRates(); }, [picking]);
  const choose = (code: string) => { setPref({ code, show: 'local' }); setPicking(false); setQ(''); };

  return (
    <div className="absolute inset-0 z-[60] bg-black/45 flex items-end justify-center">
      <div className="w-full max-w-[420px] bg-paper rounded-t-3xl px-5 pt-5 pb-7 max-h-[88%] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-[19px] text-ink" style={{ fontWeight: 600 }}>How your money's shown</h2>
          <button type="button" onClick={onClose} className="text-[12px] text-muted px-2 py-1 cursor-pointer">Close</button>
        </div>
        <p className="text-[12px] leading-[1.55] text-muted mt-1">
          You're always paid in USDC, a digital dollar. This only changes what you see.
        </p>

        {!picking ? (
          <>
            <div className="mt-4 space-y-2">
              {(['usd', 'local'] as const).map((show) => (
                <button
                  key={show}
                  type="button"
                  onClick={() => (show === 'local' && pref.code === 'USD' ? setPicking(true) : setPref({ show }))}
                  className={`w-full text-left rounded-2xl border px-4 py-3 cursor-pointer ${pref.show === show ? 'border-ink bg-white' : 'border-[#E6CFD6]'}`}
                >
                  <p className="text-[13px] text-ink font-semibold">
                    {show === 'usd' ? 'US dollars' : pref.code === 'USD' ? 'My local currency' : `${nameOf(pref.code)}, with dollars beside it`}
                  </p>
                  <p className="text-[11.5px] text-muted mt-0.5">
                    {show === 'usd' ? dollars(5) : pref.code === 'USD' ? 'Pick yours' : rate ? `${local(5 * rate.rate, pref.code)} · ${dollars(5)}` : `${pref.code} · ${dollars(5)}`}
                  </p>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setPicking(true); void refreshRates(); }} className="mt-3 text-[12.5px] font-medium text-[#A85578] cursor-pointer underline">
              Change currency
            </button>

            {pref.show === 'local' && (
              <p className="text-[11.5px] leading-snug text-muted mt-4">
                {!rate
                  ? "I can't get today's rates right now, so I'm showing dollars. I'll switch back as soon as I can."
                  : rate.checked
                    ? `1 US dollar ≈ ${local(rate.rate, rate.code)}. Checked against two separate sources, updated ${minutesAgo(rate.at)}.`
                    : `1 US dollar ≈ ${local(rate.rate, rate.code)}, updated ${minutesAgo(rate.at)}. The sources don't agree on this currency right now, so take it as a rough guide.`}
              </p>
            )}
          </>
        ) : (
          <div className="mt-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search, e.g. naira or NGN"
              autoFocus
              className="w-full rounded-xl border border-[#E6CFD6] bg-white px-3 py-2.5 text-[13px] text-ink"
            />
            <div className="mt-2 max-h-[46vh] overflow-y-auto divide-y divide-[#F0E1E6]">
              {list.length === 0 && <p className="text-[12px] text-muted py-3">Nothing matches that yet.</p>}
              {list.map((c) => (
                <button key={c.code} type="button" onClick={() => choose(c.code)} className="w-full flex items-center justify-between py-2.5 text-left cursor-pointer">
                  <span className="text-[13px] text-ink">{c.name}</span>
                  <span className="text-[11.5px] text-muted">{c.code}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setPicking(false)} className="w-full mt-3 py-2.5 text-[12.5px] text-muted cursor-pointer">Back</button>
          </div>
        )}
      </div>
    </div>
  );
};
