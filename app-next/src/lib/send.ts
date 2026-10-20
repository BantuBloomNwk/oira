import { b64, type Owner } from './owner';
import { bridgeWsUrl } from './seal';
import { sendSignGuard } from './signguard';
import { BRIDGE_ORIGIN, isNativeApp } from './native';
import { diag } from './diag';

/* Her money, out. What brands paid her sits in a USDC account that only her key controls; this
   sends it wherever she says: her own wallet, her card's deposit address, anyone's. Her key signs
   on this phone and the bridge pays the network fee, so she needs no SOL. Everything she is asked
   to sign is checked first, and only this one transfer is allowed. */

/* The USDC Oira pays in on devnet. Fixed here rather than taken from the bridge, so the bridge
   cannot swap in another token. */
export const OIRA_USDC_MINT = 'EAWvXcLatBic1Vzb31qQtqENAQTPEcX46jruJ7uGXmR';

const base = () => (isNativeApp() ? BRIDGE_ORIGIN : '');

export async function fetchBalance(address: string): Promise<number> {
  const r = await fetch(`${base()}/api/balance/${address}`, { cache: 'no-store' });
  if (!r.ok) throw new Error('balance');
  return Number((await r.json()).usdc) || 0;
}

export interface Sent { sig: string; amount: number; to: string; explorer: string; createdAccount: boolean }

export function sendUsdc(owner: Owner, to: string, amount: number): Promise<Sent> {
  return new Promise((resolve, reject) => {
    const micro = BigInt(Math.round(amount * 1e6));
    const allowed = sendSignGuard(owner.address, { to: to.trim(), micro, mint: OIRA_USDC_MINT });
    const ws = new WebSocket(bridgeWsUrl());
    let done = false;
    const finish = (e: Error | null, r?: Sent) => {
      if (done) return; done = true; clearTimeout(timer);
      try { ws.close(); } catch { /* closing */ }
      if (e) { diag('send', `did not send: ${e.message.slice(0, 120)}`); reject(e); } else { diag('send', `sent ${r!.amount} USDC`); resolve(r!); }
    };
    const timer = setTimeout(() => finish(new Error("That took too long, love. Nothing left your account; try again in a minute.")), 90_000);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'send', ownerPubkey: owner.address, to: to.trim(), amount }));
    ws.onmessage = (ev) => {
      let m: { t: string; id?: string; msg?: string; message?: string } & Partial<Sent>;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.t === 'sign' && m.msg) {
        const bytes = b64.dec(m.msg);
        try { allowed(bytes); } catch (e) {
          diag('send', `refused to sign: ${(e as Error).message}`);
          finish(new Error("Something didn't match what you asked for, so I didn't sign. Nothing left your account."));
          return;
        }
        owner.sign(bytes).then((sig) => ws.send(JSON.stringify({ t: 'sig', id: m.id, sig: b64.enc(sig) }))).catch((e) => finish(e instanceof Error ? e : new Error(String(e))));
        return;
      }
      if (m.t === 'done' && m.sig) finish(null, { sig: m.sig, amount: Number(m.amount), to: String(m.to), explorer: String(m.explorer), createdAccount: !!m.createdAccount });
      if (m.t === 'error') finish(new Error(m.message || "It didn't send. Nothing left your account."));
    };
    ws.onerror = () => finish(new Error("I couldn't reach the bridge, so nothing was sent."));
  });
}
