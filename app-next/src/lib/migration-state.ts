/* Where her move from the device key to a passkey stands. Kept apart from migrate.ts so identity.ts
   can read it without importing the whole move. */
const KEY = 'oira_migration';

export interface MigrationState {
  /** The device-key address she sealed with. */
  from: string;
  /** Her new passkey address. */
  to: string;
  /** Finished steps, in order. */
  done: Array<'sealed' | 'moved' | 'rules' | 'retired'>;
  /** Set once every step has finished. Until then she stays on the device key. */
  finishedAt?: number;
}

export function loadMigration(): MigrationState | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function saveMigration(m: MigrationState): void {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* resumes from the start next time, which is safe */ }
}

export function migrationFinished(): boolean {
  return !!loadMigration()?.finishedAt;
}

/* The three categories her seal carried, saved at every seal so a later move re-seals exactly the
   same thing rather than re-deriving it. Categories only, never a measurement. */
const TRAITS = 'oira_sealed_traits';
export interface SealedTraits { undertone: number; depth: number; season: number }
export function saveSealedTraits(t: SealedTraits): void {
  try { localStorage.setItem(TRAITS, JSON.stringify(t)); } catch { /* re-derived from her reading if lost */ }
}
export function loadSealedTraits(): SealedTraits | null {
  try { return JSON.parse(localStorage.getItem(TRAITS) || 'null'); } catch { return null; }
}
