// Moving from the device key to a passkey: the order, the resume, and what is left behind.
//
// Bundles the app's own migrate.ts with esbuild and swaps only the parts that need a phone or the
// network (passkey, seal, send, rules, the bridge) for stand-ins that record what they were asked.
// Checks:
//   - it is offered only to someone who sealed on the device key
//   - a failure halfway stops there, records what finished, and leaves her on the device key
//   - running again carries on without sealing twice, sends the whole balance to the new address,
//     puts her rules on the new Palette, and retires the old address with the old key's signature
//   - when it finishes, the app remembers the new address and stops offering the move
//   - it re-seals exactly the categories she sealed, or rebuilds them from her reading if older
//
//   node e2e/migrate-unit.mjs   (needs app-next's packages)
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';
import nacl from 'tweetnacl';

const appNext = new URL('../../app-next/', import.meta.url).pathname;
const esbuild = createRequire(path.join(appNext, 'package.json'))('esbuild');
const lib = path.join(appNext, 'src/lib');
const out = path.join(os.tmpdir(), `migrate-${process.pid}.mjs`);

// Stand-ins for everything that needs a phone or the network. They report to globalThis.T.
const mocks = {
  custody: `export const unlockLocal = async () => T.D; export const unlockOwner = async () => T.P;`,
  seal: `export const sealViaDevice = async (o, req) => { T.calls.push(['seal', o.address, req.traits]); if (T.failSeal) throw new Error('seal failed'); return { palette: T.P.address, explorer: 'https://explorer.solana.com/address/' + T.P.address + '?cluster=devnet' }; };`,
  send: `export const fetchBalance = async (a) => T.balances[a] || 0; export const sendUsdc = async (o, to, amt) => { T.calls.push(['send', o.address, to, amt]); if (T.failSend) { T.failSend = false; throw new Error('send failed'); } T.balances[o.address] = 0; return {}; };`,
  rulesync: `export const saveRulesToPalette = async (o, r) => { T.calls.push(['rules', o.address, r]); };`,
  native: `export const isNativeApp = () => true; export const BRIDGE_ORIGIN = '';`,
  diag: `export const diag = () => {};`,
  identity: `export const rememberHer = (a) => localStorage.setItem('oira_her_address', a); export const rememberedHer = () => localStorage.getItem('oira_her_address');`,
};
await esbuild.build({
  entryPoints: [path.join(lib, 'migrate.ts')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error',
  external: ['tweetnacl'],
  plugins: [{ name: 'stand-ins', setup(b) {
    b.onResolve({ filter: /^\.\/(custody|seal|send|rulesync|native|diag|identity)$/ }, (a) => ({ path: a.path.slice(2), namespace: 'stand-in' }));
    b.onLoad({ filter: /.*/, namespace: 'stand-in' }, (a) => ({ contents: mocks[a.path], loader: 'js' }));
  } }],
});
// tweetnacl must resolve from client/node_modules, so load the bundle from next to this test.
const bundle = new URL(`./.migrate-${process.pid}.mjs`, import.meta.url).pathname;
fs.copyFileSync(out, bundle); fs.unlinkSync(out);
process.on('exit', () => { try { fs.unlinkSync(bundle); } catch {} });

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const ownerFrom = (kp, assurance) => ({ address: Buffer.from(kp.publicKey).toString('hex').slice(0, 44), assurance, sign: async (m) => nacl.sign.detached(m, kp.secretKey), _kp: kp });
const dKey = nacl.sign.keyPair(), pKey = nacl.sign.keyPair();
const posted = [];
globalThis.fetch = async (url, init) => { posted.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 200 }; };
globalThis.T = { D: ownerFrom(dKey, 'fallback'), P: ownerFrom(pKey, 'passkey'), calls: [], balances: {} };
const { canMigrate, migrateToPasskey } = await import(bundle);

let failed = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const D = T.D.address, P = T.P.address;

console.log('\nWho is offered the move:');
check('nobody who has not sealed', (await canMigrate()) === false);
mem.set('oira_proof', JSON.stringify({ palette: 'x', url: 'https://explorer.solana.com/address/x' }));
mem.set('oira_her_address', P);
check('nobody who sealed with a passkey', (await canMigrate()) === false);
mem.set('oira_her_address', D);
check('someone who sealed on the device key', (await canMigrate()) === true);

console.log('\nA move that stops halfway:');
mem.set('oira_sealed_traits', JSON.stringify({ undertone: 2, depth: 8, season: 3 }));
T.balances[D] = 7.25;
T.failSend = true;
let err = null;
try { await migrateToPasskey({ rules: { minPayout: 4, maxPerBrand: 2 } }); } catch (e) { err = e; }
const state1 = JSON.parse(mem.get('oira_migration'));
check('it stops at the step that failed', !!err && state1.done.join() === 'sealed');
check('her reading was sealed to the new key, exactly as before', T.calls[0][0] === 'seal' && T.calls[0][1] === P && JSON.stringify(T.calls[0][2]) === JSON.stringify({ undertone: 2, depth: 8, season: 3 }));
check('she is still on the device key', mem.get('oira_her_address') === D && !state1.finishedAt);
check('so the move is still offered', (await canMigrate()) === true);

console.log('\nRunning it again:');
T.calls = [];
const next = await migrateToPasskey({ rules: { minPayout: 4, maxPerBrand: 2 } });
check('it does not seal a second time', !T.calls.some((c) => c[0] === 'seal'));
check('it sends her whole balance to the new address', T.calls.some((c) => c[0] === 'send' && c[1] === D && c[2] === P && c[3] === 7.25));
check('it puts her rules on the new Palette', T.calls.some((c) => c[0] === 'rules' && c[1] === P && c[2].minPayout === 4));
const r = posted.find((x) => x.url.endsWith('/api/me/retire'));
check('it retires the old address, signed by the old key', !!r && r.body.owner === D && r.body.to === P
  && nacl.sign.detached.verify(new TextEncoder().encode(`oira:retire:v1\n${D}\n${P}\n${r.body.time}`), Buffer.from(r.body.sig, 'base64'), dKey.publicKey));
check('the app now remembers her new address', mem.get('oira_her_address') === P && next.address === P);
check('and stops offering the move', (await canMigrate()) === false);

console.log('\nA bridge without the retire route:');
mem.clear(); posted.length = 0; T.calls = []; T.balances = {};
mem.set('oira_proof', JSON.stringify({ palette: 'x', url: 'https://explorer.solana.com/address/x' }));
mem.set('oira_her_address', D);
mem.set('oira_sealed_traits', JSON.stringify({ undertone: 2, depth: 8, season: 3 }));
const realFetch = globalThis.fetch;
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => { throw new Error('html'); } });
let stuck = null; try { await migrateToPasskey({ rules: null }); } catch (e) { stuck = e; }
check('a 404 that is not the bridge saying "nothing to retire" stops the move', !!stuck && mem.get('oira_her_address') === D);
globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({ error: 'nothing to retire' }) });
await migrateToPasskey({ rules: null });
check('the bridge\'s own "nothing to retire" lets it finish', mem.get('oira_her_address') === P);
globalThis.fetch = realFetch;

console.log('\nAn older seal, without saved categories:');
mem.clear(); posted.length = 0; T.calls = []; T.balances = {};
mem.set('oira_proof', JSON.stringify({ palette: 'x', url: 'https://explorer.solana.com/address/x' }));
mem.set('oira_her_address', D);
mem.set('oira.her', JSON.stringify({ v: 1, read: true, profile: { name: 'x', seasonId: 'deep-autumn' }, seasonId: 'deep-autumn',
  reading: { sealed: { lab: { L: 45, a: 14, b: 26 }, ita: -5, cct: 5000, confidence: 0.9 } } }));
await migrateToPasskey({ rules: null });
const t = T.calls.find((c) => c[0] === 'seal')[2];
check('it rebuilds them from her stored reading (warm, a deep Monk step)', t.undertone === 0 && t.depth >= 7);
check('with no money and no rules, it skips those steps', !T.calls.some((c) => c[0] === 'send' || c[0] === 'rules'));

console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
