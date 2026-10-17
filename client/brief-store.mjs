// Brand briefs and the women they can be asked of.
//
// women.json holds sealed palette owners only: public addresses that are on chain anyway, never
// a name, a reading or a trait. briefs.json holds each brand brief and, per woman asked, the
// outcome. Both live in OIRA_DATA_DIR so a container rebuild does not lose them.
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

const DIR = process.env.OIRA_DATA_DIR || path.dirname(fileURLToPath(import.meta.url));
const WOMEN = path.join(DIR, 'women.json');
const BRIEFS = path.join(DIR, 'briefs.json');

function load(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
function save(file, db) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

export function registerWoman(owner) {
  if (!owner) return;
  const db = load(WOMEN);
  const now = Date.now();
  db[owner] = { firstSealedAt: db[owner]?.firstSealedAt ?? now, lastSeenAt: now };
  save(WOMEN, db);
}
export function listWomen() { return Object.keys(load(WOMEN)); }

export function addBrief(b) {
  const db = load(BRIEFS);
  const id = randomUUID();
  db[id] = { id, ...b, status: 'open', asks: [], createdAt: Date.now() };
  save(BRIEFS, db);
  return db[id];
}
export function getBrief(id) { return load(BRIEFS)[id] || null; }
export function listBriefs() { return Object.values(load(BRIEFS)).sort((a, b) => b.createdAt - a.createdAt); }
export function updateBrief(id, patch) {
  const db = load(BRIEFS);
  if (!db[id]) return null;
  db[id] = { ...db[id], ...patch };
  save(BRIEFS, db);
  return db[id];
}
export function addAsk(id, ask) {
  const db = load(BRIEFS);
  if (!db[id]) return null;
  db[id].asks = [...(db[id].asks || []), { ...ask, at: Date.now() }];
  save(BRIEFS, db);
  return db[id];
}

/* Everything one woman has been asked, newest first. */
export function answersFor(owner) {
  const out = [];
  for (const b of listBriefs()) {
    for (const a of b.asks || []) {
      if (a.owner === owner && a.outcome !== 'unavailable' && a.outcome !== 'error') out.push({ brief: b, ask: a });
    }
  }
  return out.sort((x, y) => y.ask.at - x.ask.at);
}
