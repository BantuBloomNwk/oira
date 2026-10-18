/* Oira, client-side key custody (browser).
 *
 * Her passkey (WebAuthn, gated by Face/Touch ID or Seed Vault) exposes a stable 32-byte
 * secret via the PRF extension. We derive her Solana ed25519 OWNER key from it with
 * HKDF-SHA256: deterministically, so:
 *   • no seed phrase, ever;
 *   • biometric recovery for free (passkeys sync; same PRF -> same key on a new device);
 *   • the owner secret exists only in memory, at sign-time, and is never sent anywhere.
 *
 * The HKDF salt/info strings match client/oira-custody.mjs byte-for-byte, and the browser
 * path was proven to derive the identical key as that node reference (parity-check).
 * Requires window.nacl (vendor/nacl-fast.min.js): nacl.sign.keyPair.fromSeed is exactly
 * what Solana's Keypair.fromSeed uses, so the address matches server-side.
 *
 * Exposes window.OiraCustody.
 */
(function () {
  const enc = new TextEncoder();
  const HKDF_SALT = enc.encode('oira:custody:hkdf:salt:v1');
  const OWNER_INFO = enc.encode('oira:owner:ed25519:v1');
  const SALT_INFO = enc.encode('oira:seal:salt:v1'); // her commitment salt, derived from her passkey
  // Fixed, app-specific PRF evaluation salt. Stable => stable secret => stable key.
  const APP_PRF_SALT = enc.encode('oira:prf:v1');
  const RP_NAME = 'Oira';
  const LS_CRED = 'oira.cred';      // stores her passkey credential id (public, not a secret)
  const LS_PRF = 'oira.prf';        // '1' if this authenticator supports PRF, '0' if not
  const LS_FALLBACK = 'oira.fbseed'; // reduced-assurance fallback seed (non-PRF browsers)

  const b64 = {
    enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
    dec: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
    urlToBuf: (s) => b64.dec(s.replace(/-/g, '+').replace(/_/g, '/')),
    bufToUrl: (buf) => b64.enc(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  };

  // minimal base58 (Solana address display), no dependency
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function base58(bytes) {
    const d = [0];
    for (const byte of bytes) {
      let c = byte;
      for (let i = 0; i < d.length; i++) { c += d[i] << 8; d[i] = c % 58; c = (c / 58) | 0; }
      while (c) { d.push(c % 58); c = (c / 58) | 0; }
    }
    let s = '';
    for (const byte of bytes) { if (byte === 0) s += '1'; else break; }
    for (let i = d.length - 1; i >= 0; i--) s += B58[d[i]];
    return s;
  }

  function prfSupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext);
  }
  function hasEnrolled() { return !!localStorage.getItem(LS_CRED); }

  async function hkdf32(ikm, info) {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info }, key, 256);
    return new Uint8Array(bits);
  }
  const hkdfOwnerSeed = (prfSecret) => hkdf32(prfSecret, OWNER_INFO);

  // Build her owner handle from a 32-byte seed + her (device-derived) 32-byte commitment salt.
  // Secret stays inside this closure.
  function ownerFromSeed(seed, assurance, salt) {
    if (!window.nacl) throw new Error('nacl not loaded');
    const kp = window.nacl.sign.keyPair.fromSeed(seed);
    return {
      publicKey: kp.publicKey,                 // Uint8Array(32)
      address: base58(kp.publicKey),           // Solana base58 address
      publicKeyB64: b64.enc(kp.publicKey),     // what we hand the bridge
      salt,                                    // Uint8Array(32), her passkey-derived seal salt
      assurance,                               // 'passkey' | 'fallback'
      // sign raw message bytes (e.g. a serialized Solana tx message) -> detached sig
      sign: (msgBytes) => window.nacl.sign.detached(new Uint8Array(msgBytes), kp.secretKey),
      // scrub the secret from memory when the operation is done
      wipe: () => kp.secretKey.fill(0),
    };
  }

  // Enroll her passkey once (creates the credential, PRF enabled).
  async function enroll(userLabel) {
    if (!prfSupported()) throw new Error('This browser/device does not support passkeys in a secure context.');
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = await navigator.credentials.create({
      publicKey: {
        rp: { name: RP_NAME },
        user: { id: userId, name: userLabel || 'oira-user', displayName: userLabel || 'Oira' },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        // authenticatorAttachment: 'platform' skips the browser's full chooser (this device /
        // phone via QR+Bluetooth / security key) and goes straight to the device's own
        // built-in authenticator (Windows Hello, Touch ID, Android/Seeker biometrics), the
        // one-tap experience this had before. Cross-device passkey sync (iCloud Keychain,
        // Google Password Manager) still works fine through the platform authenticator itself;
        // this only removes the extra "how do you want to sign in" step, not cross-device use.
        authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
        // eval at create: modern authenticators return the PRF secret from this very
        // ceremony, so ONE biometric prompt covers enroll + first unlock (owner below).
        extensions: { prf: { eval: { first: APP_PRF_SALT } } },
      },
    });
    const ext = cred.getClientExtensionResults();
    const prfResult = ext && ext.prf && ext.prf.results && ext.prf.results.first;
    // prf.enabled === true means this authenticator can derive her key. Many desktop
    // authenticators (e.g. some Windows Hello / security-key setups) return false/undefined
    //, we still keep the passkey but the page will use the reduced-assurance fallback.
    const prfEnabled = !!(prfResult || (ext && ext.prf && ext.prf.enabled === true));
    localStorage.setItem(LS_CRED, b64.bufToUrl(cred.rawId));
    localStorage.setItem(LS_PRF, prfEnabled ? '1' : '0');
    let owner = null;
    if (prfResult) {
      const prfSecret = new Uint8Array(prfResult);
      const seed = await hkdfOwnerSeed(prfSecret);
      const salt = await hkdf32(prfSecret, SALT_INFO);
      prfSecret.fill(0);
      owner = ownerFromSeed(seed, 'passkey', salt);
    }
    // owner is null when the authenticator enabled PRF but would not evaluate it at
    // creation (older browsers), the caller then does one follow-up get() for the secret.
    return { credentialId: b64.bufToUrl(cred.rawId), prfEnabled, owner };
  }

  // Resolve a PRF assertion into her owner key.
  async function ownerFromAssertion(assertion) {
    const ext = assertion.getClientExtensionResults();
    if (!ext || !ext.prf || !ext.prf.results || !ext.prf.results.first) {
      throw new Error('This authenticator did not return a PRF secret. Re-run; if it repeats, Reset and re-enroll (this device may lack PRF).');
    }
    const prfSecret = new Uint8Array(ext.prf.results.first);
    const seed = await hkdfOwnerSeed(prfSecret);
    const salt = await hkdf32(prfSecret, SALT_INFO);
    prfSecret.fill(0);
    // Cache so the next unlock takes the fast known-credential path instead of a fresh
    // discoverable lookup every time.
    try { localStorage.setItem(LS_CRED, b64.bufToUrl(assertion.rawId)); localStorage.setItem(LS_PRF, '1'); } catch (e) {}
    return ownerFromSeed(seed, 'passkey', salt);
  }

  // Get the PRF secret (Face/Touch ID prompt), then derive the owner key.
  // Single-flight: WebAuthn allows one pending request per page, so a second caller racing
  // the first would throw, and worse, if both reached enroll(), each create() mints a
  // credential with a FRESH random userId, i.e. a different identity per call. Sharing one
  // in-flight promise makes a concurrent unlock structurally unable to double-enroll.
  let unlockInFlight = null;
  function unlockOwner() {
    if (!unlockInFlight) unlockInFlight = doUnlockOwner().finally(() => { unlockInFlight = null; });
    return unlockInFlight;
  }
  async function doUnlockOwner() {
    if (!prfSupported()) return unlockFallback();
    // First time on this device: CREATE the passkey (not a discoverable get()). create()
    // supports authenticatorAttachment:'platform', which skips the chooser and goes straight
    // to the device's own Face ID / Touch ID / fingerprint prompt, one clean step. A bare
    // discoverable get() (the old code here) has no such restriction, with nothing local to
    // match yet, the browser can only offer its full cross-device chooser (hybrid/security
    // key), which is the bug this replaces. If she cancels or the device has no biometric,
    // fall back to the stable local identity instead of a scary repeated prompt.
    // NOTE: create() shows browser UI even from load-time script in Chrome (top-level
    // WebAuthn needs no user activation there), callers must only reach this path from a
    // real user action (the page's silent boot uses unlockLocal instead).
    if (!hasEnrolled()) {
      // Before minting a NEW passkey (and therefore a NEW wallet), give this device one chance to
      // recover an EXISTING resident credential. This matters most on mobile PWAs: localStorage
      // (and therefore LS_CRED, our only "have we enrolled" signal) gets evicted far more readily
      // there than the platform's own passkey store (iCloud Keychain / Google Password Manager /
      // Secure Enclave), without this, every storage eviction silently orphaned her real wallet
      // and enroll() below minted a brand-new one in its place, i.e. the mobile "recreates a new
      // wallet every time" bug. Omitting allowCredentials makes this a DISCOVERABLE get(): it asks
      // the platform "do you already have one of these for me?" instead of assuming no. If she has
      // a genuine synced passkey this recovers her exact original key with no separate sign-in
      // step; if she truly has none yet, this fails fast and we fall through to enroll() exactly
      // as before, so a real first-time device still gets the one-prompt create() experience.
      let foundAssertion = null;
      try {
        foundAssertion = await navigator.credentials.get({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            userVerification: 'required',
            // Biases WebAuthn-Level-3-aware browsers (Chrome/Android) toward her device's own
            // authenticator first, instead of leading with the cross-device chooser (QR +
            // Bluetooth). Harmless no-op on browsers that don't recognize it yet (older Safari).
            hints: ['client-device'],
            extensions: { prf: { eval: { first: APP_PRF_SALT } } },
          },
        });
      } catch (e) {
        // Nothing resident on this device yet, or she declined this very first prompt, a
        // genuine first-time device. Safe to fall through to enroll() below.
      }
      if (foundAssertion) {
        // A resident credential WAS found and she authenticated against it. From here on we
        // must NEVER fall through to enroll() (which mints a brand-new wallet), whether PRF
        // came back on this call or the retry below fails for some other reason, once we
        // know a real credential exists, minting a second one is always wrong. This is the
        // fix for the "saved passkey unlocks fine but it still fails and recreates my
        // wallet" bug: a missing PRF result used to be indistinguishable from "no credential
        // exists" and both fell into the same catch, silently re-enrolling an already-real woman.
        localStorage.setItem(LS_CRED, b64.bufToUrl(foundAssertion.rawId));
        const ext = foundAssertion.getClientExtensionResults();
        if (ext && ext.prf && ext.prf.results && ext.prf.results.first) {
          localStorage.setItem(LS_PRF, '1');
          return ownerFromAssertion(foundAssertion);
        }
        // PRF didn't evaluate on this discoverable request (seen on some mobile platforms).
        // Retry once, explicitly targeting the credential we just found, PRF evaluates more
        // reliably against a pinned allowCredentials than a fully discoverable request on some
        // authenticators, the same call shape the normal returning-user path below already
        // uses successfully every day. Let any failure here propagate as a real error instead
        // of silently minting a duplicate wallet, she has a credential, so enroll() is wrong.
        const retry = await navigator.credentials.get({
          publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            allowCredentials: [{ type: 'public-key', id: foundAssertion.rawId }],
            userVerification: 'required',
            extensions: { prf: { eval: { first: APP_PRF_SALT } } },
          },
        });
        return ownerFromAssertion(retry);
      }
      let made;
      try { made = await enroll(); } catch (e) { return unlockFallback(); }
      if (made.owner) return made.owner; // PRF evaluated at create: enrolled AND unlocked, one prompt
    }
    // If enroll found this authenticator lacks PRF, use the deterministic device key
    // directly. Do NOT prompt for a biometric and then silently substitute a *different*
    // key on failure, that mismatch between a PRF unlock and a fallback unlock was the
    // recovery-mismatch bug. PRF-capable devices always use PRF (below); others always
    // use the same stored device key, so recovery is deterministic either way.
    if (localStorage.getItem(LS_PRF) === '0') return unlockFallback();
    const credId = localStorage.getItem(LS_CRED);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: b64.urlToBuf(credId) }],
        userVerification: 'required',
        hints: ['client-device'],
        extensions: { prf: { eval: { first: APP_PRF_SALT } } },
      },
    });
    return ownerFromAssertion(assertion);
  }

  // Clear device state so she can re-enroll cleanly (fixes stale credentials from prior tests).
  function reset() { [LS_CRED, LS_PRF, LS_FALLBACK].forEach((k) => localStorage.removeItem(k)); }

  // Reduced-assurance fallback for browsers without PRF: a device-local random seed.
  // Clearly weaker (no biometric gate, no cross-device recovery), flagged as such.
  // Persisted in LS_FALLBACK, so it is the SAME identity on every call and every reload.
  // Never touches WebAuthn, exported as unlockLocal, the only unlock that page-load
  // code may call (anything that can show browser UI belongs behind a user action).
  async function unlockFallback() {
    let s = localStorage.getItem(LS_FALLBACK);
    let seed;
    if (s) { seed = b64.dec(s); }
    else { seed = crypto.getRandomValues(new Uint8Array(32)); localStorage.setItem(LS_FALLBACK, b64.enc(seed)); }
    const salt = await hkdf32(seed, SALT_INFO);
    return ownerFromSeed(seed, 'fallback', salt);
  }

  // Drive the RELAYED seal over WebSocket: her owner key signs every message here, on-device;
  // the bridge never sees her secret. `owner` is an unlocked handle from unlockOwner().
  // encBlob is the base64 AES-GCM recovery blob (same string the HTTP path sends).
  function bridgeWsUrl() {
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1') return `ws://${h}:8777/api/seal/ws`;
    return 'wss://oira.161-97-74-212.sslip.io/api/seal/ws';
  }
  function sealViaDevice(owner, { traits, encBlob, lifetimeCap = 0 }) {
    return new Promise((resolve, reject) => {
      let done = false;
      const ws = new WebSocket(bridgeWsUrl());
      const fail = (e) => { if (!done) { done = true; try { ws.close(); } catch {} reject(e instanceof Error ? e : new Error(String(e))); } };
      const timer = setTimeout(() => fail(new Error('seal timed out')), 150000);
      // owner.assurance is 'wallet' for a connected external wallet (app/index.html sets it
      // explicitly on the wallet-owner handle it builds) and 'passkey'/'fallback' for a
      // device-key owner built by ownerFromSeed above, the bridge uses it to decide whether
      // she gets auto-sponsored or must cover her own shortfall from her own wallet.
      ws.onopen = () => ws.send(JSON.stringify({ t: 'start', ownerPubkey: owner.address, traits, encBlob: encBlob || null, lifetimeCap, salt: owner.salt ? b64.enc(owner.salt) : undefined, assurance: owner.assurance }));
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.t === 'sign') {
          // owner.sign() is sync for a passkey (the derived key is already resident in memory)
          // but async for a connected wallet (each signature is its own wallet-app approval),
          // Promise.resolve(...).then(...) handles either uniformly. A rejection (e.g. she
          // cancels a wallet prompt) must fail the whole seal, not hang until the timeout.
          Promise.resolve(owner.sign(b64.dec(m.msg)))
            .then((sig) => ws.send(JSON.stringify({ t: 'sig', id: m.id, sig: b64.enc(sig) })))
            .catch(fail);
        }
        else if (m.t === 'done') { done = true; clearTimeout(timer); ws.close(); resolve(m); }
        else if (m.t === 'error') { clearTimeout(timer); fail(new Error(m.message)); }
      };
      ws.onerror = () => { clearTimeout(timer); fail(new Error('could not reach the sealing bridge')); };
    });
  }

  // Recovery for the fallback path only: a passkey recovers for free via platform sync (iCloud
  // Keychain / Google Password Manager hold the SAME credential across her devices, so the SAME
  // PRF secret comes back on a new device with no separate step, see unlockOwner() above). The
  // fallback seed has no such backing: it is a device-local random value in localStorage only,
  // so losing this device or clearing site data loses the identity forever unless she saved it
  // herself first. salt is re-derived FROM the seed (see unlockFallback), so the seed alone is
  // the complete recovery secret, treat it like a password, not a username.
  function exportFallbackSeed() {
    const s = localStorage.getItem(LS_FALLBACK);
    return s || null; // already the base64 form written by unlockFallback
  }
  async function restoreFallbackSeed(seedB64) {
    let seed;
    try { seed = b64.dec(String(seedB64).trim()); } catch (e) { throw new Error('That does not look like a valid recovery key.'); }
    if (seed.length !== 32) throw new Error('That does not look like a valid recovery key.');
    localStorage.setItem(LS_FALLBACK, b64.enc(seed));
    return unlockFallback();
  }

  // Test-only: derives an owner key straight from a raw PRF secret, bypassing the real WebAuthn
  // ceremony entirely. This is what client/test-custody-parity.mjs uses to verify, in an actual
  // browser (WebCrypto's HKDF, not a reimplementation of it), the claim client/oira-custody.mjs's
  // header comment makes but never had an automated check for: that this file derives the exact
  // same owner key from the exact same PRF secret as the Node reference implementation.
  async function _deriveOwnerFromPrf(prfSecret) {
    const seed = await hkdfOwnerSeed(prfSecret);
    return ownerFromSeed(seed, 'passkey', seed).address;
  }

  window.OiraCustody = { prfSupported, hasEnrolled, enroll, unlockOwner, unlockLocal: unlockFallback, reset, sealViaDevice, base58, _b64: b64, exportFallbackSeed, restoreFallbackSeed, _deriveOwnerFromPrf };
})();
