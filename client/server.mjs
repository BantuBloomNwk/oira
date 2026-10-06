// Oira bridge server — serves the app UI + runs the PROVEN devnet flows on demand.
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { createHmac, timingSafeEqual } from 'crypto';
import { Keypair } from '@solana/web3.js';
import { sealPalette, sealPaletteRelay, privatePayout, runOffer, privacyProof, postCampaign, matchCampaign, campaignStatus, bridgeStatus } from './oira-chain.mjs';
import { recordError, alertBridge, monitorStats } from './oira-monitor.mjs';
import { addCampaign, listCampaigns, getCampaign, updateCampaign } from './campaign-store.mjs';
import { createChallenge, verifyAndClaim } from './genesis-check.mjs';
import { reason as conciergeReason, llmConfigured } from './oira-concierge.mjs';
import { ttsConfigured, synthesize } from './oira-tts.mjs';
import { sttConfigured, transcribe } from './oira-stt.mjs';

// A devnet RPC 429 (public endpoint rate-limit) must never take the whole demo server
// down — log it and keep serving. Live /api flows degrade to their in-app fallbacks.
// A transient devnet 429 must never take the server down — record it, don't alert. An uncaught
// exception is a real problem — record AND alert (the process keeps serving, as before).
process.on('unhandledRejection', (e) => recordError('unhandledRejection', e));
process.on('uncaughtException', (e) => recordError('uncaughtException', e, { alert: true, level: 'critical' }));

const app = express();
app.set('trust proxy', 1); // behind Caddy — derive the client IP from X-Forwarded-For
app.use(express.json());

// Web traffic reaches us through Netlify's /api proxy, so the address Caddy hands on is a Netlify
// edge, shared by everyone in that region. Netlify signs proxied requests (netlify.toml `signed`)
// with a secret only it and this server hold; when that signature checks out, its client-IP
// header is hers. Without a valid signature the header is ignored, since anyone can send it.
const PROXY_SECRET = process.env.OIRA_PROXY_SIGNATURE || '';
function viaNetlify(req) {
  const tok = req.headers['x-nf-sign'];
  if (!PROXY_SECRET || typeof tok !== 'string') return false;
  const [h, p, s] = tok.split('.');
  if (!h || !p || !s) return false;
  const want = createHmac('sha256', PROXY_SECRET).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return false;
  try {
    const c = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    return c.iss === 'netlify' && (!c.exp || c.exp * 1000 > Date.now());
  } catch { return false; }
}

// The brand studio spends sponsor SOL on every campaign and every match, so both need the studio
// key. With no key configured, both stay shut.
const BRAND_KEY = process.env.OIRA_BRAND_KEY || '';
function brandAllowed(req) {
  const k = Buffer.from(String(req.headers['x-oira-brand-key'] || ''));
  const want = Buffer.from(BRAND_KEY);
  return BRAND_KEY.length > 0 && k.length === want.length && timingSafeEqual(k, want);
}

// CORS — when the bridge is hosted separately from the static app (e.g. VPS bridge behind
// Caddy, app on Netlify), the browser calls it cross-origin. Allow the configured origin
// (comma-separated list ok) and answer preflight. Harmless when same-origin/proxied.
const ALLOW = (process.env.OIRA_ALLOW_ORIGIN || 'https://oira-palette.netlify.app,https://app.myoira.com,https://myoira.com,https://www.myoira.com').split(',').map((s) => s.trim());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOW.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-oira-brand-key');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Real health for the reverse proxy / uptime probes: process up (ok), whether it's degraded
// (RPC or TEE unreachable, or the deployer running low), uptime, and a scrubbed error summary —
// no user data. `bridgeStatus()` is cached + refreshed in the background, so this never blocks.
app.get('/api/health', (req, res) => {
  const s = bridgeStatus(), m = monitorStats();
  const degraded = s.rpcOk === false || s.teeOk === false || (s.deployerSol != null && s.deployerSol < 1);
  res.json({ ok: true, service: 'oira-bridge', degraded, uptimeSec: m.uptimeSec, startedAt: m.startedAt,
    errors: { count: m.errorCount, last: m.lastError }, deployer: { balanceSol: s.deployerSol },
    rpc: { ok: s.rpcOk }, tee: { ok: s.teeOk }, alertChannel: m.alertChannel, signed: viaNetlify(req) });
});

// Per-IP rate limit on the EXPENSIVE devnet flows (each seal/offer/payout spends deployer
// SOL). Crude in-memory fixed window — enough to stop a script draining the wallet. Shared
// by the HTTP routes and the WS seal below.
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = process.env.OIRA_RL_MAX != null ? Number(process.env.OIRA_RL_MAX) : 12;
const rlHits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  let e = rlHits.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + RL_WINDOW_MS }; rlHits.set(ip, e); }
  e.count++;
  return e.count > RL_MAX;
}
setInterval(() => { const now = Date.now(); for (const [ip, e] of rlHits) if (now > e.resetAt) rlHits.delete(ip); }, RL_WINDOW_MS).unref();
const clientIp = (req) => (viaNetlify(req) && String(req.headers['x-nf-client-connection-ip'] || '').trim())
  || req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';

// Sealing a NEW Palette specifically (not the general expensive-flow burst limit above, which is
// tuned loose enough to not block a real multi-person dev/demo session behind one NAT). A real
// woman seals close to once ever — nothing legitimate calls this 12 times in 10 minutes, and the
// short burst window lets a script just wait out each reset. This is a separate, longer-window,
// much lower ceiling aimed at "one machine, many fake identities" farming. Still IP-based, so
// VPNs/IP rotation defeat it on their own — paired with the liveness challenge at scan time and
// the closed self-seal fallback above, it raises the cost of automated farming without adding
// friction or cost for a genuine one-time sealer.
const SEAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const SEAL_MAX = process.env.OIRA_SEAL_MAX != null ? Number(process.env.OIRA_SEAL_MAX) : 3;
const sealHits = new Map();
// PEEK. Deliberately does not increment. The old version counted every attempt, so a seal
// that failed for a reason that was nothing to do with her — an RPC 429, a dropped socket,
// a cancelled biometric — still burned quota, and three unlucky retries locked her out of
// her own Palette for 24 hours. The Sybil control we actually want is on Palettes created,
// so only a completed seal should count. See recordSeal below.
function sealOverLimit(ip) {
  const e = sealHits.get(ip);
  if (!e || Date.now() > e.resetAt) return false;
  return e.count >= SEAL_MAX;
}
// The per-connection limit above does nothing against a script on a handful of addresses, and
// each seal the app sponsors costs the deployer about 0.1 SOL. So there is a ceiling on sponsored
// seals across everyone, per UTC day. Wallet seals pay their own way but count too; a day that
// reaches this is not a normal day.
const SEAL_DAY_CAP = process.env.OIRA_SEAL_DAY_CAP != null ? Number(process.env.OIRA_SEAL_DAY_CAP) : 60;
const sealDay = { day: '', count: 0 };
const today = () => new Date().toISOString().slice(0, 10);
function sealDayFull() { return sealDay.day === today() && sealDay.count >= SEAL_DAY_CAP; }
// Call ONLY once a seal has actually landed on chain.
function recordSeal(ip) {
  const now = Date.now();
  if (sealDay.day !== today()) { sealDay.day = today(); sealDay.count = 0; }
  sealDay.count++;
  let e = sealHits.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + SEAL_WINDOW_MS }; sealHits.set(ip, e); }
  e.count++;
}
setInterval(() => { const now = Date.now(); for (const [ip, e] of sealHits) if (now > e.resetAt) sealHits.delete(ip); }, SEAL_WINDOW_MS).unref();
app.use((req, res, next) => {
  if (req.method === 'POST' && ['/api/seal', '/api/campaign', '/api/payout', '/api/brand/campaign', '/api/brand/match', '/api/concierge'].includes(req.path)
      && rateLimited(clientIp(req))) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }
  next();
});
// The first demo's offer and payout routes. Nothing in the app calls them now, and both spend
// deployer SOL, so they only exist when a local walkthrough asks for them.
app.post(['/api/campaign', '/api/payout'], (_req, res, next) => {
  if (process.env.OIRA_LEGACY_DEMO === '1') return next();
  res.status(404).json({ error: 'not available' });
});
app.post(['/api/brand/campaign', '/api/brand/match'], (req, res, next) => {
  if (brandAllowed(req)) return next();
  res.status(401).json({ error: 'brand key required' });
});
// Serve the app UI locally, but NOT on a hosted API-only bridge (set OIRA_SERVE_STATIC=0
// there — the app is served by Netlify, and serving from the code dir would leak source).
if (process.env.OIRA_SERVE_STATIC !== '0') {
  app.use(express.static(fileURLToPath(new URL('../app', import.meta.url))));
  app.use('/brand', express.static(fileURLToPath(new URL('../brand', import.meta.url)))); // official Oira brand assets
  app.get('/favicon.ico', (_req, res) => res.redirect(301, '/brand/png/favicon-plum-32.png')); // browsers request /favicon.ico by default
}

const session = {}; // one demo session: her sealed Palette

app.post('/api/seal', async (req, res) => {
  // Model A (self-seal): the SERVER generates the owner keypair (sealPalette -> Keypair.generate())
  // and funds it from the deployer wallet — no passkey, no liveness challenge, no client proof of
  // humanity at all. The app hasn't called this since the passkey/Model-B path (sealViaDevice ->
  // the WS route below) shipped, but the route itself was still open: a bare POST loop could mint
  // unlimited free, fully valid, on-chain Palettes at the deployer's expense. Closed by default;
  // set OIRA_ALLOW_SELF_SEAL=1 to re-enable it for a local demo/walkthrough that deliberately
  // wants the no-setup flow.
  if (process.env.OIRA_ALLOW_SELF_SEAL !== '1') {
    return res.status(404).json({ error: 'Not available. Seal from the app.' });
  }
  if (sealDayFull()) return res.status(429).json({ error: 'Sealing is paused until tomorrow (UTC).' });
  if (sealOverLimit(clientIp(req))) return res.status(429).json({ error: `Already sealed ${SEAL_MAX} Palettes from this connection today.` });
  try {
    // the device sends CIPHERTEXT (AES-256-GCM recovery blob) + her CONFIRMED bucketed traits
    // (undertone/depth/season) — the raw selfie never leaves the phone; these 3 buckets are what
    // she confirmed. Model B binds them to a commitment root and seals them private in the TEE.
    const { encBlob, traits } = req.body || {};
    const blob = encBlob ? Buffer.from(encBlob, 'base64') : undefined;
    const t = (traits && Number.isInteger(traits.undertone) && Number.isInteger(traits.depth) && Number.isInteger(traits.season)) ? traits : undefined;
    const r = await sealPalette({ traits: t, encBlob: blob });
    session.owner = r.owner; session.agent = r.agent; session.salt = r.salt; session.traits = r.traits; session.palette = r.palette;
    recordSeal(clientIp(req)); // a Palette exists now, so it counts
    console.log('sealed', r.palette);
    res.json({ palette: r.palette, sealSig: r.sealSig, explorer: r.explorer });
  } catch (e) { recordError('seal', e, { alert: true }); res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/payout', async (_req, res) => {
  try {
    // use her sealed identity if present; otherwise a fresh one so the receipt always resolves in the demo
    let owner = session.owner;
    if (!owner) { const kp = Keypair.generate(); owner = [...kp.secretKey]; }
    const r = await privatePayout(owner, 5);
    console.log('paid', r.herBalance);
    res.json(r);
  } catch (e) { recordError('payout', e, { alert: true }); res.status(500).json({ error: String(e.message || e) }); }
});

// ---- proof of privacy: a live chain read anyone can open to confirm her palette is sealed.
// Reads only the PUBLIC base layer; no keys, no writes. owner pubkey from ?owner= or the session.
app.get('/api/privacy-proof', async (req, res) => {
  try {
    const ownerPubkey = req.query.owner || session.her || session.paletteOwner;
    if (!ownerPubkey) return res.json({ sealed: false, network: 'Solana devnet' });
    res.json(await privacyProof({ ownerPubkey }));
  } catch (e) { console.error('privacy-proof', e.message); res.status(500).json({ error: String(e.message || e) }); }
});

// ---- voice: concierge STT (Whisper) + TTS (ElevenLabs). Off unless env is configured.
// Own looser rate limit (voice is chatty vs the once-per-session seal flows).
const RL_VOICE_MAX = process.env.OIRA_RL_VOICE_MAX != null ? Number(process.env.OIRA_RL_VOICE_MAX) : 60;
const rlVoice = new Map();
function voiceLimited(ip) {
  const now = Date.now();
  let e = rlVoice.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + RL_WINDOW_MS }; rlVoice.set(ip, e); }
  e.count++;
  return e.count > RL_VOICE_MAX;
}
setInterval(() => { const now = Date.now(); for (const [ip, e] of rlVoice) if (now > e.resetAt) rlVoice.delete(ip); }, RL_WINDOW_MS).unref();

// Governed concierge reasoning. Receives ONLY the coarse palette (season/undertone/depth/…),
// never raw traits; the mcp/policy boundary rejects anything else. Grounds in the real concierge
// and refines with an LLM when one is configured (opt-in), else returns the grounded answer.
app.get('/api/concierge/health', (_req, res) => res.json({ ok: true, llm: llmConfigured() }));
app.post('/api/concierge', async (req, res) => {
  try {
    const { question, palette, hex } = req.body || {};
    const r = await conciergeReason({ question, palette, hex });
    res.json(r);
  } catch (e) { res.status(400).json({ error: String(e.message || e) }); }
});

app.get('/api/voice/health', (_req, res) => res.json({ stt: sttConfigured(), tts: ttsConfigured() }));

app.post('/api/tts', async (req, res) => {
  try {
    if (!ttsConfigured()) return res.status(503).json({ error: 'tts not configured' });
    if (voiceLimited(clientIp(req))) return res.status(429).json({ error: 'Too many requests.' });
    const { text, lang } = req.body || {};
    const r = await synthesize({ text, lang });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(r.audio);
  } catch (e) { console.error('tts', e.message); res.status(500).json({ error: String(e.message || e) }); }
});

// STT takes a raw audio body (webm/ogg/wav); parse it as a buffer for this route only.
app.post('/api/stt', express.raw({ type: ['audio/*', 'application/octet-stream'], limit: '8mb' }), async (req, res) => {
  try {
    if (!sttConfigured()) return res.status(503).json({ error: 'stt not configured' });
    if (voiceLimited(clientIp(req))) return res.status(429).json({ error: 'Too many requests.' });
    const lang = (req.query.lang || '').toString();
    const r = await transcribe({ audioBuf: req.body, lang });
    res.json(r);
  } catch (e) { console.error('stt', e.message); res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/campaign', async (req, res) => {
  try {
    // MODEL B overnight offer: a brand commits its target shade + escrow, co-delegates the
    // campaign into her enclave, the agent matches it in-enclave (she is offline), and — only on
    // a real match — settles her payout from escrow against the private receipt. runOffer self-seals
    // a fresh matching palette if she has not sealed yet, so the demo always resolves.
    const payout = Number(req.body && req.body.payout) || 5;
    // Prefer her real sealed palette (device-seal leaves her pubkey + agent + traits in
    // session; her owner secret is not needed). Falls back to self-seal if she hasn't sealed.
    const r = await runOffer({ ownerPubkey: session.her, ownerSecret: session.owner, agentSecret: session.agent, traits: session.traits, payout });
    console.log('offer', r.matched ? 'matched+settled' : 'no-match', r.campaign, 'her', r.herBalance);
    res.json(r);
  } catch (e) { recordError('offer', e, { alert: true }); res.status(500).json({ error: String(e.message || e) }); }
});

// ── SEEKER GENESIS TOKEN (optional, opt-in — only reached if she connected a Seeker
// wallet via MWA; never touches her passkey identity or Palette) ───────────────────
// Two-step so we never trust a bare pubkey string over HTTP: (1) issue a nonce for her
// to sign with the MWA-connected wallet, (2) verify that signature + the on-chain SGT
// checks + the anti-replay claim together. See client/genesis-check.mjs.
app.post('/api/genesis/challenge', (req, res) => {
  const pubkey = String((req.body && req.body.pubkey) || '');
  if (!pubkey) return res.status(400).json({ error: 'pubkey required' });
  res.json(createChallenge(pubkey));
});
app.post('/api/genesis/verify', async (req, res) => {
  try {
    const { pubkey, signature } = req.body || {};
    const r = await verifyAndClaim({ pubkey, signature });
    res.json(r);
  } catch (e) { console.error('genesis/verify', e.message); res.status(500).json({ error: String(e.message || e) }); }
});

// ── BRAND MARKETPLACE ──────────────────────────────────────────────────────
// A brand posts a campaign (commit a target shade + escrow, co-delegate into the ER), which
// persists so her overnight can match it later. Responses NEVER include the commitment opening
// (target shade + salt) — that stays server-side, exactly as the on-chain commitment intends.
const EX_ADDR = (a) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const publicCampaign = (c) => ({ campaign: c.campaign, brand: c.brand, label: c.label, payout: c.payout, perQuery: c.perQuery, category: c.category, escrowUi: c.escrowUi, status: c.status, createdAt: c.createdAt, matchedAt: c.matchedAt, amount: c.amount || 0, explorer: EX_ADDR(c.campaign) });

app.post('/api/brand/campaign', async (req, res) => {
  try {
    const b = req.body || {}; const target = b.target || {};
    const t = { tu: Number(target.tu), td: Number(target.td), ts: Number(target.ts), tol: Number(target.tol ?? 1) };
    if (![t.tu, t.td, t.ts, t.tol].every(Number.isInteger)) return res.status(400).json({ error: 'target {tu,td,ts,tol} required' });
    if (t.tu > 3 || t.td < 1 || t.td > 10 || t.ts > 11 || t.tol > 5) return res.status(400).json({ error: 'target out of range' });
    const payout = Math.min(Math.max(Number(b.payout) || 5, 1), 50);
    const label = String(b.label || 'Brand').slice(0, 40);
    const category = Math.max(0, Math.min(31, Number(b.category) || 0));
    const r = await postCampaign({ target: t, payout, category, label });
    const rec = addCampaign(r);
    console.log('brand posted campaign', r.campaign, label, '$' + payout);
    res.json(publicCampaign(rec));
  } catch (e) { console.error('brand/campaign', e.message); res.status(500).json({ error: String(e.message || e) }); }
});

app.get('/api/brand/campaigns', async (_req, res) => {
  try {
    const out = await Promise.all(listCampaigns().map(async (c) => {
      let live = {}; try { live = await campaignStatus(c.campaign); } catch {}
      return { ...publicCampaign(c), live };
    }));
    res.json({ campaigns: out });
  } catch (e) { console.error('brand/campaigns', e.message); res.status(500).json({ error: String(e.message || e) }); }
});

app.post('/api/brand/match', async (req, res) => {
  try {
    const pk = (req.body && req.body.campaign) || '';
    const rec = getCampaign(pk);
    if (!rec) return res.status(404).json({ error: 'campaign not found' });
    if (rec.status === 'matched') return res.json({ already: true, matched: true, amount: rec.amount || 0, campaign: pk });
    const r = await matchCampaign({ campaignRec: rec, ownerPubkey: session.her, agentSecret: session.agent, traits: session.traits });
    updateCampaign(pk, { status: r.matched ? 'matched' : 'no-match', matchedAt: Date.now(), amount: r.amount });
    console.log('brand match', pk, r.matched ? 'matched+settled' : 'no-match');
    res.json({ matched: r.matched, amount: r.amount, herBalance: r.herBalance, explorer: r.explorer, campaign: pk });
  } catch (e) { console.error('brand/match', e.message); res.status(500).json({ error: String(e.message || e) }); }
});

// ---- RELAYED SEAL over WebSocket: her owner key stays on her device ----
// The browser opens this WS, sends {t:'start', ownerPubkey, traits, encBlob}. The bridge runs
// the proven sealPaletteRelay; every owner signature it needs is sent as {t:'sign', id, msg}
// and the browser replies {t:'sig', id, sig} after signing with her in-memory passkey key.
// One connection carries the whole seal (base-sign -> TEE-auth-sign -> ER-sign ordering).
const PORT = Number(process.env.OIRA_PORT) || 8777;
const HOST = process.env.OIRA_HOST || '127.0.0.1';
const server = createServer(app);
// Only accept WS from allowlisted browser origins (blocks a malicious site from driving the
// bridge through a visitor's browser). Non-browser clients send no Origin and are allowed
// (not a CSRF vector; direct abuse is bounded by devnet + a later rate-limit). Add the real
// domain to OIRA_ALLOW_ORIGIN when it ships.
const WS_ALLOW = new Set([...ALLOW, 'http://localhost:8777', 'http://127.0.0.1:8777']);
const wss = new WebSocketServer({ server, path: '/api/seal/ws', verifyClient: (info) => {
  const o = info.origin;
  if (!o) return true;
  const ok = WS_ALLOW.has(o);
  if (!ok) console.warn('WS rejected origin', o);
  return ok;
} });

wss.on('connection', (ws, req) => {
  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || (req.socket && req.socket.remoteAddress) || 'unknown';
  const pending = new Map();
  let counter = 0, started = false;
  const sign = (msgBytes) => new Promise((resolve, reject) => {
    const id = ++counter;
    pending.set(id, resolve);
    setTimeout(() => { if (pending.delete(id)) reject(new Error('device sign timeout')); }, 60000);
    try { ws.send(JSON.stringify({ t: 'sign', id, msg: Buffer.from(msgBytes).toString('base64') })); }
    catch (e) { reject(e); }
  });
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.t === 'sig' && pending.has(m.id)) { const r = pending.get(m.id); pending.delete(m.id); return r(Buffer.from(m.sig, 'base64')); }
    if (m.t === 'start' && !started) {
      if (rateLimited(ip)) { try { ws.send(JSON.stringify({ t: 'error', message: 'Too many requests. Please wait a moment.' })); } catch {} return ws.close(); }
      if (sealDayFull()) { try { ws.send(JSON.stringify({ t: 'error', message: "We've sealed a lot of Palettes today, so new ones are paused until tomorrow. Your reading's still safe on your phone." })); } catch {} return ws.close(); }
      if (sealOverLimit(ip)) { try { ws.send(JSON.stringify({ t: 'error', message: `You have already sealed ${SEAL_MAX} Palettes from this connection today. This limit is per day, and it resets on its own.` })); } catch {} return ws.close(); }
      started = true;
      const traits = (m.traits && Number.isInteger(m.traits.undertone) && Number.isInteger(m.traits.depth) && Number.isInteger(m.traits.season)) ? m.traits : undefined;
      const encBlob = m.encBlob ? Buffer.from(m.encBlob, 'base64') : undefined;
      const salt = m.salt ? Buffer.from(m.salt, 'base64') : undefined; // her passkey-derived salt: used to build the seal, never stored
      // assurance travels straight from her client ('wallet' vs 'passkey'/'fallback'/absent) —
      // it decides whether sealPaletteRelay sponsors her shortfall or requires her own funds.
      const assurance = m.assurance === 'wallet' ? 'wallet' : m.assurance;
      sealPaletteRelay({ ownerPubkey: m.ownerPubkey, traits, encBlob, lifetimeCap: m.lifetimeCap || 0, salt, sign, assurance })
        .then((r) => {
          // server keeps ONLY the bounded agent key + her pubkey/traits (for the overnight);
          // never her owner secret and never her salt (device holds/derives that).
          session.owner = null; session.agent = r.agent; session.salt = null; session.traits = r.traits; session.palette = r.palette; session.her = r.her;
          recordSeal(ip); // only now, with a Palette actually on chain, does this count
          console.log('sealed (relayed)', r.palette, 'her', r.her);
          ws.send(JSON.stringify({ t: 'done', palette: r.palette, her: r.her, sealSig: r.sealSig, explorer: r.explorer }));
        })
        .catch((e) => { recordError('relay-seal', e, { alert: true }); try { ws.send(JSON.stringify({ t: 'error', message: String(e.message || e) })); } catch {} });
    }
  });
  ws.on('close', () => pending.clear());
});

// Proactive degradation alerts — catch a low deployer balance or an unreachable RPC/TEE before it
// breaks a real seal, not after. Every 5 min; alertBridge rate-limits so this can't spam.
setInterval(() => {
  const s = bridgeStatus();
  if (s.deployerSol != null && s.deployerSol < 1) alertBridge('warn', `deployer balance low: ${s.deployerSol} SOL — top up`);
  if (s.rpcOk === false) alertBridge('warn', 'base devnet RPC unreachable');
  if (s.teeOk === false) alertBridge('warn', 'MagicBlock TEE unreachable');
}, 5 * 60_000).unref();

server.listen(PORT, HOST, () => console.log(`Oira bridge (http+ws) on http://${HOST}:${PORT}`));
