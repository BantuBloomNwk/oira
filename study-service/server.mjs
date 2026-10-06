/**
 * The Oira open study: where a woman's readings land when she chooses to send them.
 *
 * Its own small service, on purpose. The sealing bridge carries every seal; this carries a
 * research page. If this falls over, nobody's seal does.
 *
 * What it keeps, one JSON line per submission: the numbers she was shown before she sent
 * them (her skin as colour values, the light, the confidence, the shade she picked for
 * herself, her phone's model) plus a server time and a random id. Never a name, never an
 * image, never her IP address, never anything she was not shown. Her deletion code is kept
 * only as a hash, so this file cannot be used to recover it.
 *
 * Routes (Caddy sends /api/study/* here; app.myoira.com proxies /api/* to Caddy):
 *   POST /api/study/submit   her readings. Strictly validated; anything else is refused.
 *   POST /api/study/delete   { code }: removes every submission made with that code.
 *   GET  /api/study/count    how many submissions and readings there are. Public.
 *   GET  /api/study/export   everything, as JSON lines. Needs the export token.
 *
 * No dependencies. Node's own http, crypto and fs.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8779);
const DATA = process.env.STUDY_DATA || '/data/study.jsonl';
const TOKEN = process.env.STUDY_EXPORT_TOKEN || '';
/* The team passphrase for the operator tool (study.html). Not the export token: it can add
   bench trials and nothing else. */
const TEAM = process.env.STUDY_TEAM_KEY || '';
const BENCH = process.env.STUDY_BENCH || path.join(path.dirname(DATA), 'bench.jsonl');
const MAX_BODY = 16 * 1024;

fs.mkdirSync(path.dirname(DATA), { recursive: true });
if (!fs.existsSync(DATA)) fs.writeFileSync(DATA, '');
if (!fs.existsSync(BENCH)) fs.writeFileSync(BENCH, '');

/* ---- validation: only the fields the page shows her, only in sane ranges ------------- */

const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const str = (v, max, re) => typeof v === 'string' && v.length <= max && (!re || re.test(v));
const VERDICTS = new Set(['good', 'dim', 'warm-bulb', 'cool-cast', 'green-cast', 'blown', 'camera-off']);
const BANDS = new Set(['firm', 'fair', 'thin']);
const PLATFORMS = new Set(['android', 'ios', 'ipad', 'desktop', 'other']);
const SETTINGS = new Set(['window', 'indoor', 'outdoor', 'unsure']);

function cleanReading(r) {
  if (!r || typeof r !== 'object') return null;
  const ok =
    num(r.L, 0, 100) && num(r.a, -128, 128) && num(r.b, -128, 128) && num(r.ita, -180, 180) &&
    int(r.monk, 1, 10) && (r.cct === null || num(r.cct, 0, 100000)) && num(r.confidence, 0, 1) &&
    BANDS.has(r.band) && VERDICTS.has(r.verdict) && typeof r.whiteBalanced === 'boolean' &&
    typeof r.strongCast === 'boolean' && int(r.samples, 0, 10_000_000) &&
    (r.lightLevel === undefined || r.lightLevel === null || num(r.lightLevel, 0, 1));
  if (!ok) return null;
  const round = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  return {
    L: round(r.L, 2), a: round(r.a, 2), b: round(r.b, 2), ita: round(r.ita, 2), monk: r.monk,
    cct: r.cct === null ? null : Math.round(r.cct), confidence: round(r.confidence, 2), band: r.band,
    verdict: r.verdict, whiteBalanced: r.whiteBalanced, strongCast: r.strongCast, samples: r.samples,
    lightLevel: typeof r.lightLevel === 'number' ? round(r.lightLevel, 3) : null,
  };
}

function cleanSubmission(s) {
  if (!s || typeof s !== 'object' || s.v !== 1) return { error: 'unknown format' };
  if (s.adult !== true || s.consent !== true || s.notIllinois !== true) return { error: 'consent missing' };
  if (!int(s.monkSelf, 1, 10)) return { error: 'shade missing' };
  if (!PLATFORMS.has(s.platform)) return { error: 'bad platform' };
  if (!str(s.model, 40, /^[\w .()+\-/,]*$/)) return { error: 'bad model' };
  if (!(s.country === '' || str(s.country, 2, /^[A-Z]{2}$/))) return { error: 'bad country' };
  if (!str(s.code, 64, /^[A-Za-z0-9-]{8,64}$/)) return { error: 'bad code' };
  /* Where she said she was, her phone's hour, and the browser family: what lets a reading be
     judged daylight or not, and an in-app browser be told apart from a real one. */
  if (!(s.setting === undefined || SETTINGS.has(s.setting))) return { error: 'bad setting' };
  if (!(s.localHour === undefined || int(s.localHour, 0, 23))) return { error: 'bad hour' };
  if (!(s.browser === undefined || str(s.browser, 24, /^[\w .-]*$/))) return { error: 'bad browser' };
  const opt = (v, max, re) => v === undefined || v === '' || str(v, max, re);
  if (!opt(s.make, 24, /^[\w .-]*$/)) return { error: 'bad make' };
  if (!opt(s.modelSelf, 40, /^[\w .()-]*$/)) return { error: 'bad model choice' };
  if (!opt(s.camera, 24, /^[\dx@?]*$/)) return { error: 'bad camera' };
  if (!opt(s.screen, 24, /^[\dx@.]*$/)) return { error: 'bad screen' };
  if (!Array.isArray(s.readings) || s.readings.length < 1 || s.readings.length > 10) return { error: 'readings' };
  const readings = s.readings.map(cleanReading);
  if (readings.some((r) => !r)) return { error: 'bad reading' };
  return {
    row: {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      v: 1,
      monkSelf: s.monkSelf,
      platform: s.platform,
      model: s.model,
      country: s.country,
      readings,
      codeHash: crypto.createHash('sha256').update(`oira-study:${s.code}`).digest('hex'),
      /* The page says so when this phone has sent before, so the headline counts women,
         not submissions. A woman on a second phone still counts twice; the page says that. */
      repeat: s.repeat === true,
      setting: s.setting ?? null,
      localHour: s.localHour ?? null,
      browser: s.browser ?? null,
      make: s.make || null,
      modelSelf: s.modelSelf || null,
      camera: s.camera || null,
      screen: s.screen || null,
    },
  };
}

/* ---- whose address is this --------------------------------------------------------------
   Women reach us through Netlify's /api proxy, then Caddy. Caddy does not trust anyone's
   forwarded header, so what it passes on is the Netlify edge that connected, shared by every
   woman in that region, so a busy hour from one region would start turning women away.
   Netlify signs what it proxies (netlify.toml `signed`) with a secret only it and we hold.
   When that signature checks out, its client-IP header is hers; otherwise it is ignored,
   because anyone can send it. */

const PROXY_SECRET = process.env.OIRA_PROXY_SIGNATURE || '';
function viaNetlify(req) {
  const tok = req.headers['x-nf-sign'];
  if (!PROXY_SECRET || typeof tok !== 'string') return false;
  const [h, p, s] = tok.split('.');
  if (!h || !p || !s) return false;
  const want = crypto.createHmac('sha256', PROXY_SECRET).update(`${h}.${p}`).digest();
  const got = Buffer.from(s, 'base64url');
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return false;
  try {
    const c = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    return c.iss === 'netlify' && (!c.exp || c.exp * 1000 > Date.now());
  } catch { return false; }
}

/* ---- rate limit, in memory only: the address is a map key for an hour, never written -- */

const hits = new Map();
function limited(ip, max) {
  const now = Date.now();
  const h = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  h.push(now);
  hits.set(ip, h);
  return h.length > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (!v.some((t) => now - t < 3600_000)) hits.delete(k);
}, 600_000).unref();

/* ---- storage ------------------------------------------------------------------------- */

let writing = Promise.resolve();
const serial = (fn) => (writing = writing.then(fn, fn));
const rows = () => fs.readFileSync(DATA, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/* ---- http ---------------------------------------------------------------------------- */

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

function readBody(req, max = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const netlify = viaNetlify(req);
  const ip = (netlify && String(req.headers['x-nf-client-connection-ip'] || '').trim())
    || String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  try {
    if (req.method === 'GET' && url.pathname === '/api/study/health') return send(res, 200, { ok: true, signed: netlify });

    if (req.method === 'GET' && url.pathname === '/api/study/count') {
      const all = rows();
      const tally = (f) => all.reduce((m, r) => { const k = f(r); m[k] = (m[k] || 0) + 1; return m; }, {});
      /* Small groups are folded into "other" so no country here can point at one woman. */
      const countries = tally((r) => r.country || 'not said');
      const byCountry = {};
      for (const [k, v] of Object.entries(countries)) {
        const key = k === 'not said' || v >= 3 ? k : 'other';
        byCountry[key] = (byCountry[key] || 0) + v;
      }
      return send(res, 200, {
        women: all.filter((r) => !r.repeat).length,
        submissions: all.length,
        readings: all.reduce((n, r) => n + r.readings.length, 0),
        byShade: tally((r) => r.monkSelf),
        byPlatform: tally((r) => r.platform),
        byMake: tally((r) => r.make || 'unknown'),
        byCountry,
        byDay: tally((r) => r.at.slice(0, 10)),
        phoneModels: new Set(all.map((r) => r.model)).size,
        /* How many countries, counted before the small ones are folded into "other": a
           number, never the names, so the total is honest without singling anyone out. */
        countries: new Set(all.map((r) => r.country).filter(Boolean)).size,
        first: all[0]?.at ?? null,
        last: all[all.length - 1]?.at ?? null,
        updated: new Date().toISOString(),
      });
    }

    const tokenOk = () => {
      const given = Buffer.from(String(req.headers.authorization || '').replace(/^Bearer /, ''));
      const want = Buffer.from(TOKEN);
      return !!TOKEN && given.length === want.length && crypto.timingSafeEqual(given, want);
    };

    if (req.method === 'GET' && url.pathname === '/api/study/export') {
      if (!tokenOk()) return send(res, 401, { error: 'no' });
      return send(res, 200, fs.readFileSync(DATA, 'utf8'), 'application/x-ndjson');
    }

    if (req.method === 'GET' && url.pathname === '/api/study/bench/export') {
      if (!tokenOk()) return send(res, 401, { error: 'no' });
      return send(res, 200, fs.readFileSync(BENCH, 'utf8'), 'application/x-ndjson');
    }

    /* Bench trials from the operator tool, behind the team passphrase. Stored as sent, with a
       server time, because the tool's rows carry many more fields than the public study and
       they change as the bench does. Size capped; only arrays of plain objects. */
    if (req.method === 'POST' && url.pathname === '/api/study/bench') {
      const given = Buffer.from(String(req.headers['x-oira-team'] || ''));
      const want = Buffer.from(TEAM);
      if (!TEAM || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return send(res, 401, { error: 'team passphrase wrong' });
      if (limited(ip, 120)) return send(res, 429, { error: 'too many, try again in an hour' });
      const body = JSON.parse(await readBody(req, 512 * 1024));
      const trials = body?.trials;
      if (!Array.isArray(trials) || !trials.length || trials.length > 500 || trials.some((t) => !t || typeof t !== 'object' || Array.isArray(t)))
        return send(res, 400, { error: 'expected trials' });
      const batch = crypto.randomUUID();
      const at = new Date().toISOString();
      await serial(() => fs.appendFileSync(BENCH, trials.map((t) => JSON.stringify({ batch, received: at, ...t })).join('\n') + '\n'));
      return send(res, 200, { ok: true, stored: trials.length, batch });
    }

    if (req.method === 'POST' && url.pathname === '/api/study/submit') {
      if (limited(ip, 12)) return send(res, 429, { error: 'too many, try again in an hour' });
      const body = JSON.parse(await readBody(req));
      const { row, error } = cleanSubmission(body);
      if (!row) return send(res, 400, { error });
      await serial(() => fs.appendFileSync(DATA, JSON.stringify(row) + '\n'));
      return send(res, 200, { ok: true, id: row.id });
    }

    if (req.method === 'POST' && url.pathname === '/api/study/delete') {
      if (limited(ip, 20)) return send(res, 429, { error: 'too many, try again in an hour' });
      const body = JSON.parse(await readBody(req));
      if (!str(body?.code, 64, /^[A-Za-z0-9-]{8,64}$/)) return send(res, 400, { error: 'bad code' });
      const hash = crypto.createHash('sha256').update(`oira-study:${body.code}`).digest('hex');
      let removed = 0;
      await serial(() => {
        const keep = rows().filter((r) => (r.codeHash === hash ? (removed++, false) : true));
        const tmp = DATA + '.tmp';
        fs.writeFileSync(tmp, keep.map((r) => JSON.stringify(r)).join('\n') + (keep.length ? '\n' : ''));
        fs.renameSync(tmp, DATA);
      });
      return send(res, 200, { ok: true, removed });
    }

    return send(res, 404, { error: 'not here' });
  } catch (e) {
    return send(res, 400, { error: 'bad request' });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`oira-study listening on ${PORT}, data ${DATA}`));
