// Brand briefs and the women they can be asked of.
//
// women.json holds sealed palette owners only: public addresses that are on chain anyway, and the
// public half of each woman's inbox key. Never a name, a reading or a trait.
// briefs.json holds each brand brief and its totals. It never says who was asked, and a brief's
// target shade is erased once it finishes, so the server can't pair a woman with a shade.
// inbox.json holds, per woman, what brands asked her, encrypted to her inbox key. Only her phone
// can open it; the server can count her entries and see when they came, nothing more.
// All three live in OIRA_DATA_DIR so a container rebuild does not lose them.
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import nacl from 'tweetnacl';
import { fileURLToPath } from 'url';

const DIR = process.env.OIRA_DATA_DIR || path.dirname(fileURLToPath(import.meta.url));
const WOMEN = path.join(DIR, 'women.json');
const BRIEFS = path.join(DIR, 'briefs.json');
const INBOX = path.join(DIR, 'inbox.json');
const INBOX_MAX = 200; // per woman, newest kept

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

/* The public half of her inbox key, registered by a request she signed. */
export function setInboxKey(owner, key) {
  const db = load(WOMEN);
  if (!db[owner]) return false;
  db[owner] = { ...db[owner], inbox: key, lastSeenAt: Date.now() };
  save(WOMEN, db);
  return true;
}
export function inboxKeyFor(owner) { return load(WOMEN)[owner]?.inbox || null; }

/* One sealed entry for her: already encrypted to her key before it gets here. */
export function addInboxEntry(owner, entry) {
  const db = load(INBOX);
  db[owner] = [...(db[owner] || []), { ...entry, at: Date.now() }].slice(-INBOX_MAX);
  save(INBOX, db);
}
export function inboxFor(owner) { return load(INBOX)[owner] || []; }

/* What brands asked her, sealed to her inbox key with a throwaway key per entry. The server
   can't open it again once written. No key registered yet: nothing is kept about her. */
export function sealForHer(owner, entry) {
  const key = inboxKeyFor(owner);
  if (!key) return false;
  const eph = nacl.box.keyPair();
  const n = nacl.randomBytes(nacl.box.nonceLength);
  const c = nacl.box(Buffer.from(JSON.stringify(entry)), n, Buffer.from(key, 'base64'), eph.secretKey);
  addInboxEntry(owner, { n: Buffer.from(n).toString('base64'), e: Buffer.from(eph.publicKey).toString('base64'), c: Buffer.from(c).toString('base64') });
  return true;
}

export function addBrief(b) {
  const db = load(BRIEFS);
  const id = randomUUID();
  db[id] = { id, ...b, status: 'open', results: { asked: 0, yes: 0, no: 0, turnedAway: 0, paid: 0 }, createdAt: Date.now() };
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
/* Count one answer against a brief. Who answered is not recorded here. */
export function addResult(id, outcome, amount = 0) {
  const db = load(BRIEFS);
  const b = db[id];
  if (!b) return null;
  const r = b.results || { asked: 0, yes: 0, no: 0, turnedAway: 0, paid: 0 };
  r.asked += 1;
  if (outcome === 'yes') { r.yes += 1; r.paid += amount || 0; }
  else if (outcome === 'no') r.no += 1;
  else if (outcome === 'declined') r.turnedAway += 1;
  b.results = r;
  save(BRIEFS, db);
  return b;
}

/* A finished brief keeps its totals and forgets its target shade. */
export function finishBrief(id) {
  const db = load(BRIEFS);
  if (!db[id]) return null;
  const { target, ...rest } = db[id];
  db[id] = { ...rest, status: 'done', finishedAt: Date.now() };
  save(BRIEFS, db);
  return db[id];
}

/* One-off: briefs written before inboxes kept a readable line per woman asked. Turn those into
   totals and drop them, and drop the shade of anything already finished. Safe to run every start. */
export function migrateBriefs() {
  const db = load(BRIEFS);
  let changed = 0;
  for (const b of Object.values(db)) {
    if (Array.isArray(b.asks)) {
      const asks = b.asks.filter((a) => a.outcome !== 'unavailable' && a.outcome !== 'error');
      b.results = { asked: asks.length, yes: asks.filter((a) => a.outcome === 'yes').length, no: asks.filter((a) => a.outcome === 'no').length,
        turnedAway: asks.filter((a) => a.outcome === 'declined').length, paid: asks.reduce((t, a) => t + (a.outcome === 'yes' ? a.amount || 0 : 0), 0) };
      delete b.asks;
      changed++;
    }
    if (b.status === 'done' && b.target) { delete b.target; changed++; }
  }
  if (changed) save(BRIEFS, db);
  return changed;
}
