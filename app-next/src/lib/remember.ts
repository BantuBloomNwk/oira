/**
 * What the app remembers about her between visits.
 *
 * It remembered nothing. Every reload started at the splash, walked her through the intro
 * again and opened the camera at a woman who had already been read, which is the app failing
 * to recognise somebody it had spent three minutes getting to know. Her key survived a reload
 * because custody.ts writes it down; her colours did not, because nothing wrote them down.
 *
 * WHAT IS KEPT, and it is the same test as everywhere else in this product: would she be
 * upset to learn it was on her phone? Her name, her season, her curl, what she said she uses,
 * and her sealed readings. All of it is either something she typed or something she was shown
 * and confirmed. There is no image here, no landmark, no raw measurement beyond the sealed
 * reading, which was designed to be stored and carries its own confidence and capture path.
 *
 * WHERE IT IS KEPT: localStorage, on her phone, like everything else. Deleting it is
 * `deleteEverything()` in identity.ts, which clears the lot rather than picking through keys.
 *
 * Versioned. A shape change bumps VERSION and old state is dropped rather than half-read,
 * because a half-read profile is worse than a fresh one: she would get somebody else's season
 * and no way to tell it was wrong.
 */

import type { SealedReading } from './confidence';
import type { UserProfile } from '../types';

const KEY = 'oira.her';
const VERSION = 1;

export interface Remembered {
  v: number;
  /* She has completed a reading. The one flag routing turns on: it is what sends her to her
     palette instead of the camera. */
  read: boolean;
  profile: UserProfile;
  seasonId: string;
  /* The coarse words from her reading, the ones the concierge is allowed to know. */
  reading: {
    curl?: string;
    curlFamily?: string;
    skinDryness?: string;
    skinShine?: string;
    skinBlemish?: boolean;
    sealed?: SealedReading;
    history?: SealedReading[];
  };
}

export function load(): Remembered | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Remembered;
    /* An old or unrecognisable shape is dropped, not repaired. */
    if (!parsed || parsed.v !== VERSION || !parsed.profile) return null;
    return parsed;
  } catch {
    /* Private mode, or storage refused. She is treated as new, which is correct: we genuinely
       do not know her here. */
    return null;
  }
}

export function save(state: Omit<Remembered, 'v'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, ...state }));
  } catch {
    /* Full or refused. The session still works; she just starts fresh next time. Not worth
       interrupting her to say so. */
  }
}

export function forget(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored is the outcome asked for */ }
}

/* Has she been read before, cheaply, for the one decision that has to happen before the first
   render: does she see a splash and an intro, or her own palette? */
export function hasBeenReadBefore(): boolean {
  return load()?.read === true;
}
