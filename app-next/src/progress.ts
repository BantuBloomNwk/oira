/* The open study's live totals, for anyone: women, judges, investors. Reads the same public
   count the study server gives out, so what this page says and what the data says can never
   drift apart. Refreshes every minute. */

import './fonts.css';
import { MONK_SWATCHES } from './lib/monk';

type Count = {
  women?: number; countries?: number; submissions: number; readings: number; phoneModels: number; byMake?: Record<string, number>;
  byShade: Record<string, number>; byPlatform: Record<string, number>;
  byCountry: Record<string, number>; byDay: Record<string, number>;
  first: string | null; last: string | null; updated: string;
};

const $ = (id: string) => document.getElementById(id)!;
const NAMES: Record<string, string> = {
  NG: 'Nigeria', MY: 'Malaysia', US: 'United States', GB: 'United Kingdom', GH: 'Ghana', KE: 'Kenya',
  ZA: 'South Africa', IN: 'India', ID: 'Indonesia', PH: 'Philippines', SG: 'Singapore', CA: 'Canada',
  FR: 'France', BR: 'Brazil', AE: 'UAE', other: 'Other', 'not said': 'Not said',
};
const PHONES: Record<string, string> = { android: 'Android', ios: 'iPhone', ipad: 'iPad', desktop: 'Computer', other: 'Other' };

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
};

function rows(el: HTMLElement, data: Record<string, number>, names: Record<string, string>) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  el.innerHTML = entries.length
    ? entries.map(([k, v]) => `<div><span>${names[k] ?? k}</span><b>${v}</b></div>`).join('')
    : '<div class="empty">None yet</div>';
}

async function load() {
  let c: Count;
  try {
    const r = await fetch('/api/study/count', { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    c = await r.json();
  } catch {
    $('updated').textContent = "Couldn't reach the study server just now. Trying again shortly.";
    return;
  }
  $('s-women').textContent = (c.women ?? c.submissions).toLocaleString();
  $('s-readings').textContent = c.readings.toLocaleString();
  $('s-models').textContent = c.phoneModels.toLocaleString();
  $('s-countries').textContent = String(c.countries ?? Object.keys(c.byCountry).filter((k) => k !== 'not said' && k !== 'other').length);
  $('updated').textContent = c.last
    ? `Live. Last woman joined ${ago(c.last)}. Updated ${new Date(c.updated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
    : 'Live. The study opened on 5 October 2026. Be one of the first.';

  const max = Math.max(1, ...Object.values(c.byShade));
  $('shades').innerHTML = MONK_SWATCHES.map((hex, i) => {
    const n = c.byShade[String(i + 1)] || 0;
    return `<div class="shade"><span class="n">${n}</span><div class="bar" style="height:${Math.max(3, (n / max) * 100)}%;background:${hex}"></div><span class="k">${i + 1}</span></div>`;
  }).join('');

  rows($('phones'), c.byPlatform, PHONES);
  rows($('makers'), c.byMake ?? {}, { unknown: 'Not known' });
  rows($('countries'), c.byCountry, NAMES);

  const days = Object.entries(c.byDay).sort(([a], [b]) => a.localeCompare(b));
  const dmax = Math.max(1, ...days.map(([, v]) => v));
  $('days').innerHTML = days.length
    ? days.map(([d, v]) => `<div title="${d}: ${v}" style="height:${(v / dmax) * 100}%"></div>`).join('')
    : '<div class="empty" style="background:none;flex:1">The first day is today.</div>';
  $('days-range').textContent = days.length ? `${days[0][0]} to ${days[days.length - 1][0]}` : '';
}

void load();
setInterval(load, 60_000);
