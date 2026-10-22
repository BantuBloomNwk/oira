import { useEffect, useState } from 'react';
import { REGION_CURRENCY } from './region-currency';
import { BRIDGE_ORIGIN, isNativeApp } from './native';

/* Her money, shown in the currency she chooses.
 *
 * She's paid in USDC, a digital dollar, and that stays what she holds. This only changes how it's
 * shown. Two settings: US dollars, or her local currency with the dollar amount beside it, because
 * some people always want to know the dollar figure. Switchable any time.
 *
 * The rates come from the bridge, which checks two independent sources against each other
 * (client/fx.mjs). The phone downloads the whole table, so nobody learns which currency she picked.
 * Every local amount is marked "≈": a rate is a snapshot, not a promise. If the rates are more than
 * a day old the app goes back to dollars rather than show a stale number. */

export interface Rate { rate: number; checked: boolean; source: string }
interface Table { at: number; base: 'USD'; rates: Record<string, Rate> }
export interface CurrencyPref { show: 'usd' | 'local'; code: string }

const PREF = 'oira_currency';
const CACHE = 'oira_fx';
const MAX_AGE = 24 * 3600_000;
const REFRESH_AFTER = 15 * 60_000;

const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/* Her country's currency, from her phone's language and region settings. Only a suggestion. */
export function suggestedCurrency(): string {
  const langs = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  for (const l of langs) {
    try {
      const region = new Intl.Locale(l).maximize().region;
      if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
    } catch { /* a malformed language tag */ }
  }
  return 'USD';
}

/* Her country, as a two-letter code, for counting interest. ZZ when the phone doesn't say. */
export function suggestedCountry(): string {
  const langs = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  for (const l of langs) {
    try { const r = new Intl.Locale(l).maximize().region; if (r && /^[A-Z]{2}$/.test(r)) return r; } catch { /* next */ }
  }
  return 'ZZ';
}

function loadPref(): CurrencyPref {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) || 'null');
    if (p && (p.show === 'usd' || p.show === 'local') && /^[A-Z]{3}$/.test(p.code)) return p;
  } catch { /* fall through */ }
  return { show: 'usd', code: suggestedCurrency() };
}
function loadCache(): Table | null {
  try {
    const t = JSON.parse(localStorage.getItem(CACHE) || 'null');
    return t && typeof t.at === 'number' && t.rates ? t : null;
  } catch { return null; }
}

let pref: CurrencyPref = loadPref();
let table: Table | null = loadCache();
let loading: Promise<void> | null = null;

export const getPref = (): CurrencyPref => pref;
export function setPref(next: Partial<CurrencyPref>): void {
  pref = { ...pref, ...next };
  try { localStorage.setItem(PREF, JSON.stringify(pref)); } catch { /* this session only */ }
  emit();
  if (pref.show === 'local') void refreshRates();
}

export function refreshRates(): Promise<void> {
  if (loading) return loading;
  if (table && Date.now() - table.at < REFRESH_AFTER) return Promise.resolve();
  loading = (async () => {
    try {
      const r = await fetch(`${isNativeApp() ? BRIDGE_ORIGIN : ''}/api/fx`, { cache: 'no-store' });
      if (!r.ok) return;
      const t = (await r.json()) as Table;
      if (!t || typeof t.at !== 'number' || !t.rates?.USD) return;
      table = t;
      try { localStorage.setItem(CACHE, JSON.stringify(t)); } catch { /* memory only */ }
      emit();
    } catch { /* keep what we had */ }
  })().finally(() => { loading = null; });
  return loading;
}

/* The rate to show with, or null when amounts should stay in dollars. */
export function activeRate(): (Rate & { code: string; at: number }) | null {
  if (pref.show !== 'local' || pref.code === 'USD' || !table) return null;
  if (Date.now() - table.at > MAX_AGE) return null;
  const r = table.rates[pref.code];
  return r && r.rate > 0 ? { ...r, code: pref.code, at: table.at } : null;
}

/* Every currency the rates cover, with its name in her language, for the picker. */
export function availableCurrencies(): Array<{ code: string; name: string }> {
  const codes = Object.keys(table?.rates || {}).sort();
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames(undefined, { type: 'currency' }); } catch { /* codes only */ }
  return codes.map((code) => ({ code, name: names?.of(code) || code }));
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const dollars = (n: number): string => usd.format(n);

export function local(n: number, code: string): string {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).format(n); }
  catch { return `${code} ${n.toFixed(2)}`; }
}

/* An amount in dollars, shown the way she chose: "$5.00", or "≈ ₦6,661 · $5.00". */
export function money(amountUsd: number): string {
  const r = activeRate();
  if (!r) return dollars(amountUsd);
  return `≈ ${local(amountUsd * r.rate, r.code)} · ${dollars(amountUsd)}`;
}

/* For components: re-render when her choice or the rates change. */
export function useCurrency() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    if (pref.show === 'local') void refreshRates();
    return () => { subs.delete(f); };
  }, []);
  return { money, pref: getPref(), rate: activeRate() };
}
