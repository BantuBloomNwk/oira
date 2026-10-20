/* Oira can pay her, so it's for adults, and the store policy says no data from minors. She's
   asked once, before anything about her is read or made. Kept with her other local data, so
   Delete everything asks again. */
const KEY = 'oira_age_ok';

export function ageConfirmed(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function confirmAge(): void {
  try { localStorage.setItem(KEY, '1'); } catch { /* asked again next time, which is fine */ }
}
