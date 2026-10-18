import type { Owner } from './owner';
import { b64 } from './owner';

/* What real brands asked her, and what she answered.
 *
 * Only her own: the request is signed by her key over a short message with the time in it, and
 * the server refuses anything else. The message is plain text, never a transaction, so the
 * signature cannot be reused to move anything. */
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

export async function fetchMyAnswers(owner: Owner, bridgeBase: string): Promise<{ answers: MyAnswer[]; earned: number; notifyToken?: string }> {
  const time = Date.now();
  const sig = await owner.sign(new TextEncoder().encode(`oira:my-answers:v1\n${owner.address}\n${time}`));
  const r = await fetch(`${bridgeBase}/api/me/answers`, {
    headers: { 'x-oira-owner': owner.address, 'x-oira-time': String(time), 'x-oira-sig': b64.enc(sig) },
  });
  if (!r.ok) throw new Error(`answers ${r.status}`);
  return r.json();
}
