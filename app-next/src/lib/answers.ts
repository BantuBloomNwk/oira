import type { Owner } from './owner';
import { b64 } from './owner';
import nacl from 'tweetnacl';

/* What real brands asked her, and what she answered.
 *
 * Only her own, twice over: the request is signed by her key over a short message with the time
 * in it, and each answer comes back sealed to an inbox key that only this phone holds. The
 * messages she signs are plain text, never a transaction, so a signature can't move anything. */
export interface MyAnswer {
  brand: string;
  category: string;
  season: string;
  payout: number;
  outcome: 'yes' | 'no' | 'declined';
  reason: string | null;
  amount: number;
  explorer: string | null;
  at: number;
}

/* Her inbox key. The server seals each answer to the public half and can't read it again; only
   this phone holds the secret half, so only she sees what brands asked her. It lives with her
   other local data and goes with Delete everything. A reinstall makes a new key, and entries
   sealed to the old one can no longer be opened (her money is on chain and unaffected). */
const INBOX = (address: string) => `oira_inbox_${address}`;
function inboxKey(address: string): nacl.BoxKeyPair {
  try {
    const saved = localStorage.getItem(INBOX(address));
    if (saved) return nacl.box.keyPair.fromSecretKey(b64.dec(saved));
  } catch { /* make a new one */ }
  const kp = nacl.box.keyPair();
  try { localStorage.setItem(INBOX(address), b64.enc(kp.secretKey)); } catch { /* used for this session only */ }
  return kp;
}

async function registerInbox(owner: Owner, bridgeBase: string, publicKey: string) {
  const time = Date.now();
  const sig = await owner.sign(new TextEncoder().encode(`oira:inbox-key:v1\n${owner.address}\n${publicKey}\n${time}`));
  await fetch(`${bridgeBase}/api/me/inbox`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ owner: owner.address, time, key: publicKey, sig: b64.enc(sig) }),
  });
}

interface Sealed { n: string; e: string; c: string; at: number }

export async function fetchMyAnswers(owner: Owner, bridgeBase: string): Promise<{ answers: MyAnswer[]; earned: number; notifyToken?: string }> {
  const time = Date.now();
  const sig = await owner.sign(new TextEncoder().encode(`oira:my-answers:v1\n${owner.address}\n${time}`));
  const r = await fetch(`${bridgeBase}/api/me/answers`, {
    headers: { 'x-oira-owner': owner.address, 'x-oira-time': String(time), 'x-oira-sig': b64.enc(sig) },
  });
  if (!r.ok) throw new Error(`answers ${r.status}`);
  const body: { entries?: Sealed[]; inboxKey?: string | null; notifyToken?: string; answers?: MyAnswer[] } = await r.json();
  const kp = inboxKey(owner.address);
  const mine = b64.enc(kp.publicKey);
  if (body.inboxKey !== mine) registerInbox(owner, bridgeBase, mine).catch(() => { /* tried again next time */ });
  const answers: MyAnswer[] = [];
  for (const s of body.entries || []) {
    try {
      const open = nacl.box.open(b64.dec(s.c), b64.dec(s.n), b64.dec(s.e), kp.secretKey);
      if (open) answers.push({ ...JSON.parse(new TextDecoder().decode(open)), at: s.at });
    } catch { /* sealed to an older key on this address */ }
  }
  // A bridge from before sealed inboxes still sends them readable; show those until it's updated.
  if (!body.entries && Array.isArray(body.answers)) answers.push(...body.answers);
  answers.sort((a, b) => b.at - a.at);
  return { answers, earned: answers.reduce((t, a) => t + (a.outcome === 'yes' ? a.amount : 0), 0), notifyToken: body.notifyToken };
}
