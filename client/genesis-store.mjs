// Genesis Token redemption store — tracks which Seeker Genesis Token mint addresses have
// already been used to claim the "Seeker holder" boosted-terms reward, so a single SGT
// (transferable between a user's own Seed Vault accounts, mint address constant across
// that transfer) can't unlock it twice from different accounts/devices.
// File-backed JSON for a single-box deploy; swap for a real DB when the bridge goes HA
// (matches campaign-store.mjs's own documented tradeoff).
import fs from 'fs';

const FILE = new URL('./genesis-redemptions.json', import.meta.url);

function load() { try { return JSON.parse(fs.readFileSync(FILE)); } catch { return {}; } }
function save(db) { fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }

export function isRedeemed(mint) {
  return Boolean(load()[mint]);
}

// Returns false if already redeemed (caller must not grant the reward again); true if this
// call is the one that claims it. Atomic w.r.t. the single-process file-backed store.
export function claim(mint, { wallet } = {}) {
  const db = load();
  if (db[mint]) return false;
  db[mint] = { wallet: wallet || null, claimedAt: Date.now() };
  save(db);
  return true;
}
