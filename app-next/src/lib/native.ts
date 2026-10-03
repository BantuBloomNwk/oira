import { Capacitor } from '@capacitor/core';

/* Inside the installed app the page is served from https://localhost, out of the APK
 * itself. That is right for loading, and wrong for every place that uses the page's own
 * address to mean "Oira": a passkey made for localhost is not her Oira passkey, a wallet
 * shown "localhost" is being asked to trust nobody, and a relative /api goes nowhere because
 * there is no Netlify in front of it. These name the real address for those cases.
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
