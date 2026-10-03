/**
 * Her key, from her fingerprint. The door for women who will never own a wallet.
 *
 * Her passkey (WebAuthn, gated by Face ID, Touch ID, Android biometrics or the Seeker's Seed
 * Vault) exposes a stable 32 byte secret through the PRF extension. Her Solana ed25519 owner
 * key is derived from it with HKDF-SHA256, deterministically, so:
 *   no seed phrase, ever;
 *   recovery for free, because passkeys sync and the same PRF secret gives the same key on a
 *     new phone;
 *   the secret exists only in memory, only at signing time, and is never sent anywhere.
 *
 * Ported from app/custody.js, which is the version that has actually been in women's hands.
 * The salts and info strings live in owner.ts and are byte-identical to it and to the Node
 * reference, so a woman moving from the shipping app to this one keeps the same address.
 *
 * ALMOST EVERY BRANCH BELOW IS A BUG THAT HAPPENED. This file looks over-defensive until you
 * read what each guard is for: minting a second passkey when one already exists does not
 * produce an error, it produces a different woman with a different address and no way back to
 * her seal. That failure is silent, and it shipped once. Do not simplify the control flow
 * here without reading the comment attached to the branch you are removing.
 */

import { isNativeApp, WEB_HOST } from './native';
import nacl from 'tweetnacl';
import {
  APP_PRF_SALT, OWNER_INFO, SEAL_SALT_INFO, b64, base58, hkdf32,
  type Owner,
} from './owner';

const RP_NAME = 'Oira';
/* On the web the passkey belongs to whatever host she is on, which is how every existing
   passkey was made, so nothing is named there. In the app the page is https://localhost and
   would mint a passkey for nobody, a different key and so a different address from the one
   she has on the web. Naming the real domain lets Android's Credential Manager hand the app
   the same passkey, once assetlinks.json on that domain vouches for this package. */
const rpId: string | undefined = isNativeApp() ? WEB_HOST : undefined;
/* Her credential id. Public, not a secret. */
const LS_CRED = 'oira.cred';
/* '1' if this authenticator does PRF, '0' if it does not. */
const LS_PRF = 'oira.prf';
/* The reduced assurance seed, for browsers with no PRF. */
const LS_FALLBACK = 'oira.fbseed';

export function prfSupported(): boolean {
  return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
}

export function hasEnrolled(): boolean {
  try { return !!localStorage.getItem(LS_CRED); } catch { return false; }
}

const hkdfOwnerSeed = (prfSecret: Uint8Array) => hkdf32(prfSecret, OWNER_INFO);

/* Build her owner from a 32 byte seed. The secret never leaves this closure: `sign` closes
   over it and `wipe` is the only other thing that can touch it. */
function ownerFromSeed(seed: Uint8Array, assurance: 'passkey' | 'fallback', salt: Uint8Array): Owner {
  const kp = nacl.sign.keyPair.fromSeed(seed);
  return {
    publicKey: kp.publicKey,
    address: base58(kp.publicKey),
    publicKeyB64: b64.enc(kp.publicKey),
    salt,
    assurance,
    /* Synchronous work, promised anyway, so callers never have to know which door this Owner
       came through. See owner.ts. */
    sign: async (message: Uint8Array) => nacl.sign.detached(message, kp.secretKey),
    wipe: () => kp.secretKey.fill(0),
  };
}

const prfFirst = (c: PublicKeyCredential | null): ArrayBuffer | undefined => {
  const ext = c?.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer }, enabled?: boolean } } | undefined;
  return ext?.prf?.results?.first;
};

async function ownerFromPrf(secretBuf: ArrayBuffer): Promise<Owner> {
  const prfSecret = new Uint8Array(secretBuf);
  const seed = await hkdfOwnerSeed(prfSecret);
  const salt = await hkdf32(prfSecret, SEAL_SALT_INFO);
  prfSecret.fill(0);
  return ownerFromSeed(seed, 'passkey', salt);
}

export interface Enrolled {
  credentialId: string;
  prfEnabled: boolean;
  /* Non-null when the authenticator evaluated PRF during creation, which modern ones do. That
     is what makes enrol and first unlock a single biometric prompt instead of two. */
  owner: Owner | null;
}

/* Mint her passkey. Called once per device, and only ever from a real user action. */
export async function enroll(userLabel?: string): Promise<Enrolled> {
  if (!prfSupported()) throw new Error('This browser cannot do passkeys in a secure context.');
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: rpId ? { name: RP_NAME, id: rpId } : { name: RP_NAME },
      user: { id: userId, name: userLabel || 'oira-user', displayName: userLabel || 'Oira' },
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      /* attachment 'platform' skips the browser's "this device / phone / security key"
         chooser and goes straight to the built in authenticator, which is the one tap
         experience. Cross device passkey sync still works through the platform authenticator
         itself; this only removes the extra question, not the syncing. */
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
        authenticatorAttachment: 'platform',
      },
      /* Evaluate PRF during creation so one biometric prompt covers enrol and first unlock. */
      extensions: { prf: { eval: { first: APP_PRF_SALT } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was created.');

  const first = prfFirst(cred);
  const ext = cred.getClientExtensionResults() as { prf?: { enabled?: boolean } };
  /* Some desktop authenticators keep the passkey but will not do PRF. We remember that
     honestly rather than prompting her and then quietly substituting a different key. */
  const prfEnabled = !!(first || ext?.prf?.enabled === true);

  localStorage.setItem(LS_CRED, b64.bufToUrl(cred.rawId));
  localStorage.setItem(LS_PRF, prfEnabled ? '1' : '0');

  return {
    credentialId: b64.bufToUrl(cred.rawId),
    prfEnabled,
    owner: first ? await ownerFromPrf(first) : null,
  };
}

async function ownerFromAssertion(assertion: PublicKeyCredential): Promise<Owner> {
  const first = prfFirst(assertion);
  if (!first) {
    throw new Error('That did not return the secret Oira needs. Try once more; if it keeps happening this device may not support it.');
  }
  /* Cache so the next unlock takes the fast pinned path instead of a fresh discoverable
     lookup every single time. */
  try {
    localStorage.setItem(LS_CRED, b64.bufToUrl(assertion.rawId));
    localStorage.setItem(LS_PRF, '1');
  } catch { /* storage refused; the unlock still works, it is just slower next time */ }
  return ownerFromPrf(first);
}

const getAssertion = (options: Partial<PublicKeyCredentialRequestOptions>) =>
  navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      userVerification: 'required',
      extensions: { prf: { eval: { first: APP_PRF_SALT } } } as AuthenticationExtensionsClientInputs,
      ...(rpId ? { rpId } : {}),
      ...options,
    },
  }) as Promise<PublicKeyCredential | null>;

/* Single flight.
 *
 * WebAuthn allows one pending request per page, so a second caller racing the first throws.
 * Worse: if both reached enroll(), each create() mints a credential with a fresh random
 * userId, which is a different identity per call. Sharing one in-flight promise makes a
 * concurrent unlock structurally unable to double enrol. */
let inFlight: Promise<Owner> | null = null;

export function unlockOwner(): Promise<Owner> {
  if (!inFlight) inFlight = doUnlock().finally(() => { inFlight = null; });
  return inFlight;
}

async function doUnlock(): Promise<Owner> {
  if (!prfSupported()) return unlockLocal();

  if (!hasEnrolled()) {
    /* Before minting a NEW passkey, and therefore a NEW identity, give this device one chance
       to find an existing one.

       This matters most in a mobile PWA. localStorage, and so LS_CRED, our only "has she
       enrolled" signal, is evicted far more readily than the platform's own passkey store.
       Without this check every eviction silently orphaned her real identity and minted a
       fresh one in its place, which is the "it makes me a new wallet every time" bug.
       Omitting allowCredentials makes this discoverable: it asks the platform whether it
       already holds one for us rather than assuming it does not. */
    let found: PublicKeyCredential | null = null;
    try {
      /* `hints` biases WebAuthn Level 3 browsers toward her own device instead of leading
         with the QR and Bluetooth chooser. A harmless no-op where unrecognised. */
      found = await getAssertion({ hints: ['client-device'] } as Partial<PublicKeyCredentialRequestOptions>);
    } catch {
      /* Nothing resident, or she dismissed this first prompt. A genuine first time device, so
         falling through to enroll() below is correct. */
    }

    if (found) {
      /* From here we must NEVER fall through to enroll(), whatever else fails. Once we know a
         real credential exists, minting a second one is always wrong. A missing PRF result
         used to be indistinguishable from "no credential exists" and both landed in the same
         catch, silently re-enrolling a woman who already had an identity. */
      localStorage.setItem(LS_CRED, b64.bufToUrl(found.rawId));
      if (prfFirst(found)) {
        localStorage.setItem(LS_PRF, '1');
        return ownerFromAssertion(found);
      }
      /* PRF did not evaluate on the discoverable request, which happens on some mobile
         platforms. Retry pinned to the credential we just found: PRF evaluates more reliably
         against an explicit allowCredentials, and it is the same call shape the returning
         user path below uses every day. Let a failure here propagate as a real error. */
      const retry = await getAssertion({
        allowCredentials: [{ type: 'public-key', id: found.rawId }],
      });
      if (!retry) throw new Error('Could not unlock that passkey.');
      return ownerFromAssertion(retry);
    }

    let made: Enrolled;
    try { made = await enroll(); } catch { return unlockLocal(); }
    if (made.owner) return made.owner;
  }

  /* The authenticator told us at enrol that it cannot do PRF. Use the device key directly and
     do not prompt for a biometric only to substitute a different key when it fails. That
     mismatch between a PRF unlock and a fallback unlock was the recovery bug. */
  if (localStorage.getItem(LS_PRF) === '0') return unlockLocal();

  const credId = localStorage.getItem(LS_CRED);
  try {
    const assertion = await getAssertion({
      allowCredentials: credId ? [{ type: 'public-key', id: b64.urlToBuf(credId) }] : undefined,
      hints: ['client-device'],
    } as Partial<PublicKeyCredentialRequestOptions>);
    if (!assertion) throw new Error('no assertion');
    return ownerFromAssertion(assertion);
  } catch {
    /* The credential we remember is gone: she deleted her passkeys, or changed browser or
       profile. Clearing LS_CRED blindly would be the duplicate identity bug again, so ask the
       platform first. If anything still exists, that one is real. */
    let recovered: PublicKeyCredential | null = null;
    try {
      recovered = await getAssertion({ hints: ['client-device'] } as Partial<PublicKeyCredentialRequestOptions>);
    } catch { /* nothing resident, or dismissed */ }
    if (recovered) {
      localStorage.setItem(LS_CRED, b64.bufToUrl(recovered.rawId));
      return ownerFromAssertion(recovered);
    }

    /* Genuinely nothing left. Clear both pointers, LS_PRF included: it was recorded against
       an authenticator that no longer exists, and leaving it at '0' would pin her to the
       weaker path forever. */
    localStorage.removeItem(LS_CRED);
    localStorage.removeItem(LS_PRF);
    let made: Enrolled | null = null;
    try { made = await enroll(); } catch { return unlockLocal(); }
    if (made?.owner) return made.owner;
    if (made?.prfEnabled) {
      const again = await getAssertion({
        allowCredentials: [{ type: 'public-key', id: b64.urlToBuf(localStorage.getItem(LS_CRED)!) }],
      });
      if (again) return ownerFromAssertion(again);
    }
    return unlockLocal();
  }
}

/**
 * The reduced assurance path, for browsers with no PRF.
 *
 * A device local random seed. Weaker and named so: no biometric gate, and no recovery if this
 * device is lost or site data is cleared. Persisted, so it is the same identity on every call
 * and every reload rather than a new one each time.
 *
 * Never touches WebAuthn, which makes it the ONLY unlock that page load code may call.
 * Anything that can raise browser UI belongs behind a real user action.
 */
export async function unlockLocal(): Promise<Owner> {
  let seed: Uint8Array;
  const stored = localStorage.getItem(LS_FALLBACK);
  if (stored) {
    seed = b64.dec(stored);
  } else {
    seed = crypto.getRandomValues(new Uint8Array(32));
    localStorage.setItem(LS_FALLBACK, b64.enc(seed));
  }
  const salt = await hkdf32(seed, SEAL_SALT_INFO);
  return ownerFromSeed(seed, 'fallback', salt);
}

/* Clear device state so she can enrol cleanly. */
export function reset(): void {
  [LS_CRED, LS_PRF, LS_FALLBACK].forEach((k) => {
    try { localStorage.removeItem(k); } catch { /* nothing to remove is the outcome asked for */ }
  });
}

/**
 * Recovery, for the fallback path only.
 *
 * A passkey recovers by itself: the platform holds the same credential across her devices, so
 * the same PRF secret comes back on a new phone with no separate step. The fallback seed has
 * no such backing. It is a device local random value in localStorage and nothing else, so
 * losing the device loses the identity unless she saved this first. The salt is re-derived
 * from the seed, so the seed alone is the complete secret. It is a password, not a username.
 */
export function exportFallbackSeed(): string | null {
  try { return localStorage.getItem(LS_FALLBACK); } catch { return null; }
}

export async function restoreFallbackSeed(seedB64: string): Promise<Owner> {
  let seed: Uint8Array;
  try { seed = b64.dec(String(seedB64).trim()); } catch { throw new Error('That does not look like a valid recovery key.'); }
  if (seed.length !== 32) throw new Error('That does not look like a valid recovery key.');
  localStorage.setItem(LS_FALLBACK, b64.enc(seed));
  return unlockLocal();
}
