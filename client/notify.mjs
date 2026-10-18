// Overnight answer alerts, without a signature every time.
//
// The phone asks for its answers with a signature, and in that same reply it gets a read token.
// Later, while the app is closed, the phone's background check sends only the token and learns
// one thing: how many new answers have come in since a time it names. No brand, no outcome,
// nothing about her. The token is an HMAC of her address, so nothing is stored, and it only
// works for her own count.
import { createHmac, timingSafeEqual } from 'crypto';

const LABEL = 'oira:notify:v1';

function key() {
  const secret = process.env.OIRA_NOTIFY_SECRET || process.env.OIRA_BRAND_KEY || '';
  if (!secret) return null;
  return createHmac('sha256', 'oira-notify-key').update(secret).digest();
}

const mac = (k, owner) => createHmac('sha256', k).update(`${LABEL}:${owner}`).digest('base64url');

export function notifyToken(owner) {
  const k = key();
  return k ? `${owner}.${mac(k, owner)}` : null;
}

/* The owner the token belongs to, or null if it is not one this bridge issued. */
export function ownerOfToken(token) {
  const k = key();
  if (!k || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const owner = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const want = Buffer.from(mac(k, owner));
  return given.length === want.length && timingSafeEqual(given, want) ? owner : null;
}
