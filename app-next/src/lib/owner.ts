/**
 * Who she is, to the chain, however she got here.
 *
 * TWO DOORS, AND THIS IS THE ROOM BEHIND BOTH OF THEM.
 *
 * Most women who open Oira have never held a wallet and are never going to want one. They
 * get in with a fingerprint. A passkey, gated by Face ID or Touch ID or the Seeker's
 * biometrics, yields a stable secret we derive a Solana key from, so she has an on-chain
 * identity she never had to learn about, no seed phrase to lose, and recovery for free
 * because passkeys sync. She is never shown the word wallet unless she goes looking.
 *
 * Women who already live in crypto get the other door. They have Phantom or Solflare or the
 * Seeker's Seed Vault Wallet, they know what signing is, and asking them to mint a second
 * identity inside our app would be both rude and worse for them. They connect what they have.
 *
 * Both doors are open on every device. That is a product decision, not a technical accident,
 * and it is the reason this type exists: everything downstream, the seal, the brand query,
 * the receipt, takes an Owner and never asks which door it came through. The only thing that
 * differs is `assurance`, and the only code allowed to care is code that genuinely must.
 *
 * WHAT IS DELIBERATELY NOT HERE: a private key. The passkey paths hold one in a closure for
 * exactly as long as a signature takes; the wallet path never sees one at all. `sign` is the
 * whole interface, and it is async because a wallet signature is a round trip to another app
 * on the phone while a passkey signature is arithmetic on bytes already in memory.
 */

export type Assurance =
  /* Derived from her passkey's PRF secret. The default, and the strongest of the three:
     biometric gated, and it comes back on a new device because the platform syncs the
     credential. */
  | 'passkey'
  /* A device local random seed, for browsers with no PRF. No biometric gate and no recovery
     if this device is lost or site data is cleared. Named honestly so nothing downstream can
     quietly treat it as equivalent. */
  | 'fallback'
  /* An external wallet she already had. We never hold the key and every signature is her
     approving a prompt in that app. */
  | 'wallet';

export interface Owner {
  /* Base58, the address anyone would recognise as hers. */
  address: string;
  publicKey: Uint8Array;
  /* What the bridge is handed. */
  publicKeyB64: string;
  /* Her commitment salt, 32 bytes, and it has to be the SAME 32 bytes on every future seal:
     her commitment root is bound to it at her first seal and a re-seal that cannot reproduce
     it is rejected. The passkey paths derive it from the PRF secret. The wallet path derives
     it from a deterministic signature over a fixed message, because Ed25519 signing is
     deterministic and a wallet has no secret it will hand us. */
  salt: Uint8Array;
  assurance: Assurance;
  /* Raw message bytes in, detached signature out. Async on the wallet path because each
     signature is a separate approval in another app; synchronous work wrapped in a promise
     on the passkey paths. Callers must await it either way rather than branching. */
  sign: (message: Uint8Array) => Promise<Uint8Array>;
  /* Scrub the secret from memory. Present on the derived paths, absent on the wallet path,
     which never had one to scrub. */
  wipe?: () => void;
}

/* base58, small enough that both paths carrying their own copy would be sillier than sharing
   this one. Solana addresses only, so no version bytes or checksums. */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let out = '';
  /* Leading zero bytes are leading '1's, which is the one place base58 is not just a base
     change. Dropping them produces an address that is wrong and still looks right. */
  for (const byte of bytes) { if (byte === 0) out += '1'; else break; }
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

export const b64 = {
  enc: (buf: Uint8Array | ArrayBuffer): string =>
    btoa(String.fromCharCode(...new Uint8Array(buf))),
  dec: (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
  urlToBuf: (s: string): Uint8Array => b64.dec(s.replace(/-/g, '+').replace(/_/g, '/')),
  bufToUrl: (buf: Uint8Array | ArrayBuffer): string =>
    b64.enc(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
};

/* The HKDF domain separation strings.
 *
 * DO NOT EDIT ANY OF THESE. They are the difference between a woman recovering her identity
 * on a new phone and silently getting a different one. They match client/oira-custody.mjs
 * byte for byte, and the browser path was checked against that Node reference to prove both
 * derive the identical key from the identical PRF secret. Changing a single character here
 * orphans every existing seal. */
const enc = new TextEncoder();
export const HKDF_SALT = enc.encode('oira:custody:hkdf:salt:v1');
export const OWNER_INFO = enc.encode('oira:owner:ed25519:v1');
export const SEAL_SALT_INFO = enc.encode('oira:seal:salt:v1');
export const APP_PRF_SALT = enc.encode('oira:prf:v1');
/* The wallet path's equivalents. Separate info strings so a wallet owner and a passkey owner
   can never collide on a salt even in the impossible case of identical input bytes. */
export const WALLET_SALT_MESSAGE = enc.encode('oira:wallet:seal:salt:v1');
export const WALLET_SALT_INFO = enc.encode('oira:wallet:seal:salt:info:v1');

export async function hkdf32(ikm: Uint8Array, info: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT as BufferSource, info: info as BufferSource },
    key,
    256
  );
  return new Uint8Array(bits);
}
