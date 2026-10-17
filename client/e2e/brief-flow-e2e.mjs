// A brand brief asks several sealed women privately, and each one sees only her own answer.
// Start a bridge, then run from client/ with a funded devnet bridge behind it:
//   OIRA_HTTP=http://127.0.0.1:8779 OIRA_BRAND_KEY=<studio key> node e2e/brief-flow-e2e.mjs
//   A seals the brand's exact shade (yes, paid), B another shade (no), and C the brand's shade
//   but with her minimum set to $10 on her palette, so a $5 question is turned away.
import nacl from 'tweetnacl';
import WebSocket from 'ws';
import { Keypair } from '@solana/web3.js';

const HTTP = process.env.OIRA_HTTP || 'http://127.0.0.1:8779';
const WS = HTTP.replace(/^http/, 'ws') + '/api/seal/ws';
const KEY = process.env.OIRA_BRAND_KEY || '';
let failed = 0;
const check = (label, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) failed++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function seal(device, traits) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'start', ownerPubkey: device.publicKey.toBase58(), traits, lifetimeCap: 0 })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'sign') ws.send(JSON.stringify({ t: 'sig', id: m.id, sig: Buffer.from(nacl.sign.detached(Buffer.from(m.msg, 'base64'), device.secretKey)).toString('base64') }));
      else if (m.t === 'done') { ws.close(); resolve(m); }
      else if (m.t === 'error') { ws.close(); reject(new Error(m.message)); }
    });
    ws.on('error', reject);
  });
}

// Her minimum, set the way the app does it: through the bridge, signed by her own key.
function setMinimum(device, usd) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS);
    ws.on('open', () => ws.send(JSON.stringify({ t: 'rules', ownerPubkey: device.publicKey.toBase58(), minPayout: usd, maxPerBrand: 3 })));
    ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'sign') ws.send(JSON.stringify({ t: 'sig', id: m.id, sig: Buffer.from(nacl.sign.detached(Buffer.from(m.msg, 'base64'), device.secretKey)).toString('base64') }));
      else if (m.t === 'done') { ws.close(); resolve(m); }
      else if (m.t === 'error') { ws.close(); reject(new Error(m.message)); }
    });
    ws.on('error', reject);
  });
}

const myAnswers = async (device, asOwner = device.publicKey.toBase58()) => {
  const time = Date.now();
  const sig = nacl.sign.detached(Buffer.from(`oira:my-answers:v1\n${asOwner}\n${time}`), device.secretKey);
  const r = await fetch(`${HTTP}/api/me/answers`, { headers: { 'x-oira-owner': asOwner, 'x-oira-time': String(time), 'x-oira-sig': Buffer.from(sig).toString('base64') } });
  return { status: r.status, body: r.ok ? await r.json() : null };
};
const brand = (path, body) => fetch(`${HTTP}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-oira-brand-key': KEY }, body: JSON.stringify(body) });

const A = Keypair.generate(), B = Keypair.generate(), C = Keypair.generate();
const shade = { undertone: 2, depth: 8, season: 9 };
console.log('[seal] three women');
await seal(A, shade);
await seal(B, { undertone: 0, depth: 3, season: 0 });
await seal(C, shade);
check('three women sealed', true);
const rules = await setMinimum(C, 10);
check('C saved a $10 minimum through the bridge', rules.minPayout === 10);

console.log('[brief] a $5 question for the shade A and C share, asked of three women');
const posted = await (await brand('/api/brand/campaign', { label: `Test Brand ${Date.now() % 1e5}`, category: 0, payout: 5, reach: 3,
  target: { tu: shade.undertone, td: shade.depth, ts: shade.season, tol: 1 } })).json();
check('brief posted', !!posted.campaign);
// Only these three should be asked, so the brief targets them by being the only fresh women it
// has not asked; reach is 3 and older palettes are eligible too, so results are read per woman.
const started = await brand('/api/brand/match', { campaign: posted.campaign });
check('run started in the background', started.status === 202);
let brief;
for (let i = 0; i < 90; i++) {
  await sleep(5000);
  brief = (await (await fetch(`${HTTP}/api/brand/campaigns`)).json()).campaigns.find((c) => c.campaign === posted.campaign);
  if (brief?.status === 'done') break;
}
check('run finished', brief?.status === 'done');
console.log('  brand sees:', JSON.stringify(brief?.results));
check('the brand sees counts, never who', brief && !JSON.stringify(brief).includes(A.publicKey.toBase58()));

console.log('[answers] each woman sees only her own');
const a = await myAnswers(A), b = await myAnswers(B), c = await myAnswers(C);
const mine = (r) => (r.body?.answers || []).find((x) => x.brand === posted.label);
console.log('  A:', JSON.stringify(mine(a)), '\n  B:', JSON.stringify(mine(b)), '\n  C:', JSON.stringify(mine(c)));
const asked = [mine(a), mine(b), mine(c)].filter(Boolean).length;
check(`all three were asked (${asked} of 3)`, asked === 3);
if (mine(a)) check('A: yes, paid $5', mine(a).outcome === 'yes' && mine(a).amount === 5);
if (mine(b)) check('B: no, nothing paid', mine(b).outcome === 'no' && mine(b).amount === 0);
if (mine(c)) check('C: turned away, under her $10 minimum', mine(c).outcome === 'declined');
check('an unsigned request is refused', (await fetch(`${HTTP}/api/me/answers`)).status === 401);
check("A cannot read B's answers", (await myAnswers(A, B.publicKey.toBase58())).status === 401);

console.log(failed ? `\n${failed} FAILED` : '\nALL GREEN');
process.exit(failed ? 1 : 0);
