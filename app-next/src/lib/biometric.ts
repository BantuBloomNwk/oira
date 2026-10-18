import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from './native';

/* Android's own fingerprint sheet, inside the app only. See OiraBiometricPlugin.java.
 *
 * Used when passkeys are not available in the phone's WebView, so "Use my fingerprint" always
 * asks for her fingerprint (or her PIN, on a phone with no sensor) instead of carrying on with
 * no prompt. On the web it does nothing and the browser's own passkey sheet is used. */
interface OiraBiometric {
  isAvailable(): Promise<{ available: boolean; code: number }>;
  confirm(o: { title?: string; subtitle?: string }): Promise<{ ok: boolean }>;
}
const plugin = registerPlugin<OiraBiometric>('OiraBiometric');

let available: boolean | null = null;

/* Asked once at boot, so the identity sheet can say something true without waiting. */
export async function initNativeBiometric(): Promise<boolean> {
  if (!isNativeApp()) return (available = false);
  try { available = (await plugin.isAvailable()).available; } catch { available = false; }
  return available;
}
export const nativeBiometricAvailable = (): boolean => available === true;

/* The same answer, but waits for the check if it has not finished yet. A tap in the first moment
   after launch used to read the unfinished check as "no fingerprint here" and skip the prompt. */
let pending: Promise<boolean> | null = null;
export async function nativeBiometricReady(): Promise<boolean> {
  if (available !== null) return available;
  pending ??= initNativeBiometric();
  return pending;
}

export async function confirmWithBiometric(title: string, subtitle?: string): Promise<void> {
  await plugin.confirm({ title, subtitle });
}
