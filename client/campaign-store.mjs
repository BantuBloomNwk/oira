// Campaign store, persists posted brand campaigns so her overnight can match them later.
// Holds the commitment opening (target + offer_salt) the agent needs at match time. No secrets:
// the per-campaign brand key is derived from the offer_id on demand (see brandKeyFor in oira-chain).
// File-backed JSON for a single-box deploy; swap for a real DB when the bridge goes HA.
import fs from 'fs';

const FILE = new URL('./campaigns.json', import.meta.url);

function load() { try { return JSON.parse(fs.readFileSync(FILE)); } catch { return {}; } }
function save(db) { fs.writeFileSync(FILE, JSON.stringify(db, null, 2)); }

export function addCampaign(rec) {
  const db = load();
  db[rec.campaign] = { ...rec, createdAt: Date.now(), status: 'open', matchedAt: null };
  save(db);
  return db[rec.campaign];
}

export function listCampaigns() {
  return Object.values(load()).sort((a, b) => b.createdAt - a.createdAt);
}

export function getCampaign(pk) { return load()[pk] || null; }

export function updateCampaign(pk, patch) {
  const db = load();
  if (!db[pk]) return null;
  db[pk] = { ...db[pk], ...patch };
  save(db);
  return db[pk];
}
