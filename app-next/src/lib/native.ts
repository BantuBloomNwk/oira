import { Capacitor } from '@capacitor/core';

/* Inside the installed app the page is served from the APK itself, under the hostname
 * app.myoira.com (capacitor.config.ts). The address matches the web, so passkeys and the
 * wallet see Oira, but nothing behind that address is the real site: a relative /api inside
 * the app is answered from the APK and goes nowhere. These name the real places for that.
 *
 * Synchronous on purpose. Capacitor installs its bridge before the page runs, and the
 * callers (a passkey prompt, a wallet connect) cannot wait on an import mid gesture. */
export const isNativeApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/* Where Oira lives on the web. The app's passkeys belong to this domain, and its
 * assetlinks.json is what lets the Android app use them. */
export const WEB_HOST = 'app.myoira.com';
export const WEB_ORIGIN = `https://${WEB_HOST}`;

/* The bridge, asked directly. On the web the same calls go through Netlify's /api rewrite
 * so the page only talks to its own origin; the app has no such rewrite, and the bridge
 * accepts the app's origin by name. */
export const BRIDGE_ORIGIN = 'https://oira.161-97-74-212.sslip.io';
