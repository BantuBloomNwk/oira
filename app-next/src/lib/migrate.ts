import { b64, type Owner } from './owner';
import { unlockLocal, unlockOwner } from './custody';
import { isNativeApp, BRIDGE_ORIGIN } from './native';
import { loadProof, proofFrom, saveProof } from './proof';
import { rememberHer, rememberedHer } from './identity';
import { sealViaDevice } from './seal';
import { fetchBalance, sendUsdc } from './send';
import { saveRulesToPalette } from './rulesync';
import { load as loadRemembered } from './remember';
import { monkFromIta } from './monk';
import { undertoneCode, seasonCode } from './traitcodes';
import { loadMigration, saveMigration, migrationFinished, loadSealedTraits, type MigrationState } from './migration-state';
import { undertoneFrom } from './skin';
import { diag } from './diag';

/* Moving her from the device key to a passkey.
 *
 * She sealed on this phone's device key before the app could make passkeys. A passkey is a
 * different key, so a different address, and the device key can't follow her to a new phone.
 * The move:
 *   1. makes her passkey (one fingerprint),
 *   2. seals the reading she already has under it (no new scan),
 *   3. sends any money from the old address to the new one (Oira pays the fee),
 *   4. puts her rules on the new Palette,
 *   5. tells the bridge to stop sending brands to the old address.
 * Each step is recorded as it finishes, so an interruption picks up where it stopped. Until the
 * last step she stays on the device key, so a half-done move never strands her seal. The device
 * key itself is kept on the phone. */

export type Step = 'passkey' | 'sealed' | 'moved' | 'rules' | 'retired';

export interface MoveOptions {
  rules?: { minPayout: number; maxPerBrand: number } | null;
  onStep?: (s: Step) => void;
}

/* Is there something to move? Only in the app (passkeys go through Android there), only once
   she has sealed, and only if she sealed on the device key. */
export async function canMigrate(): Promise<boolean> {
  if (!isNativeApp() || migrationFinished() || !loadProof()) return false;
  const her = rememberedHer();
  if (!her) return false;
  const local = await unlockLocal();
  return her === local.address;
}

/* Exactly what she sealed, when the app saved it (every seal since 1.5.5 does). For older seals,
   the same categories rebuilt from her stored reading with the scanner's own functions. */
function traitsFromReading(): { undertone: number; depth: number; season: number } {
  const saved = loadSealedTraits();
  if (saved) return saved;
  const r = loadRemembered();
  if (!r || !r.read) throw new Error("I can't find your reading on this phone, so there's nothing to move yet.");
  const sealed = r.reading?.sealed ?? null;
  return {
    undertone: undertoneCode(sealed ? undertoneFrom(sealed.lab.a, sealed.lab.b) : 'warm'),
    depth: Math.max(1, Math.min(10, sealed ? monkFromIta(sealed.ita) : 6)),
    season: seasonCode(r.seasonId || r.profile?.seasonId || ''),
  };
}

async function retire(oldOwner: Owner, to: string): Promise<void> {
  const time = Date.now();
  const sig = await oldOwner.sign(new TextEncoder().encode(`oira:retire:v1\n${oldOwner.address}\n${to}\n${time}`));
  const r = await fetch(`${isNativeApp() ? BRIDGE_ORIGIN : ''}/api/me/retire`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner: oldOwner.address, to, time, sig: b64.enc(sig) }),
  });
  if (r.ok) return;
  /* Only the bridge's own "nothing to retire" counts as done. A bridge without this route also
     answers 404, and treating that as done would leave brands asking the old address. */
  let body: { error?: string } = {};
  try { body = await r.json(); } catch { /* not the bridge's answer */ }
  if (r.status === 404 && body.error === 'nothing to retire') return;
  throw new Error("Your new Palette is ready, but I couldn't tidy up the old one yet. Tap again in a minute.");
}

/* Run the move, or finish one that was interrupted. Returns her new passkey identity. */
export async function migrateToPasskey({ rules, onStep }: MoveOptions = {}): Promise<Owner> {
  const oldOwner = await unlockLocal();
  onStep?.('passkey');
  const next = await unlockOwner();
  if (next.assurance !== 'passkey') throw new Error("This phone couldn't make a passkey, so you're staying as you are. Nothing changed.");
  if (next.address === oldOwner.address) throw new Error('That came back as the same key, so there was nothing to move.');

  let m: MigrationState = loadMigration() ?? { from: oldOwner.address, to: next.address, done: [] };
  if (m.from !== oldOwner.address || m.to !== next.address) m = { from: oldOwner.address, to: next.address, done: [] };
  const mark = (s: MigrationState['done'][number]) => { if (!m.done.includes(s)) m.done.push(s); saveMigration(m); onStep?.(s); };
  diag('migrate', `moving ${oldOwner.address.slice(0, 6)} to ${next.address.slice(0, 6)}, done so far: ${m.done.join(',') || 'nothing'}`);

  if (!m.done.includes('sealed')) {
    const done = await sealViaDevice(next, { traits: traitsFromReading() });
    const p = proofFrom(done);
    if (p) saveProof(p);
    mark('sealed');
  }
  if (!m.done.includes('moved')) {
    const balance = await fetchBalance(oldOwner.address);
    if (balance > 0) await sendUsdc(oldOwner, next.address, Math.floor(balance * 1e6) / 1e6);
    mark('moved');
  }
  if (!m.done.includes('rules')) {
    if (rules) await saveRulesToPalette(next, rules);
    mark('rules');
  }
  if (!m.done.includes('retired')) {
    await retire(oldOwner, next.address);
    mark('retired');
  }
  rememberHer(next.address);
  saveMigration({ ...m, finishedAt: Date.now() });
  diag('migrate', 'finished');
  return next;
}
