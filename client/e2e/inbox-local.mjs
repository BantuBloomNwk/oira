// Her answers, sealed to her phone. Runs a local bridge on a throwaway data folder, no chain.
//
// Before this, the server kept a readable line per woman per brief, and each brief kept the shade
// it asked about, so the server could pair her address with her colouring. This checks:
//   - old briefs are turned into totals on start, and a finished brief forgets its shade
//   - only a request she signed can register her inbox key, and only once she has sealed
//   - an answer sealed to her key comes back to the app, which opens it; the stored copy is unreadable
//   - the overnight count still works, and a finished brief can't be asked again
//
//   node e2e/inbox-local.mjs

import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const PORT = 18777;
const BASE = `http://127.0.0.1:${PORT}`;
const BRAND_KEY = `test-${process.pid}-${Date.now()}`; // a throwaway brand key for this local bridge only
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oira-inbox-'));
const her = Keypair.generate(), stranger = Keypair.generate();
const owner = her.publicKey.toBase58();
const b64 = (u) => Buffer.from(u).toString('base64');

let failed = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };

// The data as an older bridge left it: a readable line per woman asked, and the shade kept.
fs.writeFileSync(path.join(dir, 'women.json'), JSON.stringify({ [owner]: { firstSealedAt: 1, lastSeenAt: 1 } }));
fs.writeFileSync(path.join(dir, 'briefs.json'), JSON.stringify({
  done1: { id: 'done1', label: 'Glow Co', category: 0, payout: 5, reach: 2, status: 'done', createdAt: 1, target: { tu: 0, td: 8, ts: 8, tol: 1 },
    asks: [{ owner, outcome: 'yes', amount: 5, at: 2 }, { owner: stranger.publicKey.toBase58(), outcome: 'no', at: 3 }, { owner: 'x', outcome: 'error', at: 4 }] },
  open1: { id: 'open1', label: 'Lip Lab', category: 2, payout: 3, reach: 1, status: 'open', createdAt: 5, target: { tu: 2, td: 4, ts: 3, tol: 1 }, asks: [] },
}));

const srv = spawn(process.execPath, [new URL('../server.mjs', import.meta.url).pathname], {
  env: { ...process.env, OIRA_DATA_DIR: dir, OIRA_PORT: String(PORT), OIRA_DEPLOYER_KEY: JSON.stringify([...Keypair.generate().secretKey]), OIRA_BRAND_KEY: BRAND_KEY, OIRA_NOTIFY_SECRET: BRAND_KEY + '-notify' },
  stdio: 'ignore', detached: true,
});
const stop = () => { try { process.kill(-srv.pid, 'SIGTERM'); } catch {} };
process.on('exit', stop);
for (let i = 0; ; i++) {
  try { await fetch(`${BASE}/api/brand/campaigns`); break; } catch { if (i > 60) throw new Error('bridge never came up'); await new Promise((r) => setTimeout(r, 500)); }
}

console.log('\nOld records:');
const briefs = JSON.parse(fs.readFileSync(path.join(dir, 'briefs.json'), 'utf8'));
check('per-woman lines are gone from every brief', !Object.values(briefs).some((b) => 'asks' in b));
check('their totals survive (2 asked, 1 yes, $5 paid)', briefs.done1.results.asked === 2 && briefs.done1.results.yes === 1 && briefs.done1.results.paid === 5);
check('a finished brief no longer holds its shade', !('target' in briefs.done1));
check('a brief still to run keeps its shade', !!briefs.open1.target);
check('nothing on disk pairs her address with a brief', !fs.readFileSync(path.join(dir, 'briefs.json'), 'utf8').includes(owner));

console.log('\nRegistering her inbox key:');
const inbox = nacl.box.keyPair();
const register = async (signer, who, key) => {
  const time = Date.now();
  const sig = nacl.sign.detached(Buffer.from(`oira:inbox-key:v1\n${who}\n${key}\n${time}`), signer.secretKey);
  return (await fetch(`${BASE}/api/me/inbox`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: who, time, key, sig: b64(sig) }) })).status;
};
check('someone else cannot point her answers at their key', (await register(stranger, owner, b64(nacl.box.keyPair().publicKey))) === 401);
check('a wallet that never sealed cannot register', (await register(stranger, stranger.publicKey.toBase58(), b64(inbox.publicKey))) === 404);
check('her own signed request registers it', (await register(her, owner, b64(inbox.publicKey))) === 200);

console.log('\nAn answer, sealed:');
process.env.OIRA_DATA_DIR = dir;
const store = await import(new URL('../brief-store.mjs', import.meta.url).pathname + `?${Date.now()}`);
const entry = { brand: 'Lip Lab', category: 'Lipstick', season: 'Deep Autumn', payout: 3, outcome: 'yes', reason: null, amount: 3, explorer: null };
check('the bridge seals it to her key', store.sealForHer(owner, entry) === true);
check('and keeps nothing for a woman with no key yet', store.sealForHer(stranger.publicKey.toBase58(), entry) === false);
const onDisk = fs.readFileSync(path.join(dir, 'inbox.json'), 'utf8');
check('the stored copy is unreadable (no brand, no season)', !onDisk.includes('Deep Autumn') && !onDisk.includes('Lip Lab'));

// The app's own code opens it: answers.ts, bundled, with her inbox key where the phone keeps it.
const appNext = new URL('../../app-next/', import.meta.url).pathname;
// Written next to this test so tweetnacl, left unbundled, resolves from client/node_modules.
const bundle = new URL(`./.answers-${process.pid}.mjs`, import.meta.url).pathname;
execFileSync(path.join(appNext, 'node_modules/.bin/esbuild'), [path.join(appNext, 'src/lib/answers.ts'), '--bundle', '--format=esm', '--platform=node', '--external:tweetnacl', `--outfile=${bundle}`, '--log-level=error']);
process.on('exit', () => { try { fs.unlinkSync(bundle); } catch {} });
const mem = new Map([[`oira_inbox_${owner}`, b64(inbox.secretKey)]]);
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
const { fetchMyAnswers } = await import(bundle);
const ownerApi = { address: owner, sign: async (m) => nacl.sign.detached(m, her.secretKey) };
const mine = await fetchMyAnswers(ownerApi, BASE);
check('her phone opens it: Lip Lab, Deep Autumn, yes', mine.answers.length === 1 && mine.answers[0].brand === 'Lip Lab' && mine.answers[0].season === 'Deep Autumn' && mine.answers[0].outcome === 'yes');
check('and adds up what she earned ($3)', mine.earned === 3);

console.log('\nEverything else still works:');
const news = await (await fetch(`${BASE}/api/me/news?since=0`, { headers: { 'x-oira-notify': mine.notifyToken } })).json();
check('the overnight check counts her new entry', news.count === 1); if (news.count !== 1) console.log('   news:', JSON.stringify(news), 'token:', mine.notifyToken);
const again = await fetch(`${BASE}/api/brand/match`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-oira-brand-key': BRAND_KEY }, body: JSON.stringify({ campaign: 'done1' }) });
check('a finished brief cannot be asked again', again.status === 409); if (again.status !== 409) console.log('   match:', again.status, await again.text());
const studio = await (await fetch(`${BASE}/api/brand/campaigns`)).json();
const health = await (await fetch(`${BASE}/api/health`)).json();
check('health reports the sponsor budget', health.sponsor && health.sponsor.capSol === 4 && typeof health.sponsor.spentTodaySol === 'number');
check('the brand studio still shows totals', studio.campaigns.find((c) => c.campaign === 'done1')?.results.yes === 1);

console.log('\nMoving to a passkey:');
store.registerWoman(owner);
check('a re-seal keeps her inbox key', store.inboxKeyFor(owner) === b64(inbox.publicKey));
const fresh = Keypair.generate().publicKey.toBase58();
const retire = async (signer, from, to) => {
  const time = Date.now();
  const sig = nacl.sign.detached(Buffer.from(`oira:retire:v1\n${from}\n${to}\n${time}`), signer.secretKey);
  return (await fetch(`${BASE}/api/me/retire`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner: from, to, time, sig: b64(sig) }) })).status;
};
check('retiring is refused until the new address has sealed', (await retire(her, owner, fresh)) === 409);
store.registerWoman(fresh);
check('only the old key can retire it', (await retire(stranger, owner, fresh)) === 401);
check('her own signature retires the old address', (await retire(her, owner, fresh)) === 200);
check('brands are sent to the new address, never the old one', store.listWomen().includes(fresh) && !store.listWomen().includes(owner));
console.log('\nRates and interest:');
const fx = await (await fetch(`${BASE}/api/fx`)).json();
check('the rates table covers well over a hundred currencies, with naira and ringgit', Object.keys(fx.rates || {}).length > 120 && fx.rates.NGN?.rate > 0 && fx.rates.MYR?.rate > 0);
const tap = (body) => fetch(`${BASE}/api/interest`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
check('a cash-out interest tap is counted', (await tap({ kind: 'cashout', country: 'NG' })).status === 200);
check('an unknown kind or a bad country is refused', (await tap({ kind: 'loan', country: 'NG' })).status === 400 && (await tap({ kind: 'cashout', country: 'Nigeria' })).status === 400);
check('only the brand key can read the counts', (await fetch(`${BASE}/api/interest`)).status === 401);
const counts = await (await fetch(`${BASE}/api/interest`, { headers: { 'x-oira-brand-key': BRAND_KEY } })).json();
check('the counts are just numbers per country', counts.cashout?.NG === 1);
check('and nothing else is stored', JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, 'interest.json'), 'utf8'))) === JSON.stringify({ cashout: { NG: 1 } }));
console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
stop();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
