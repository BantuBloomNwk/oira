/**
 * The other door. For women who already have a wallet and know what one is.
 *
 * Nothing in here is required to use Oira, and nothing in here runs on its own. A woman only
 * reaches this code by tapping something that says wallet. Her passkey (src/lib/custody.ts)
 * stays the default on every device, and the two produce the same Owner shape so everything
 * downstream is identical either way. See src/lib/owner.ts.
 *
 * TWO GENUINELY DIFFERENT MECHANISMS, both through the Wallet Standard registry:
 *
 *   Desktop, and wallet in-app browsers including on iOS. Phantom, Solflare, Backpack and
 *   Jupiter register themselves as Wallet Standard wallets in the page. We read the registry
 *   and connect.
 *
 *   Android, including the Seeker. registerMwa() adds a Mobile Wallet Adapter entry to the
 *   SAME registry, and connecting it fires the `solana-wallet:` association intent into an
 *   installed wallet app. On a Seeker that is the Seed Vault Wallet, which is where the
 *   hardware key custody and the biometrics actually live. This is the whole of what "Seed
 *   Vault support" means for a dApp: Solana Mobile's own docs are explicit that the Seed
 *   Vault SDK is for wallet apps, and that dApps talk to it through Mobile Wallet Adapter.
 *   We are a dApp. Registered eagerly, so the entry exists before any connect UI renders.
 *
 *   iPhone and iPad Safari or Chrome: MWA is Android only, because iOS suspends the
 *   background sockets it needs. No registry entry will exist unless she is inside a wallet
 *   app's own browser. unavailableMessage() says so plainly instead of no-opping.
 */

import { isNativeApp, WEB_ORIGIN } from './native';
import { getWallets } from '@wallet-standard/app';
import {
  registerMwa,
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
} from '@solana-mobile/wallet-standard-mobile';
import {
  WALLET_SALT_INFO, WALLET_SALT_MESSAGE, HKDF_SALT, base58,
  b64, type Owner,
} from './owner';

const LS_ADDR = 'oira.mwa.addr';

const APP_IDENTITY = {
  /* In the app the page's own origin is https://localhost, which is not a name a wallet
     should be asked to trust. */
  uri: typeof location === 'undefined' || isNativeApp() ? WEB_ORIGIN : location.origin,
  icon: '/brand/png/favicon-plum-192.png',
  name: 'Oira',
};

type StandardWallet = {
  name: string;
  icon?: string;
  chains?: readonly string[];
  features: Record<string, unknown>;
};

let registered = false;
let cached: { wallet: StandardWallet; account: { publicKey: Uint8Array }; address: string } | null = null;

export const isAndroid = (): boolean => /Android/i.test(navigator.userAgent || '');

export const isIOS = (): boolean =>
  /iPad|iPhone|iPod/i.test(navigator.userAgent || '') ||
  /* iPadOS 13+ reports itself as a Mac, and the touch count is what gives it away. */
  (/Mac/i.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);

/* Android only. MWA's `solana-wallet:` association is an Android mechanism, and registering it
   on desktop or iOS would list a wallet that can never answer there. */
function ensureRegistered(): void {
  if (registered || !isAndroid()) return;
  registered = true;
  try {
    registerMwa({
      appIdentity: APP_IDENTITY,
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ['solana:devnet', 'solana:mainnet'],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    });
  } catch (e) {
    registered = false;
    throw e;
  }
}

/* Everything in the page that can connect on Solana at all. */
function connectable(): StandardWallet[] {
  const { get } = getWallets();
  return (get() as unknown as StandardWallet[]).filter(
    (w) => w.features?.['standard:connect'] && (w.chains || []).some((c) => String(c).startsWith('solana:'))
  );
}

/* The ones we can actually finish with. `solana:signMessage` is not optional: the seal salt is
   taken immediately after connect and every later seal signs bytes. Listing a wallet without
   it meant she connected happily and only then hit "this wallet cannot sign", which reads like
   our bug rather than a capability it never had. Screen before offering. */
const signable = (): StandardWallet[] => connectable().filter((w) => w.features['solana:signMessage']);

export interface WalletChoice { name: string; icon: string }

export function listWallets(): WalletChoice[] {
  try { ensureRegistered(); } catch { /* listing must never throw; isSupported reports it */ }
  try {
    const seen = new Set<string>();
    return signable()
      .filter((w) => (seen.has(w.name) ? false : (seen.add(w.name), true)))
      .map((w) => ({ name: w.name, icon: w.icon || '' }));
  } catch {
    return [];
  }
}

export function isSupported(): boolean {
  if (isAndroid()) return true; /* MWA is always worth attempting there */
  return listWallets().length > 0;
}

/* Honest, platform specific copy for when no wallet path exists, shown instead of a silent
   no-op. Every line ends by pointing back at the fingerprint, because it is true and because
   a woman who came this far should not feel she has hit a wall. */
export function unavailableMessage(): string {
  if (isIOS()) {
    return 'iPhones cannot open a wallet app straight from a browser, Apple does not allow the link Android uses. Open Oira inside your wallet app’s own browser if you want to connect one. Phantom, Solflare and Jupiter all have one. Or just carry on with your fingerprint, a wallet is never required.';
  }
  try {
    const cannotSign = connectable().filter((w) => !w.features['solana:signMessage']);
    if (cannotSign.length) {
      return `${cannotSign.map((w) => w.name).join(', ')} cannot sign messages here, which Oira needs to set up your seal. Phantom, Solflare or Backpack will. Or just carry on with your fingerprint, a wallet is never required.`;
    }
  } catch { /* fall through to the generic line */ }
  return 'I could not find a Solana wallet in this browser. Install Phantom, Solflare or Backpack and reload, or just carry on with your fingerprint, a wallet is never required.';
}

export async function connect(walletName?: string): Promise<{ address: string; walletName: string }> {
  ensureRegistered();
  const wallets = signable();
  if (!wallets.length) throw new Error(unavailableMessage());

  let wallet: StandardWallet | undefined;
  if (walletName) wallet = wallets.find((w) => w.name === walletName);
  else if (wallets.length === 1) wallet = wallets[0];
  else if (isAndroid()) wallet = wallets.find((w) => /mobile wallet adapter/i.test(w.name)) || wallets[0];
  else wallet = wallets[0];
  if (!wallet) throw new Error('That wallet is not available any more. Pick again.');

  const feature = wallet.features['standard:connect'] as { connect: () => Promise<{ accounts?: { publicKey: Uint8Array }[] }> };
  const result = await feature.connect();
  const account = result.accounts?.[0];
  if (!account) throw new Error('The wallet connected but gave back no account.');

  const address = base58(account.publicKey);
  cached = { wallet, account, address };
  try { localStorage.setItem(LS_ADDR, address); } catch { /* cache only */ }
  return { address, walletName: wallet.name };
}

/* Raw bytes in, raw signature out. The primitive everything else here is built on, because the
   seal signs binary Solana message bytes rather than text. */
export async function signBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (!cached) throw new Error('No wallet is connected.');
  const name = cached.wallet.name || 'That wallet';
  const feature = cached.wallet.features['solana:signMessage'] as
    | { signMessage: (o: { account: unknown; message: Uint8Array }) => Promise<{ signature: Uint8Array }[] | { signature: Uint8Array }> }
    | undefined;
  if (!feature) throw new Error(`${name} cannot sign messages, which Oira needs to set up your seal. Try Phantom, Solflare or Backpack, or carry on with your fingerprint.`);

  let out;
  try {
    out = await feature.signMessage({ account: cached.account, message: bytes });
  } catch (e) {
    /* Surface the wallet's OWN words. Wallets refuse for real reasons: she declined, the
       account is locked, or it will not sign something transaction shaped. Papering over that
       with our own message sends her looking in the wrong place. */
    throw new Error(`${name} would not sign: ${(e as Error)?.message || 'no reason given'}`);
  }
  const sig = (Array.isArray(out) ? out[0] : out)?.signature;
  /* Some wallets resolve without a signature instead of rejecting. Unchecked, that became an
     empty array and failed much later inside HKDF, pointing at the wrong file entirely. */
  if (!sig?.length) throw new Error(`${name} gave back no signature. Approve it in the wallet, then try again.`);
  return new Uint8Array(sig);
}

/* UTF-8 in, base64 signature out, for server side ownership checks. Connecting proves control
   to the wallet app, not to our server, so this step is not redundant with connect(). */
export async function signMessage(message: string): Promise<string> {
  return b64.enc(await signBytes(new TextEncoder().encode(message)));
}

/**
 * A stable commitment salt for a wallet identity.
 *
 * The passkey path gets one free from its PRF secret. A wallet has no secret it will hand us,
 * but Ed25519 signing is deterministic under RFC 8032: the same message signed by the same key
 * always yields the same signature. So HKDF over a signature of one fixed, domain separated
 * message gives a salt that is stable for her forever without any secret being exposed.
 *
 * This has to be the same 32 bytes on every future seal. Her commitment root is bound to it at
 * her first seal and set_traits rejects a re-seal that cannot reproduce it.
 */
export async function sealSalt(): Promise<Uint8Array> {
  const sig = await signBytes(WALLET_SALT_MESSAGE);
  const key = await crypto.subtle.importKey('raw', sig as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT as BufferSource, info: WALLET_SALT_INFO as BufferSource },
    key,
    256
  );
  return new Uint8Array(bits);
}

/* The connected wallet as an Owner, so the seal and everything after it cannot tell which door
   she came through. Costs one signature at connect time to fix the salt. */
export async function walletOwner(): Promise<Owner> {
  if (!cached) throw new Error('No wallet is connected.');
  const salt = await sealSalt();
  return {
    address: cached.address,
    publicKey: new Uint8Array(cached.account.publicKey),
    publicKeyB64: b64.enc(cached.account.publicKey),
    salt,
    assurance: 'wallet',
    sign: signBytes,
    /* No wipe: there is no secret here to scrub. That is the point of this door. */
  };
}

export function disconnect(): void {
  try {
    const f = cached?.wallet.features['standard:disconnect'] as { disconnect: () => Promise<void> } | undefined;
    f?.disconnect().catch(() => {});
  } catch { /* best effort; our own cache is the source of truth */ }
  cached = null;
  try { localStorage.removeItem(LS_ADDR); } catch { /* nothing cached is the outcome asked for */ }
}

export function getCached(): string | null {
  try { return localStorage.getItem(LS_ADDR); } catch { return null; }
}

/* For diagnosing a wallet that will not complete the flow. Says what the page can see and
   exactly which Solana features each wallet exposes, which is what decides whether the seal
   can work at all. */
export function diagnose() {
  const out: Record<string, unknown> = { android: isAndroid(), ios: isIOS(), wallets: [] };
  try {
    out.wallets = connectable().map((w) => ({
      name: w.name,
      chains: w.chains,
      solanaFeatures: Object.keys(w.features || {}).filter((f) => f.startsWith('solana:')),
      canSignMessage: !!w.features['solana:signMessage'],
    }));
  } catch (e) {
    out.error = (e as Error)?.message || String(e);
  }
  out.offeredToUser = listWallets().map((w) => w.name);
  out.connected = cached?.address ?? null;
  return out;
}

/* Eager registration on Android: the registry entry must exist before any connect UI is
   tappable. Never allowed to break the page, because the passkey door must open regardless. */
try { ensureRegistered(); } catch { /* reported through isSupported and unavailableMessage */ }
