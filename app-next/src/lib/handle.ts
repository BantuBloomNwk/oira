/**
 * A name to be known by, that is not a wallet address.
 *
 * The header showed her a truncated public key. That is what she is on the ledger and it
 * is nobody's name. She gets to pick something, and if she cannot be bothered right now,
 * which is most people most of the time, she gets one that is at least fun to be stuck
 * with until she changes it.
 *
 * The vocabulary is the app's own: shades, textures, light and the hours of the day. No
 * animals, no adjectives about her body, and nothing that reads as a password generator
 * having a go at being friendly.
 */

const FIRST = [
  'velvet', 'satin', 'plum', 'blush', 'gilded', 'moonlit', 'soft', 'sun',
  'rose', 'amber', 'cocoa', 'honey', 'noir', 'silk', 'pearl', 'copper',
  'midnight', 'golden', 'dusk', 'linen', 'clove', 'ember', 'muted', 'glazed',
];

const SECOND = [
  'hour', 'edge', 'season', 'finish', 'petal', 'light', 'shade', 'bloom',
  'glow', 'note', 'wave', 'coil', 'ink', 'thread', 'wash', 'sheen',
  'stone', 'flare', 'tide', 'weather', 'letter', 'window',
];

const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/* Two words and a number. The number is there so two women on the same day are not handed
   the same handle, not because anybody wants digits in their name; it is dropped whenever
   the pairing is unusual enough to stand on its own. */
export function generateHandle(): string {
  const a = pick(FIRST);
  const b = pick(SECOND);
  const bare = Math.random() < 0.35;
  return bare ? `${a}${b}` : `${a}${b}${Math.floor(Math.random() * 90) + 10}`;
}

/* What she is allowed to type. Loose on purpose: this is a name, not a login. Only the
   things that would break a layout or a URL are taken out. */
export function cleanHandle(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N}._ -]/gu, '')
    .replace(/\s+/g, ' ')
    .trimStart()
    .slice(0, 22);
}

export const HANDLE_MAX = 22;
