/**
 * Which door she came through, and how to leave.
 *
 * custody.ts and wallet.ts each know how to produce an Owner. This is the thin layer that
 * decides which one runs and when, so no component has to hold that logic.
 *
 * THE ORDER MATTERS, and it is the reason this file exists rather than a call at each site.
 *
 * On boot we call unlockLocal and nothing else. It is the only unlock that cannot raise
 * browser UI, so she opens Oira and is simply already somebody, with no prompt and no
 * decision, before she has agreed to anything. Every unlock that can show a biometric sheet
 * sits behind a real tap, because a permission prompt she did not ask for is the fastest way
 * to lose a woman who has not yet decided whether she trusts this.
 *
 * She is only asked to choose a door at the moment identity starts to matter, which is the
 * seal. Not at onboarding, where it would be a question about crypto asked of somebody who
 * came here about her skin.
 */

import { unlockLocal, unlockOwner, reset as resetCustody, prfSupported } from './custody';
import { connect, walletOwner, disconnect, isSupported as walletSupported, getCached } from './wallet';
import { clear as clearResiduals } from './residual';
import type { Owner } from './owner';

export type { Owner };

/* Her identity for this session. Held in a module rather than in React state so that a
   remount cannot silently produce a second one. */
let current: Owner | null = null;

export const currentOwner = (): Owner | null => current;

/** The silent boot. Safe to call on page load: it never touches WebAuthn. */
export async function boot(): Promise<Owner> {
  if (current) return current;
  current = await unlockLocal();
  return current;
}

/**
 * The fingerprint door. Behind a tap, always.
 *
 * Upgrades her from the device-local fallback to a real passkey identity, which is a
 * different address: the fallback seed and the PRF secret are unrelated secrets. That is
 * correct and not a bug, but it means this must happen BEFORE her first seal, never after.
 * Sealing on the fallback and then upgrading would strand the first seal at an address she
 * no longer uses.
 */
export async function useFingerprint(): Promise<Owner> {
  current = await unlockOwner();
  return current;
}

/** The wallet door. Also behind a tap. `name` comes from listWallets(). */
export async function useWallet(name?: string): Promise<Owner> {
  await connect(name);
  current = await walletOwner();
  return current;
}

/* Whether each door is worth offering on this device, so the UI can say something true
   rather than presenting a button that cannot work. */
export const fingerprintAvailable = (): boolean => prfSupported();
export const walletAvailable = (): boolean => walletSupported();
export const connectedWalletAddress = (): string | null => getCached();

/**
 * Delete everything, on request.
 *
 * The Solana dApp Store publisher policy requires a means for a woman to delete her account,
 * and that is the floor rather than the reason. Oira's whole claim is that what it knows
 * about her lives on her phone, and a claim like that is only true if she can end it. There
 * is no server call here because there is nothing on a server to call about.
 *
 * What goes, and it is everything:
 *   her passkey pointer and the fallback seed, so the derived key cannot be rebuilt;
 *   the connected wallet, disconnected and forgotten;
 *   the residual log and the device key it was grouped by;
 *   every cache, which is the sealed reading, the scan models and the Gemma weights;
 *   the rest of local storage, which is her profile, her season and whether she has seen the
 *     splash.
 *
 * WHAT THIS CANNOT DELETE, and the copy must say so rather than implying otherwise. A seal
 * that has already been written to Solana is on a public ledger and nobody can unwrite it,
 * us included. It carries a commitment and never her face or her measurements, so what
 * remains is a number that cannot be turned back into her, but it remains. The passkey itself
 * also lives in her platform's keychain, not in the app, so she removes that from her phone's
 * own passkey settings if she wants it gone.
 */
export async function deleteEverything(): Promise<void> {
  try { disconnect(); } catch { /* nothing connected */ }
  try { resetCustody(); } catch { /* nothing stored */ }
  try { clearResiduals(); } catch { /* nothing stored */ }

  try {
    localStorage.removeItem('oira_device_key');
    localStorage.clear();
  } catch { /* private mode, or storage already refused */ }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* nothing cached is the outcome asked for */ }

  current = null;
}
