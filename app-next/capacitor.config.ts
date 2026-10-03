import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native shell.
 *
 * WHY THIS EXISTS, since the app is a perfectly good PWA and the Android build today is a
 * Bubblewrap TWA that needs none of this.
 *
 * A TWA is a Chrome Custom Tab. It renders the same web page and grants no camera capability
 * the browser does not already have, which matters because the browser has almost none:
 * `getUserMedia` hands back whatever the phone's own processing decided, after it has guessed
 * the white balance and crushed the highlights. docs/strategy says the go-to-market order is
 * Android first because "Android's camera interface gives that control directly", and that
 * has never been true of anything we actually shipped.
 *
 * One decision pays three times:
 *   1. Exposure and white balance can be locked, and the exposure target can be aimed, which
 *      is the accuracy work. See src/lib/capture.ts.
 *   2. iOS gets a reliable camera. docs/IOS-PATH.md documents the WebKit bug where camera
 *      permission is not persisted for an installed PWA, and calls it a potential dealbreaker
 *      for an app whose entry point is a camera.
 *   3. App Store guideline 4.2 rejects a thin wrapper around a website. Native capture is
 *      real native value rather than a badge.
 *
 * Pinned to Capacitor 7 deliberately. Version 8 requires Node 22 and this machine is on the
 * system's Node 20 with no version manager, so moving to 8 means upgrading Node for every
 * other project on the box. Not worth it for a major version we do not need yet.
 *
 * The web app stays the web app. Nothing here forks the codebase: `webDir` is the same
 * `dist/` Netlify serves, so the PWA anyone can open with a link and the installed app are
 * the same build, and the only difference is which capture path is available.
 */
const config: CapacitorConfig = {
  /* The same package id the Bubblewrap TWA already ships under (android-twa/twa-manifest.json),
     on purpose: Play treats this as an update to the app women already have rather than a
     second listing, so nobody has to find and install a new Oira. That only works if it is
     signed with the TWA's existing key, `android.keystore` alias `oira`. Signing it with a
     fresh key produces an app Play will refuse to publish over the old one. */
  appId: 'app.oira.twa',
  appName: 'Oira',
  webDir: 'dist',

  /* Deliberately NOT a `server.url` pointing at the deployed site. Loading the live site into
     a native shell is the thin wrapper guideline 4.2 rejects, and it would put the whole app
     behind the network again after all the work to make it run offline. The build ships
     inside the app and the bridge talks to the VPS for the concierge only. */
  /* Served from inside the APK, but under Oira's own name. Capacitor's default address for
     the bundled files is https://localhost, and a passkey for app.myoira.com cannot be asked
     for from a page at localhost: the WebView refuses before the phone's biometrics ever
     appear, so on the A13 the fingerprint step did nothing and nothing could be sealed.
     With the hostname set, the same files carry app.myoira.com as their origin, Credential
     Manager checks it against assetlinks.json on that domain, and the passkey is the one
     she has on the web.

     This is not server.url. Nothing is loaded from the network; Capacitor answers every
     request for this host from the files in the APK. The one cost is that a request to
     app.myoira.com from inside the app never reaches Netlify, so nothing here may call the
     site's own /api: the concierge and the seal lookup go to the bridge by name instead
     (src/lib/native.ts). */
  server: {
    hostname: 'app.myoira.com',
    androidScheme: 'https',
  },

  android: {
    /* Everything the app talks to is HTTPS: the concierge bridge and the weights host both
       are. Leaving mixed content off means a plain http request cannot quietly start working
       on Android while failing everywhere else, which is how an insecure call survives review.

       Note for the manifest, which is not set from here: android:allowBackup should be false
       before this ships. The default is true, and it would let an adb backup carry her sealed
       reading and the residual store off the device, which is the one thing this whole
       architecture exists to prevent. */
    allowMixedContent: false,

    /* Mobile Wallet Adapter refuses to run inside a WebView unless the page says it is in a
       Solana Mobile shell. Without this the wallet door lists nothing in the app and a
       Seeker owner cannot connect the wallet her phone shipped with. */
    appendUserAgent: 'Solana Mobile Web Shell',
  },
};

export default config;
