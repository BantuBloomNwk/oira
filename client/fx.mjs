// Exchange rates for showing her money in her own currency.
//
// Two independent sources, checked against each other:
//   - Coinbase's USD rates: live, and the market rate she would actually get turning USDC into cash.
//   - open.er-api.com: a daily reference rate for about 160 currencies.
// Coinbase leads where it has the currency; the reference fills the rest. Where both have it and they
// differ by more than 2%, the rate is sent with checked: false so the app can say it's unconfirmed.
// Refreshed every 15 minutes; a failed fetch keeps the last good table. The phone downloads the whole
// table, so the server never learns which currency she picked.
const COINBASE = 'https://api.coinbase.com/v2/exchange-rates?currency=USD';
const REFERENCE = 'https://open.er-api.com/v6/latest/USD';
const REFRESH_MS = 15 * 60_000;
const TOLERANCE = 0.02;

// Real currencies only: Coinbase's list mixes in hundreds of crypto tickers.
const NOT_MONEY = new Set(['XDR', 'XAU', 'XAG', 'XPT', 'XPD', 'XSU', 'XUA', 'XBA', 'XBB', 'XBC', 'XBD', 'XTS', 'XXX']); // accounting units and metals
const ISO = new Set(Intl.supportedValuesOf('currency').filter((c) => !NOT_MONEY.has(c)));

let table = null; // { at, base: 'USD', rates: { CODE: { rate, checked, source } } }
let inflight = null; // one fetch at a time; callers during it share its result

async function getJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

export function buildTable(live, reference, now = Date.now()) {
  const rates = {};
  const codes = new Set([...Object.keys(live || {}), ...Object.keys(reference || {})]);
  for (const code of codes) {
    if (!ISO.has(code)) continue;
    const a = Number(live?.[code]);
    const b = Number(reference?.[code]);
    const okA = Number.isFinite(a) && a > 0, okB = Number.isFinite(b) && b > 0;
    if (!okA && !okB) continue;
    if (okA && okB) rates[code] = { rate: a, checked: Math.abs(a - b) / b <= TOLERANCE, source: 'both' };
    else if (okA) rates[code] = { rate: a, checked: false, source: 'live' };
    else rates[code] = { rate: b, checked: false, source: 'reference' };
  }
  rates.USD = { rate: 1, checked: true, source: 'both' };
  return { at: now, base: 'USD', rates };
}

export function refreshFx() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [live, reference] = await Promise.allSettled([getJson(COINBASE), getJson(REFERENCE)]);
      const l = live.status === 'fulfilled' ? live.value?.data?.rates : null;
      const r = reference.status === 'fulfilled' && reference.value?.result === 'success' ? reference.value.rates : null;
      if (l || r) table = buildTable(l, r);
    } catch { /* keep the last good table */ }
    return table;
  })().finally(() => { inflight = null; });
  return inflight;
}

export function fxTable() {
  if (!table || Date.now() - table.at > REFRESH_MS) refreshFx();
  return table;
}

refreshFx();
setInterval(refreshFx, REFRESH_MS).unref();
