// Oira bridge server, serves the app UI + runs the PROVEN devnet flows on demand.
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { createHmac, timingSafeEqual } from 'crypto';
import { Keypair } from '@solana/web3.js';
import { sealPalette, sealPaletteRelay, privatePayout, runOffer, privacyProof, postCampaign, matchCampaign, campaignStatus, bridgeStatus, askHer, brandSeedFor, setRulesRelay, sendUsdcRelay, usdcBalance, sponsorBalanceSol } from './oira-chain.mjs';
import { registerWoman, listWomen, addBrief, getBrief, listBriefs, updateBrief, addResult, finishBrief, migrateBriefs, setInboxKey, inboxKeyFor, sealForHer, inboxFor, retireWoman, isRegistered } from './brief-store.mjs';
import { notifyToken, ownerOfToken } from './notify.mjs';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { recordError, alertBridge, monitorStats, dailyReport } from './oira-monitor.mjs';
import { createBudget } from './sponsor-budget.mjs';
import { fxTable, refreshFx } from './fx.mjs';
import { KINDS as INTEREST_KINDS, countInterest, interestCounts } from './interest.mjs';
import { createChallenge, verifyAndClaim } from './genesis-check.mjs';
import { reason as conciergeReason, llmConfigured } from './oira-concierge.mjs';
import { ttsConfigured, synthesize } from './oira-tts.mjs';
import { sttConfigured, transcribe } from './oira-stt.mjs';

// A devnet RPC 429 (public endpoint rate-limit) must never take the whole demo server
// down, log it and keep serving. Live /api flows degrade to their in-app fallbacks.
// A transient devnet 429 must never take the server down, record it, don't alert. An uncaught
// exception is a real problem, record AND alert (the process keeps serving, as before).
process.on('unhandledRejection', (e) => recordError('unhandledRejection', e));
process.on('uncaughtException', (e) => recordError('uncaughtException', e, { alert: true, level: 'critical' }));

const app = express();
app.set('trust proxy', 1); // behind Caddy, derive the client IP from X-Forwarded-For
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

// CORS, when the bridge is hosted separately from the static app (e.g. VPS bridge behind
// Caddy, app on Netlify), the browser calls it cross-origin. Allow the configured origin
// (comma-separated list ok) and answer preflight. Harmless when same-origin/proxied.
const ALLOW = (process.env.OIRA_ALLOW_ORIGIN || 'https://oira-palette.netlify.app,https://app.myoira.com,https://myoira.com,https://www.myoira.com').split(',').map((s) => s.trim());
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOW.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-oira-brand-key, x-oira-owner, x-oira-time, x-oira-sig');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Real health for the reverse proxy / uptime probes: process up (ok), whether it's degraded
// (RPC or TEE unreachable, or the deployer running low), uptime, and a scrubbed error summary,
// no user data. `bridgeStatus()` is cached + refreshed in the background, so this never blocks.
app.get('/api/health', (req, res) => {
  const s = bridgeStatus(), m = monitorStats();
  const degraded = s.rpcOk === false || s.teeOk === false || (s.deployerSol != null && s.deployerSol < 1) || !budget.allows();
  res.json({ ok: true, service: 'oira-bridge', degraded, uptimeSec: m.uptimeSec, startedAt: m.startedAt,
    errors: { count: m.errorCount, last: m.lastError }, deployer: { balanceSol: s.deployerSol },
    rpc: { ok: s.rpcOk }, tee: { ok: s.teeOk }, alertChannel: m.alertChannel, signed: viaNetlify(req),
    sponsor: { spentTodaySol: budget.spent(), capSol: budget.cap, open: budget.allows() } });
});

// Per-IP rate limit on the EXPENSIVE devnet flows (each seal/offer/payout spends deployer
// SOL). Crude in-memory fixed window, enough to stop a script draining the wallet. Shared
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
// woman seals close to once ever, nothing legitimate calls this 12 times in 10 minutes, and the
// short burst window lets a script just wait out each reset. This is a separate, longer-window,
// much lower ceiling aimed at "one machine, many fake identities" farming. Still IP-based, so
// VPNs/IP rotation defeat it on their own, paired with the liveness challenge at scan time and
// the closed self-seal fallback above, it raises the cost of automated farming without adding
// friction or cost for a genuine one-time sealer.
const SEAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const SEAL_MAX = process.env.OIRA_SEAL_MAX != null ? Number(process.env.OIRA_SEAL_MAX) : 3;
const sealHits = new Map();
// PEEK. Deliberately does not increment. The old version counted every attempt, so a seal
// that failed for a reason that was nothing to do with her, an RPC 429, a dropped socket,
// a cancelled biometric, still burned quota, and three unlucky retries locked her out of
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
  dayStats.seals++;
  let e = sealHits.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + SEAL_WINDOW_MS }; sealHits.set(ip, e); }
  e.count++;
}
setInterval(() => { const now = Date.now(); for (const [ip, e] of sealHits) if (now > e.resetAt) sealHits.delete(ip); }, SEAL_WINDOW_MS).unref();
// Sponsored SOL leaves the deployer before she has signed anything, so the sponsored budget is
// charged when the money moves, not when the seal completes. sealPaletteRelay calls this only
// when it is about to send SOL, so a retry that needs no top-up is free.
const SPONSOR_MAX = process.env.OIRA_SPONSOR_MAX != null ? Number(process.env.OIRA_SPONSOR_MAX) : SEAL_MAX;
const sponsorHits = new Map();
const sponsorDay = { day: '', count: 0 };
class SponsorLimit extends Error {}
function chargeSponsor(ip) {
  const now = Date.now();
  if (sponsorDay.day !== today()) { sponsorDay.day = today(); sponsorDay.count = 0; }
  if (sponsorDay.count >= SEAL_DAY_CAP) throw new SponsorLimit("We've sealed a lot of Palettes today, so new ones are paused until tomorrow. Your reading's still safe on your phone.");
  let e = sponsorHits.get(ip);
  if (!e || now > e.resetAt) { e = { count: 0, resetAt: now + SEAL_WINDOW_MS }; sponsorHits.set(ip, e); }
  if (e.count >= SPONSOR_MAX) throw new SponsorLimit("You've started a few Palettes from this connection today, so the next one waits until tomorrow. Your reading's still safe on your phone.");
  e.count++;
  sponsorDay.count++;
}
setInterval(() => { const now = Date.now(); for (const [ip, e] of sponsorHits) if (now > e.resetAt) sponsorHits.delete(ip); }, SEAL_WINDOW_MS).unref();

// The daily SOL budget for everything the bridge pays for: seals it sponsors, sends, brand briefs.
// The count limits above don't bound money; this does. OIRA_SPONSOR_SOL_DAY, 0 turns it off.
const budget = createBudget(process.env.OIRA_SPONSOR_SOL_DAY != null ? Number(process.env.OIRA_SPONSOR_SOL_DAY) : 4);
const BUDGET_MSG = "We've helped a lot of people today, so this pauses until tomorrow. Everything of yours is safe.";
let budgetAlertDay = '';
async function sponsorBudgetOk() {
  try { budget.observe(await sponsorBalanceSol()); } catch { /* a failed read never blocks her */ }
  if (budget.allows()) return true;
  if (budgetAlertDay !== today()) {
    budgetAlertDay = today();
    alertBridge('warn', `sponsor budget reached: ${budget.spent()} of ${budget.cap} SOL spent today. Sponsored seals, sends and briefs pause until 00:00 UTC.`);
  }
  return false;
}
// What happened today, for the summary that goes out after midnight UTC.
const dayStats = { day: today(), seals: 0, sends: 0, briefs: 0, errors0: 0 };
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
// there, the app is served by Netlify, and serving from the code dir would leak source).
if (process.env.OIRA_SERVE_STATIC !== '0') {
  app.use(express.static(fileURLToPath(new URL('../app', import.meta.url))));
  app.use('/brand', express.static(fileURLToPath(new URL('../brand', import.meta.url)))); // official Oira brand assets
  app.get('/favicon.ico', (_req, res) => res.redirect(301, '/brand/png/favicon-plum-32.png')); // browsers request /favicon.ico by default
}

const session = {}; // one demo session: her sealed Palette

app.post('/api/seal', async (req, res) => {
  // Model A (self-seal): the SERVER generates the owner keypair (sealPalette -> Keypair.generate())
  // and funds it from the deployer wallet, no passkey, no liveness challenge, no client proof of
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
    // (undertone/depth/season), the raw selfie never leaves the phone; these 3 buckets are what
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
// Reads only the PUBLIC base layer; no keys, no writes. The caller names the owner; without one
// there is nothing to show, never someone else's palette.
app.get('/api/privacy-proof', async (req, res) => {
  try {
    const ownerPubkey = req.query.owner;
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
    // campaign into her enclave, the agent matches it in-enclave (she is offline), and, only on
    // a real match, settles her payout from escrow against the private receipt. runOffer self-seals
    // a fresh matching palette if she has not sealed yet, so the demo always resolves.
    const payout = Number(req.body && req.body.payout) || 5;
    // Prefer her real sealed palette (device-seal leaves her pubkey + agent + traits in
    // session; her owner secret is not needed). Falls back to self-seal if she hasn't sealed.
    const r = await runOffer({ ownerPubkey: session.her, ownerSecret: session.owner, agentSecret: session.agent, traits: session.traits, payout });
    console.log('offer', r.matched ? 'matched+settled' : 'no-match', r.campaign, 'her', r.herBalance);
    res.json(r);
  } catch (e) { recordError('offer', e, { alert: true }); res.status(500).json({ error: String(e.message || e) }); }
});

// ── SEEKER GENESIS TOKEN (optional, opt-in, only reached if she connected a Seeker
// wallet via MWA; never touches her passkey identity or Palette) ───────────────────
// Two-step so we never trust a bare pubkey string over HTTP: (1) issue a nonce for her
// to sign with the MWA-connected wallet, (2) verify that signature + the on-chain SGT
// checks + the anti-replay claim together. See client/genesis-check.mjs.
// Off unless OIRA_GENESIS=1. The current app does not use these routes.
const GENESIS_ON = process.env.OIRA_GENESIS === '1';
app.use('/api/genesis', (req, res, next) => (GENESIS_ON ? next() : res.status(404).json({ error: 'not found' })));
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
// (target shade + salt), that stays server-side, exactly as the on-chain commitment intends.
const EX_ADDR = (a) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
// ── BRAND BRIEFS ───────────────────────────────────────────────────────────
// A brand describes the shade it made, what one yes pays, and how many women to ask. Running it
// asks that many sealed women privately, one campaign each, as each woman's own agent: her rules
// first, then the match in the rollup, then payment on a yes. The brand only ever sees counts.
const CATS = ['Foundation', 'Concealer', 'Lipstick', 'Blush', 'Skincare', 'Other'];
const SEASONS_12 = ['Bright Spring', 'True Spring', 'Light Spring', 'Light Summer', 'True Summer', 'Soft Summer', 'Soft Autumn', 'True Autumn', 'Deep Autumn', 'Deep Winter', 'True Winter', 'Bright Winter'];
const counts = (b) => b.results || { asked: 0, yes: 0, no: 0, turnedAway: 0, paid: 0 };
{ const n = migrateBriefs(); if (n) console.log('briefs: moved', n, 'old per-woman records to totals'); }

const publicBrief = (b) => ({ campaign: b.id, label: b.label, payout: b.payout, category: b.category, reach: b.reach, status: b.status, createdAt: b.createdAt, results: counts(b) });

app.post('/api/brand/campaign', async (req, res) => {
  try {
    const b = req.body || {}; const target = b.target || {};
    const t = { tu: Number(target.tu), td: Number(target.td), ts: Number(target.ts), tol: Number(target.tol ?? 1) };
    if (![t.tu, t.td, t.ts, t.tol].every(Number.isInteger)) return res.status(400).json({ error: 'target {tu,td,ts,tol} required' });
    if (t.tu > 3 || t.td < 1 || t.td > 10 || t.ts > 11 || t.tol > 5) return res.status(400).json({ error: 'target out of range' });
    const payout = Math.min(Math.max(Number(b.payout) || 5, 1), 50);
    const label = String(b.label || 'Brand').slice(0, 40);
    const category = Math.max(0, Math.min(CATS.length - 1, Number(b.category) || 0));
    const reach = Math.max(1, Math.min(10, Number(b.reach) || 3));
    const brief = addBrief({ label, category, payout, target: t, reach, brandSeed: brandSeedFor(label) });
    console.log('brand brief', brief.id, label, '$' + payout, 'reach', reach);
    res.json(publicBrief(brief));
  } catch (e) { console.error('brand/campaign', e.message); res.status(500).json({ error: String(e.message || e) }); }
});

app.get('/api/brand/campaigns', (_req, res) => {
  res.json({ campaigns: listBriefs().map(publicBrief), women: listWomen().length });
});

// One brief runs at a time: every ask spends from the same sponsor key.
let running = null;
async function runBrief(id) {
  const brief = getBrief(id); if (!brief) return;
  updateBrief(id, { status: 'running' });
  try {
    // One pass over the women, so nobody is asked twice; who was asked is never written down.
    const pool = listWomen().sort(() => Math.random() - 0.5);
    let done = 0;
    for (const owner of pool) {
      if (done >= brief.reach) break;
      try {
        const r = await askHer({ brief, ownerPubkey: owner });
        if (r.outcome === 'unavailable') continue;
        done++;
        addResult(id, r.outcome, r.amount || 0);
        sealForHer(owner, { brand: brief.label, category: CATS[brief.category] || 'Other', season: SEASONS_12[brief.target.ts] || '',
          payout: brief.payout, outcome: r.outcome, reason: r.reason || null, amount: r.outcome === 'yes' ? r.amount || 0 : 0,
          explorer: r.outcome === 'yes' ? r.explorer || null : null });
        console.log('brief', id.slice(0, 8), r.outcome, r.reason || '');
      } catch (e) {
        recordError('brief-ask', e);
      }
    }
  } catch (e) { recordError('brief-run', e); }
  finishBrief(id);
}

app.post('/api/brand/match', async (req, res) => {
  const id = String((req.body && req.body.campaign) || '');
  const brief = getBrief(id);
  if (!brief) return res.status(404).json({ error: 'brief not found' });
  if (brief.status !== 'open') return res.status(409).json({ error: 'This brief has already been asked.' });
  if (running) return res.status(409).json({ error: 'Another brief is being asked right now. Try again in a minute.' });
  if (!listWomen().length) return res.status(409).json({ error: 'No sealed women to ask yet.' });
  // Each brief funds a brand key and a campaign per woman asked, so it waits on the budget too.
  if (!(await sponsorBudgetOk())) return res.status(429).json({ error: "Today's budget for asking is used up. Briefs start again at 00:00 UTC." });
  if (running) return res.status(409).json({ error: 'Another brief is being asked right now. Try again in a minute.' });
  dayStats.briefs++;
  running = runBrief(id).finally(() => { running = null; });
  res.status(202).json({ started: true, campaign: id });
});

// ── HER ANSWERS ────────────────────────────────────────────────────────────
// What brands asked her and what she answered, for her eyes only. The request is signed by her
// own key over a short message with the time in it, so nobody can read another woman's answers
// by knowing her address, and an old signature stops working after five minutes.
app.get('/api/me/answers', (req, res) => {
  try {
    const owner = String(req.headers['x-oira-owner'] || '');
    const time = Number(req.headers['x-oira-time'] || 0);
    const sig = Buffer.from(String(req.headers['x-oira-sig'] || ''), 'base64');
    if (!owner || !time || sig.length !== 64) return res.status(401).json({ error: 'signed request required' });
    if (Math.abs(Date.now() - time) > 5 * 60_000) return res.status(401).json({ error: 'request too old' });
    let pk; try { pk = new PublicKey(owner).toBytes(); } catch { return res.status(400).json({ error: 'bad owner' }); }
    const msg = Buffer.from(`oira:my-answers:v1\n${owner}\n${time}`);
    if (!nacl.sign.detached.verify(msg, sig, pk)) return res.status(401).json({ error: 'bad signature' });
    // Sealed to her inbox key; her phone opens them. `answers` stays for older app versions.
    const key = inboxKeyFor(owner);
    res.json({ entries: inboxFor(owner), inboxKey: key, answers: [], earned: 0, notifyToken: notifyToken(owner) });
  } catch (e) { console.error('me/answers', e.message); res.status(500).json({ error: 'could not load answers' }); }
});

// ---- Exchange rates, for showing her money in her own currency. The whole table, so the server
// never learns which currency she looks at. ----
app.get('/api/fx', async (req, res) => {
  const t = fxTable() || await refreshFx();
  if (!t) return res.status(503).json({ error: 'rates not available yet' });
  res.set('Cache-Control', 'public, max-age=300');
  res.json(t);
});

// ---- Interest in a feature that doesn't exist yet. One count per feature per country; nothing
// about who tapped is kept. ----
app.post('/api/interest', (req, res) => {
  const kind = String((req.body && req.body.kind) || '');
  const country = String((req.body && req.body.country) || '').toUpperCase();
  if (!INTEREST_KINDS.has(kind) || !/^[A-Z]{2}$/.test(country)) return res.status(400).json({ error: 'kind and a two-letter country required' });
  if (rateLimited(clientIp(req))) return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  countInterest(kind, country);
  res.json({ ok: true });
});
app.get('/api/interest', (req, res) => {
  if (!brandAllowed(req)) return res.status(401).json({ error: 'brand key required' });
  res.json(interestCounts());
});

// ---- Her balance: USDC in her own account. Public on chain anyway, so no signature needed. ----
app.get('/api/balance/:owner', async (req, res) => {
  try { new PublicKey(req.params.owner); } catch { return res.status(400).json({ error: 'bad owner' }); }
  try { res.json({ usdc: await usdcBalance(req.params.owner) }); }
  catch (e) { res.status(500).json({ error: 'could not read the balance' }); }
});

// Sends move her money, and the bridge pays their fees, so each identity gets a few a day.
const SEND_DAY_MAX = process.env.OIRA_SEND_DAY_MAX != null ? Number(process.env.OIRA_SEND_DAY_MAX) : 10;
const sendsToday = new Map();
function sendOverLimit(owner) {
  const day = new Date().toISOString().slice(0, 10);
  const e = sendsToday.get(owner);
  if (!e || e.day !== day) { sendsToday.set(owner, { day, count: 0 }); return false; }
  return e.count >= SEND_DAY_MAX;
}
function recordSend(owner) {
  dayStats.sends++;
  const e = sendsToday.get(owner); if (e) e.count++;
}

// ---- Overnight alerts: how many new answers since a time, for the holder of her read token ----
// The phone's background check calls this with the token it got from /api/me/answers. It learns
// a count and the time of the newest answer, nothing else. See notify.mjs.
const newsSeen = new Map();
// ---- Her inbox key: the public half of a key her phone keeps. Signed by her, so nobody can
// point her answers at a key of their own. ----
app.post('/api/me/inbox', (req, res) => {
  const { owner, time, key, sig } = req.body || {};
  const t = Number(time || 0);
  if (!owner || !t || !key || !sig) return res.status(400).json({ error: 'owner, time, key and sig required' });
  if (Math.abs(Date.now() - t) > 5 * 60_000) return res.status(401).json({ error: 'request too old' });
  let pk; try { pk = new PublicKey(owner).toBytes(); } catch { return res.status(400).json({ error: 'bad owner' }); }
  const keyBytes = Buffer.from(String(key), 'base64');
  if (keyBytes.length !== 32) return res.status(400).json({ error: 'bad key' });
  if (!nacl.sign.detached.verify(Buffer.from(`oira:inbox-key:v1\n${owner}\n${key}\n${t}`), Buffer.from(String(sig), 'base64'), pk)) return res.status(401).json({ error: 'bad signature' });
  if (!setInboxKey(owner, keyBytes.toString('base64'))) return res.status(404).json({ error: 'seal your Palette first' });
  res.json({ ok: true });
});

// ---- She moved from her device key to a passkey. Signed by the OLD key, naming the new address,
// and only once the new address has sealed, so nobody can be taken off the list before their new
// seal is in place. Brands stop being sent to the old address; nothing else changes. ----
app.post('/api/me/retire', (req, res) => {
  const { owner, to, time, sig } = req.body || {};
  const t = Number(time || 0);
  if (!owner || !to || !t || !sig) return res.status(400).json({ error: 'owner, to, time and sig required' });
  if (Math.abs(Date.now() - t) > 5 * 60_000) return res.status(401).json({ error: 'request too old' });
  let pk; try { pk = new PublicKey(owner).toBytes(); new PublicKey(to); } catch { return res.status(400).json({ error: 'bad address' }); }
  if (owner === to) return res.status(400).json({ error: 'same address' });
  if (!nacl.sign.detached.verify(Buffer.from(`oira:retire:v1\n${owner}\n${to}\n${t}`), Buffer.from(String(sig), 'base64'), pk)) return res.status(401).json({ error: 'bad signature' });
  if (!isRegistered(to)) return res.status(409).json({ error: 'seal the new address first' });
  if (!retireWoman(owner, to)) return res.status(404).json({ error: 'nothing to retire' });
  console.log('retired', owner.slice(0, 6), 'moved to', to.slice(0, 6));
  res.json({ ok: true });
});

app.get('/api/me/news', (req, res) => {
  const owner = ownerOfToken(String(req.headers['x-oira-notify'] || ''));
  if (!owner) return res.status(401).json({ error: 'unknown token' });
  const now = Date.now();
  const recent = (newsSeen.get(owner) || []).filter((t) => now - t < 3_600_000);
  if (recent.length >= 30) return res.status(429).json({ error: 'too many checks' });
  newsSeen.set(owner, [...recent, now]);
  const since = Number(req.query.since) || 0;
  const fresh = inboxFor(owner).filter((e) => e.at > since);
  res.json({ count: fresh.length, latest: fresh.reduce((m, e) => Math.max(m, e.at), since) });
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
  ws.on('message', async (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.t === 'sig' && pending.has(m.id)) { const r = pending.get(m.id); pending.delete(m.id); return r(Buffer.from(m.sig, 'base64')); }
    /* Her rules, written to her palette. Her key signs on her phone; no sponsor SOL is spent. */
    if (m.t === 'rules' && !started) {
      if (rateLimited(ip)) { try { ws.send(JSON.stringify({ t: 'error', message: 'Too many requests. Please wait a moment.' })); } catch {} return ws.close(); }
      started = true;
      setRulesRelay({ ownerPubkey: m.ownerPubkey, minPayout: m.minPayout, maxPerBrand: m.maxPerBrand, sign })
        .then((r) => { try { ws.send(JSON.stringify({ t: 'done', ...r })); } catch {} })
        .catch((e) => { recordError('relay-rules', e); try { ws.send(JSON.stringify({ t: 'error', message: String(e.message || e) })); } catch {} });
      return;
    }
    /* Her USDC, sent where she says. Her key signs the transfer on her phone; the bridge pays the
       network fee and any new USDC account's rent. */
    if (m.t === 'send' && !started) {
      if (rateLimited(ip)) { try { ws.send(JSON.stringify({ t: 'error', message: 'Too many requests. Please wait a moment.' })); } catch {} return ws.close(); }
      let owner; try { owner = new PublicKey(m.ownerPubkey).toBase58(); } catch { try { ws.send(JSON.stringify({ t: 'error', message: 'bad owner' })); } catch {} return ws.close(); }
      if (sendOverLimit(owner)) { try { ws.send(JSON.stringify({ t: 'error', message: `You've sent ${SEND_DAY_MAX} times today, so the next one waits until tomorrow. Your money is still in your account.` })); } catch {} return ws.close(); }
      started = true;
      if (!(await sponsorBudgetOk())) { try { ws.send(JSON.stringify({ t: 'error', message: BUDGET_MSG })); } catch {} return ws.close(); }
      sendUsdcRelay({ ownerPubkey: owner, to: m.to, amount: m.amount, sign })
        .then((r) => { recordSend(owner); console.log('sent', r.amount, 'USDC from', owner.slice(0, 6), 'to', r.to.slice(0, 6)); try { ws.send(JSON.stringify({ t: 'done', ...r })); } catch {} })
        .catch((e) => { recordError('relay-send', e); try { ws.send(JSON.stringify({ t: 'error', message: String(e.message || e) })); } catch {} });
      return;
    }
    if (m.t === 'start' && !started) {
      if (rateLimited(ip)) { try { ws.send(JSON.stringify({ t: 'error', message: 'Too many requests. Please wait a moment.' })); } catch {} return ws.close(); }
      if (sealDayFull()) { try { ws.send(JSON.stringify({ t: 'error', message: "We've sealed a lot of Palettes today, so new ones are paused until tomorrow. Your reading's still safe on your phone." })); } catch {} return ws.close(); }
      if (sealOverLimit(ip)) { try { ws.send(JSON.stringify({ t: 'error', message: `You have already sealed ${SEAL_MAX} Palettes from this connection today. This limit is per day, and it resets on its own.` })); } catch {} return ws.close(); }
      started = true;
      const traits = (m.traits && Number.isInteger(m.traits.undertone) && Number.isInteger(m.traits.depth) && Number.isInteger(m.traits.season)) ? m.traits : undefined;
      const encBlob = m.encBlob ? Buffer.from(m.encBlob, 'base64') : undefined;
      const salt = m.salt ? Buffer.from(m.salt, 'base64') : undefined; // her passkey-derived salt: used to build the seal, never stored
      // assurance travels straight from her client ('wallet' vs 'passkey'/'fallback'/absent),
      // it decides whether sealPaletteRelay sponsors her shortfall or requires her own funds.
      const assurance = m.assurance === 'wallet' ? 'wallet' : m.assurance;
      // A wallet sign-in pays its own way; everything else is sponsored, so it waits on the budget.
      if (assurance !== 'wallet' && !(await sponsorBudgetOk())) { try { ws.send(JSON.stringify({ t: 'error', message: BUDGET_MSG })); } catch {} return ws.close(); }
      let charged = false;
      const beforeSponsor = () => { if (charged) return; chargeSponsor(ip); charged = true; };
      sealPaletteRelay({ ownerPubkey: m.ownerPubkey, traits, encBlob, lifetimeCap: m.lifetimeCap || 0, salt, sign, assurance, beforeSponsor })
        .then((r) => {
          // server keeps ONLY the bounded agent key + her pubkey/traits (for the overnight);
          // never her owner secret and never her salt (device holds/derives that).
          session.owner = null; session.agent = r.agent; session.salt = null; session.traits = r.traits; session.palette = r.palette; session.her = r.her;
          recordSeal(ip); // only now, with a Palette actually on chain, does this count
          registerWoman(r.her);
          console.log('sealed (relayed)', r.palette, 'her', r.her);
          ws.send(JSON.stringify({ t: 'done', palette: r.palette, her: r.her, sealSig: r.sealSig, explorer: r.explorer }));
        })
        .catch((e) => {
          /* A re-seal refused because her first reading is locked in: she is sealed already. */
          if (/Custom"?:\s*6005/.test(String(e.message || e))) { try { registerWoman(new PublicKey(m.ownerPubkey).toBase58()); } catch {} }
          else if (!(e instanceof SponsorLimit)) recordError('relay-seal', e, { alert: true });
          try { ws.send(JSON.stringify({ t: 'error', message: String(e.message || e) })); } catch {}
        });
    }
  });
  ws.on('close', () => pending.clear());
});

// Proactive degradation alerts, catch a low deployer balance or an unreachable RPC/TEE before it
// breaks a real seal, not after. Every 5 min; alertBridge rate-limits so this can't spam.
setInterval(() => {
  const s = bridgeStatus();
  // The daily summary, once the UTC day has turned. One message: what happened, and what it cost.
  budget.observe(s.deployerSol);
  if (dayStats.day !== today()) {
    const p = budget.previous();
    const errors = monitorStats().errorCount - dayStats.errors0;
    const spent = p && p.day === dayStats.day ? `${p.spent} SOL sponsored` : 'sponsored SOL not measured';
    dailyReport(`${dayStats.day}: ${dayStats.seals} seals, ${dayStats.sends} sends, ${dayStats.briefs} briefs, ${errors} errors, ${spent}, balance ${s.deployerSol} SOL`);
    Object.assign(dayStats, { day: today(), seals: 0, sends: 0, briefs: 0, errors0: monitorStats().errorCount });
  }
  if (s.deployerSol != null && s.deployerSol < 1) alertBridge('warn', `deployer balance low: ${s.deployerSol} SOL: top up`);
  if (s.rpcOk === false) alertBridge('warn', 'base devnet RPC unreachable');
  if (s.teeOk === false) alertBridge('warn', 'MagicBlock TEE unreachable');
}, 5 * 60_000).unref();

server.listen(PORT, HOST, () => console.log(`Oira bridge (http+ws) on http://${HOST}:${PORT}`));
