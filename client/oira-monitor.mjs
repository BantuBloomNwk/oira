// Lightweight bridge monitoring — server-side only, privacy-respecting by design: it records the
// bridge's OWN errors and uptime, NEVER user data, and everything it logs or sends is scrubbed of
// anything key- or blob-shaped first. If OIRA_ALERT_WEBHOOK and/or OIRA_TG_TOKEN+OIRA_TG_CHAT are
// set, critical problems are pushed to that webhook / Telegram chat; otherwise it just logs.
// This is what turns "the bridge is a black box" into something the founders can actually watch.

const startedAt = Date.now();
const RING = 25;
const recent = [];          // last few {t, scope, msg} — no user data
let errorCount = 0;
let lastAlertAt = 0;

const WEBHOOK = process.env.OIRA_ALERT_WEBHOOK || '';       // Slack/Discord/generic {text}/{content}
const TG_TOKEN = process.env.OIRA_TG_TOKEN || '';           // Telegram bot token
const TG_CHAT = process.env.OIRA_TG_CHAT || '';             // Telegram chat id

// Redact anything that looks like a secret key, pubkey, signature or byte array before it can reach
// a log line or an alert — a monitor must never become the thing that leaks the data it protects.
function scrub(s) {
  return String(s == null ? '' : (s.message || s))
    .replace(/\[(?:\s*\d{1,3}\s*,){20,}\s*\d{1,3}\s*\]/g, '‹bytes›')   // JSON secret-key arrays
    .replace(/[1-9A-HJ-NP-Za-km-z]{40,}/g, '‹key›')                     // base58 (addresses/sigs)
    .replace(/[A-Za-z0-9+/=]{80,}/g, '‹blob›')                          // long base64
    .slice(0, 400);
}

async function push(text) {
  const jobs = [];
  if (WEBHOOK) jobs.push(fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text }) }));
  if (TG_TOKEN && TG_CHAT) jobs.push(fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }) }));
  if (jobs.length) { try { await Promise.allSettled(jobs); } catch (e) { console.error('monitor: alert send failed', e && e.message); } }
}

export async function alertBridge(level, msg) {
  const line = `[oira-bridge] ${String(level).toUpperCase()}: ${scrub(msg)}`;
  console.error(line);
  // rate-limit so a flapping error can't spam the channel (still always logged above)
  const now = Date.now();
  if (now - lastAlertAt < 45_000) return;
  lastAlertAt = now;
  await push(line);
}

// Record a bridge error. { alert: true } also pushes it to the alert channel (use for the paths that
// actually matter — a failed seal, a crash — not every transient 429).
export function recordError(scope, err, opts = {}) {
  errorCount++;
  const msg = scrub(err);
  recent.push({ t: new Date().toISOString(), scope, msg });
  if (recent.length > RING) recent.shift();
  console.error(`oira-bridge ${scope}:`, msg);
  if (opts.alert) alertBridge(opts.level || 'error', `${scope}: ${msg}`);
}

export function monitorStats() {
  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    errorCount,
    lastError: recent.length ? recent[recent.length - 1] : null,
    alertChannel: !!(WEBHOOK || (TG_TOKEN && TG_CHAT)),
  };
}
