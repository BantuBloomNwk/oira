/* Oira, optional external-wallet connect (browser/PWA, no native wrapper required).
 *
 * This is a SEPARATE, OPTIONAL identity path alongside her passkey (window.OiraCustody),
 * which stays the default everywhere. She only touches this if she explicitly taps
 * "Use a wallet instead" / the Wallet row: nothing here runs automatically, and nothing
 * here replaces deviceOwner or her passkey-derived key.
 *
 * TWO genuinely different connection mechanisms, both via the Wallet Standard registry:
 *   • Desktop (and wallet in-app browsers, incl. iOS): Phantom / Solflare / Backpack /
 *     Jupiter extensions and in-app browsers register themselves as Wallet Standard
 *     wallets in the page. We read the registry via getWallets() (@wallet-standard/app,
 *     already inside vendor/mwa-standard.min.js) and connect with standard:connect.
 *   • Android mobile browser: Solana Mobile's MWA. registerMwa() (from
 *     @solana-mobile/wallet-standard-mobile@0.5.3, same pinned vendor bundle) adds a
 *     "Mobile Wallet Adapter" entry to the SAME registry; connecting it fires the
 *     `solana-wallet:` association intent into an installed MWA wallet app (Phantom,
 *     Solflare, the Seed Vault wallet). Registered EAGERLY at load, not lazily on tap,
 *     so the entry exists before any connect UI renders.
 *   • iOS Safari/Chrome: MWA is Android-only (Solana Mobile docs: iOS suspends the
 *     background sockets MWA needs). No registry entry will exist unless she is inside
 *     a wallet app's own browser or has a Safari-extension wallet, unavailableMessage()
 *     tells her that honestly instead of no-oping.
 *   • Jupiter Mobile is NOT a standard MWA responder for third-party web dapps; its
 *     official dapp path is @jup-ag/jup-mobile-adapter (Reown/WalletConnect QR pairing,
 *     React-oriented, needs a Reown project id): deliberately not pulled in here. Her
 *     Jupiter path today is Jupiter Mobile's built-in dapp browser, which injects a
 *     Wallet Standard wallet this code picks up like any other.
 *
 * Exposes window.OiraMWA = { isSupported, isAndroid, listWallets, connect, disconnect,
 * getCached, signMessage, signBytes, sealSalt, unavailableMessage }.
 */
(function () {
  const LS_MWA_ADDR = 'oira.mwa.addr';
  const APP_IDENTITY = {
    uri: location.origin,
    icon: '/brand/png/favicon-plum-192.png',
    name: 'Oira',
  };

  let registered = false;
  let cachedWallet = null;

  function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
  }
  function isIOS() {
    // iPadOS 13+ reports as Mac; the touch check catches it.
    return /iPad|iPhone|iPod/i.test(navigator.userAgent || '') ||
      (/Mac/i.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);
  }

  function lib() {
    if (!window.__oiraMwaLib) throw new Error('MWA library not loaded (vendor/mwa-standard.min.js missing or failed to load).');
    return window.__oiraMwaLib;
  }

  // Android only: MWA's local `solana-wallet:` association is an Android mechanism.
  // Registering it on desktop/iOS would list a wallet that can never answer there.
  function ensureRegistered() {
    if (registered || !isAndroid()) return;
    registered = true;
    const L = lib();
    try {
      L.registerMwa({
        appIdentity: APP_IDENTITY,
        authorizationCache: L.createDefaultAuthorizationCache(),
        chains: ['solana:devnet', 'solana:mainnet'],
        chainSelector: L.createDefaultChainSelector(),
        onWalletNotFound: L.createDefaultWalletNotFoundHandler(),
      });
    } catch (e) {
      registered = false;
      throw e;
    }
  }

  // Every Wallet Standard wallet in the page that can actually connect on Solana,
  // desktop extensions, in-app-browser injections, and (on Android) the MWA entry.
  function solanaWallets() {
    const L = lib();
    const { get } = L.getWallets();
    return get().filter((w) =>
      w.features && w.features['standard:connect'] &&
      (w.chains || []).some((c) => String(c).indexOf('solana:') === 0));
  }

  function listWallets() {
    try { ensureRegistered(); } catch (e) {}
    try {
      const seen = {};
      return solanaWallets().filter((w) => (seen[w.name] ? false : (seen[w.name] = true)))
        .map((w) => ({ name: w.name, icon: w.icon || '' }));
    } catch (e) { return []; }
  }

  function isSupported() {
    if (!window.__oiraMwaLib) return false;
    if (isAndroid()) return true; // MWA is always attemptable there
    return listWallets().length > 0;
  }

  // Honest, platform-specific copy for when no connect path exists, shown by the UI
  // instead of the old silent no-op.
  function unavailableMessage() {
    if (!window.__oiraMwaLib) return 'Wallet connect could not load in this browser. You can still continue with fingerprint, nothing else is affected.';
    if (isIOS()) return 'iPhone and iPad browsers cannot open a wallet app directly (Apple does not allow the background link Android uses). To connect a wallet here, open this page inside your wallet app’s own browser, Phantom, Solflare, or Jupiter Mobile all have one. Or just continue with fingerprint; a wallet is never required.';
    return 'No Solana wallet was found in this browser. Install the Phantom, Solflare, or Backpack extension and reload, or just continue with fingerprint; a wallet is never required.';
  }

  // b58 kept local/minimal (mirrors custody.js's own tiny encoder, no shared dep needed)
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function base58(bytes) {
    const d = [0];
    for (const byte of bytes) {
      let carry = byte;
      for (let j = 0; j < d.length; j++) { carry += d[j] << 8; d[j] = carry % 58; carry = (carry / 58) | 0; }
      while (carry) { d.push(carry % 58); carry = (carry / 58) | 0; }
    }
    let s = '';
    for (let k = 0; bytes[k] === 0 && k < bytes.length - 1; k++) s += '1';
    for (let i = d.length - 1; i >= 0; i--) s += B58[d[i]];
    return s;
  }

  // Connect a specific wallet by name (from listWallets), or, with no name, the only
  // wallet present. No-arg on Android keeps the old behaviour of preferring MWA.
  async function connect(walletName) {
    ensureRegistered();
    const wallets = solanaWallets();
    if (!wallets.length) throw new Error(unavailableMessage());
    let wallet = null;
    if (walletName) wallet = wallets.find((w) => w.name === walletName) || null;
    else if (wallets.length === 1) wallet = wallets[0];
    else if (isAndroid()) { const L = lib(); wallet = wallets.find((w) => w.name === L.SolanaMobileWalletAdapterWalletName) || wallets[0]; }
    else wallet = wallets[0];
    if (!wallet) throw new Error('That wallet is no longer available, please pick again.');
    const result = await wallet.features['standard:connect'].connect();
    const account = result.accounts && result.accounts[0];
    if (!account) throw new Error('Wallet connected but returned no account.');
    const address = base58(account.publicKey);
    cachedWallet = { wallet, account, address };
    try { localStorage.setItem(LS_MWA_ADDR, address); } catch (e) {}
    return { address, walletName: wallet.name };
  }

  // Signs arbitrary raw bytes with the connected wallet's key via the Wallet Standard
  // solana:signMessage feature, returning the raw signature bytes. This is the low-level
  // primitive both signMessage() (below) and the relayed-seal signer (index.html's
  // deviceOwner.sign, in the WALLET sign-in path) are built on, the seal protocol needs
  // binary Solana tx-message bytes signed, not UTF-8 text.
  async function signBytes(bytes) {
    if (!cachedWallet) throw new Error('Not connected.');
    const feature = cachedWallet.wallet.features['solana:signMessage'];
    if (!feature) throw new Error('Connected wallet does not support message signing.');
    const [result] = await feature.signMessage({ account: cachedWallet.account, message: new Uint8Array(bytes) });
    return new Uint8Array(result.signature);
  }

  // Signs an arbitrary UTF-8 message with the connected wallet's key, for server-side
  // ownership verification (the Genesis Token check's step 2), connect() proves
  // control to the WALLET app, not to our server, so this explicit sign step is required,
  // it is not redundant with connect().
  async function signMessage(message) {
    const sig = await signBytes(new TextEncoder().encode(message));
    // base64, matching what genesis-check.mjs expects
    let bin = ''; for (const b of sig) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  // A stable, device-free commitment salt for a WALLET-signed identity, mirroring what the
  // passkey path gets for free from its PRF secret (custody.js's hkdf32/SALT_INFO). A wallet
  // has no such secret to derive from, but standard Ed25519 signing (RFC 8032) is itself
  // deterministic, the SAME message signed by the SAME key always yields the SAME signature,
  // so HKDF-ing the signature over a fixed, domain-separated message gives a salt that is
  // stable across every future seal for her, without the wallet ever exposing a raw secret.
  // Needed once at connect: her commitment_root is bound to this salt forever at her first
  // seal, and a later re-seal must reproduce the exact same value or set_traits rejects it.
  async function sealSalt() {
    const sig = await signBytes(new TextEncoder().encode('oira:wallet:seal:salt:v1'));
    const key = await crypto.subtle.importKey('raw', sig, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
      name: 'HKDF', hash: 'SHA-256',
      salt: new TextEncoder().encode('oira:custody:hkdf:salt:v1'),
      info: new TextEncoder().encode('oira:wallet:seal:salt:info:v1'),
    }, key, 256);
    return new Uint8Array(bits);
  }

  function disconnect() {
    // Best-effort standard:disconnect where the wallet offers it; our own cache is the
    // source of truth either way since we never persisted a session outside this device.
    try {
      const f = cachedWallet && cachedWallet.wallet.features['standard:disconnect'];
      if (f) f.disconnect().catch(() => {});
    } catch (e) {}
    cachedWallet = null;
    try { localStorage.removeItem(LS_MWA_ADDR); } catch (e) {}
  }

  function getCached() {
    try { return localStorage.getItem(LS_MWA_ADDR) || null; } catch (e) { return null; }
  }

  window.OiraMWA = { isSupported, isAndroid, listWallets, connect, disconnect, getCached, signMessage, signBytes, sealSalt, unavailableMessage };

  // Eager MWA registration on Android: the registry entry must exist by the time any
  // connect UI is tappable. Never allowed to break the page (passkey flow is untouched).
  try { ensureRegistered(); } catch (e) { try { console.warn('Oira MWA register failed:', e); } catch (_) {} }
})();
