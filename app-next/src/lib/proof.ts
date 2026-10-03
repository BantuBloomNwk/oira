/* Her seal, in words she can use, with the evidence one tap away.
 *
 * The bridge answers a seal with addresses and a signature. None of that means anything to
 * the woman holding the phone, so the screens say what happened in a sentence and keep the
 * proof behind a link for anyone who wants to check. What is kept is only what makes the
 * link work: her palette account and when it was sealed. Not her reading.
 *
 * The link goes to the account, not the seal signature, on purpose. The seal runs inside
 * the private rollup, so its signature is not on the main chain and a link to it would show
 * "not found". The account is, and it shows who holds it now: the rollup, not us. */

import type { SealResult } from './seal';

export interface Proof {
  /** Her palette account on Solana. */
  palette: string;
  /** Where to check it. */
  url: string;
  /** When it was sealed, ms since epoch. */
  at: number;
}

const KEY = 'oira_proof';
const EXPLORER = 'https://explorer.solana.com/address/';

export function proofFrom(done: SealResult): Proof | null {
  const palette = typeof done.palette === 'string' ? done.palette : '';
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(palette)) return null;
  const given = typeof done.explorer === 'string' ? done.explorer : '';
  const url = given.startsWith(EXPLORER) ? given : `${EXPLORER}${palette}?cluster=devnet`;
  return { palette, url, at: Date.now() };
}

export function saveProof(p: Proof): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* the screen still shows it this time */ }
}

export function loadProof(): Proof | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    return p && typeof p.url === 'string' && p.url.startsWith(EXPLORER) ? (p as Proof) : null;
  } catch {
    return null;
  }
}

export function clearProof(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

/** "today at 3:42 pm", or the date if it was another day. */
export function whenSealed(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const today = new Date().toDateString() === d.toDateString();
  return today ? `today at ${time}` : `${d.toLocaleDateString([], { day: 'numeric', month: 'long' })} at ${time}`;
}
