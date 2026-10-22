// Counting interest in features that don't exist yet (cash out to a bank, to start with).
// One number per feature per country. No address, no IP address, no device id is stored: the
// count is all there is.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = process.env.OIRA_DATA_DIR || path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(DIR, 'interest.json');
export const KINDS = new Set(['cashout']);

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; } }
export function countInterest(kind, country) {
  const db = load();
  db[kind] = db[kind] || {};
  db[kind][country] = (db[kind][country] || 0) + 1;
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(db, null, 2));
  fs.renameSync(`${FILE}.tmp`, FILE);
  return db[kind][country];
}
export function interestCounts() { return load(); }
