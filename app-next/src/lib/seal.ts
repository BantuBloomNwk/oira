/**
 * Sealing, over a socket, with her key never leaving the phone.
 *
 * The bridge builds the Solana transactions and hands each message back for signing. She
 * signs on device, the bridge relays. It never sees a secret, and it does not need to: what
 * crosses the wire is a message to sign and a signature coming back.
 *
 * Ported from sealViaDevice in app/custody.js. Takes an Owner, so it does not know or care
 * whether she came in through a fingerprint or a wallet. See src/lib/owner.ts.
 *
 * WHY THIS IS A WEBSOCKET AND NOT THE /api PROXY EVERYTHING ELSE USES.
 *
 * app-next/netlify.toml proxies /api/* to the bridge so the concierge stays same-origin and
 * `connect-src 'self'` never has to name a third party. That trick does not work here:
 * Netlify's rewrites do not carry a WebSocket upgrade. So this connects to the bridge
 * directly, and public/_headers names the wss origin in connect-src for exactly this reason
 * and no other. It is the second and last entry on that line.
 */

import { b64, type Owner } from './owner';
import { sealSignGuard } from './signguard';

/* Traits are the only thing about her that crosses. No image, no landmarks, no Lab values,
   no key. The bridge enforces the same boundary again on its side. */
export interface SealRequest {
  traits: { undertone: number; depth: number; season: number };
  /* Base64 AES-GCM recovery blob, when there is one. */
  encBlob?: string | null;
  lifetimeCap?: number;
}

/* What the bridge actually sends back on success. Named from a real seal rather than guessed:
   an earlier version of the caller looked for `receipt`, `signature` and `tx`, none of which
   exist, so every successful seal produced an undefined receipt and the vault showed nothing.
   The fields are what they are because of where the seal runs. */
export interface SealResult {
  t: 'done';
  /* Her palette account. Delegated to MagicBlock's delegation program, which is why the
     signature below will not be found on devnet base: the seal executes on the ephemeral
     rollup, and only the account is visible from the base layer. */
  palette?: string;
  /* Her owner address, echoed back. */
  her?: string;
  /* The seal transaction signature, on the rollup. */
  sealSig?: string;
  explorer?: string;
  [k: string]: unknown;
}

/* Long, and deliberately. A seal is several signatures, and on the wallet path every one of
   them is her switching to another app, reading a prompt and coming back. Timing out
   underneath a woman who is doing exactly what she was asked to do would be our bug. */
const TIMEOUT_MS = 150_000;

export function bridgeWsUrl(): string {
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1') return `ws://${h}:8777/api/seal/ws`;
  return 'wss://oira.161-97-74-212.sslip.io/api/seal/ws';
}

export function sealViaDevice(
  owner: Owner,
  { traits, encBlob = null, lifetimeCap = 0 }: SealRequest
): Promise<SealResult> {
  return new Promise((resolve, reject) => {
    let done = false;
    const allowed = sealSignGuard(owner.address, traits, owner.salt);
    const ws = new WebSocket(bridgeWsUrl());

    const fail = (e: unknown) => {
      if (done) return;
      done = true;
      try { ws.close(); } catch { /* already closing */ }
      reject(e instanceof Error ? e : new Error(String(e)));
    };

    const timer = setTimeout(() => fail(new Error('The seal took too long. Nothing was saved.')), TIMEOUT_MS);

    ws.onopen = () => ws.send(JSON.stringify({
      t: 'start',
      ownerPubkey: owner.address,
      traits,
      encBlob,
      lifetimeCap,
      salt: b64.enc(owner.salt),
      /* The bridge reads this to decide whether she is auto sponsored or has to cover her own
         shortfall from her own wallet. It is the one place the door she came through still
         matters after this point. */
      assurance: owner.assurance,
    }));

    ws.onmessage = (ev) => {
      let m: { t: string; id?: string; msg?: string; message?: string };
      try { m = JSON.parse(ev.data); } catch { return; }

      if (m.t === 'sign' && m.msg) {
        /* Always awaited, never assumed synchronous. A passkey signature is arithmetic on
           bytes already in memory; a wallet signature is a round trip into another app that
           she can decline. A rejection has to fail the whole seal rather than hang here until
           the timeout, which is what an unhandled promise would have done. */
        const bytes = b64.dec(m.msg);
        try { allowed(bytes); } catch {
          fail(new Error("Something asked me to sign a message that isn't part of your seal, so I stopped. Nothing was signed."));
          return;
        }
        owner.sign(bytes)
          .then((sig) => ws.send(JSON.stringify({ t: 'sig', id: m.id, sig: b64.enc(sig) })))
          .catch(fail);
        return;
      }

      if (m.t === 'done') {
        done = true;
        clearTimeout(timer);
        ws.close();
        resolve(m as SealResult);
        return;
      }

      if (m.t === 'error') {
        clearTimeout(timer);
        fail(new Error(m.message || 'The seal failed.'));
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      fail(new Error('I could not reach the sealing bridge.'));
    };
  });
}
