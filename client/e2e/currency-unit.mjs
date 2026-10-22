// Showing her money in her own currency: the bridge's rate table and the app's formatting.
//
//   node e2e/currency-unit.mjs   (needs app-next's packages)
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { buildTable } from '../fx.mjs';

let failed = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

console.log('\nThe rate table (two sources, checked against each other):');
const t = buildTable(
  { NGN: '1332.2', MYR: '4.08', BTC: '0.00001', JPY: '157.2', VES: '880', SOL: '0.005' },
  { NGN: 1334.4, MYR: 4.081, JPY: 158.1, VES: 1200, GHS: 11.7, XDR: 0.7 },
  1_000,
);
check('a currency both sources agree on is marked checked, using the live rate', t.rates.NGN.rate === 1332.2 && t.rates.NGN.checked === true);
check('one where they differ by more than 2% is kept but marked unconfirmed', t.rates.VES.rate === 880 && t.rates.VES.checked === false);
check('one only the reference has is used, marked unconfirmed', t.rates.GHS.rate === 11.7 && t.rates.GHS.checked === false);
check('crypto tickers are left out', !('BTC' in t.rates) && !('SOL' in t.rates));
check('accounting units are left out', !('XDR' in t.rates));
check('the dollar is always there, at 1', t.rates.USD.rate === 1);

// The app's own currency.ts, bundled, with the phone's language and storage stood in.
const appNext = new URL('../../app-next/', import.meta.url).pathname;
const esbuild = createRequire(path.join(appNext, 'package.json'))('esbuild');
const bundle = new URL(`./.currency-${process.pid}.mjs`, import.meta.url).pathname;
await esbuild.build({
  entryPoints: [path.join(appNext, 'src/lib/currency.ts')], bundle: true, format: 'esm', platform: 'node', outfile: bundle, logLevel: 'error',
  plugins: [{ name: 'native', setup(b) {
    b.onResolve({ filter: /^(\.\/native|react)$/ }, (a) => ({ path: a.path, namespace: 'stand-in' }));
    b.onLoad({ filter: /.*/, namespace: 'stand-in' }, (a) => ({ loader: 'js', contents: a.path === 'react'
      ? 'export const useState = (v) => [v, () => {}]; export const useEffect = () => {};'
      : "export const isNativeApp = () => false; export const BRIDGE_ORIGIN = '';" }));
  } }],
});
process.on('exit', () => { try { fs.unlinkSync(bundle); } catch {} });

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const setLang = (l) => Object.defineProperty(globalThis, 'navigator', { value: { language: l, languages: [l] }, configurable: true });
const fresh = { at: Date.now(), base: 'USD', rates: { USD: { rate: 1, checked: true }, NGN: { rate: 1332.2, checked: true }, MYR: { rate: 4.08, checked: true }, JPY: { rate: 157.2, checked: true } } };
mem.set('oira_fx', JSON.stringify(fresh));
setLang('en-NG');
const c = await import(bundle + `?a=${Date.now()}`);

console.log('\nWhat she sees:');
check('a phone set to English (Nigeria) suggests naira', c.suggestedCurrency() === 'NGN');
setLang('ms-MY'); check('Malay (Malaysia) suggests ringgit', c.suggestedCurrency() === 'MYR');
setLang('en'); check('a language with no country suggests the country it implies (en means the US)', c.suggestedCurrency() === 'USD');
setLang('en-NG');
check('by default amounts are in dollars', c.money(5) === '$5.00');
c.setPref({ show: 'local', code: 'NGN' });
check('switched to naira, the dollar amount stays beside it', /^≈ .*6,661.* · \$5\.00$/.test(c.money(5)));
c.setPref({ code: 'JPY' });
check('yen has no decimals', /^≈ .*786 · \$5\.00$/.test(c.money(5)) && !/786\./.test(c.money(5)));
c.setPref({ show: 'usd' });
check('switched back, it is dollars only', c.money(5) === '$5.00');
c.setPref({ show: 'local', code: 'MYR' });
mem.set('oira_fx', JSON.stringify({ ...fresh, at: Date.now() - 25 * 3600_000 }));
const c2 = await import(bundle + `?b=${Date.now()}`);
check('rates over a day old fall back to dollars rather than a stale number', c2.money(5) === '$5.00');

console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
