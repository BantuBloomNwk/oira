import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig} from 'vite';

/* HTTPS in development, from a locally trusted certificate.
 *
 * The camera and the service worker both require a secure context, and http on a LAN
 * address is not one: over plain http you get the app with a dead scanner and no install
 * prompt, which looks like the app is broken rather than like the browser is refusing.
 *
 * mkcert generates the certificate and a local CA to sign it. Install that CA on whatever
 * machine is doing the browsing (see scripts/dev-https.sh) and the certificate is genuinely
 * trusted: no warning screen to click past, and a real secure context rather than a
 * degraded one. Certificates live in .certs/ and are gitignored; regenerate rather than
 * share them.
 *
 * Deliberately NOT a tunnel. ngrok or cloudflared would hand you a trusted certificate in
 * one command and publish the app to the open internet at the same time, which for this
 * repo is not what we want: development builds stay on the local network. */
/* The calibration harness is a development tool, not part of the app.
 *
 * public/ is copied wholesale into the build, so the portraits it runs against would ship
 * to production and sit there on a public URL: real photographs of real people, uploaded
 * for a colour-science bench test, served from a beauty app's origin with no page linking
 * to them. Nobody would ever see them, which is exactly why nobody would ever notice. */
function dropDevAssets() {
  return {
    name: 'oira-drop-dev-assets',
    apply: 'build' as const,
    closeBundle() {
      const dir = path.resolve(__dirname, 'dist/calib');
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('drop-dev-assets: removed dist/calib');
      }
    },
  };
}

/* Stamps the service worker's cache version at build time.
 *
 * An unversioned worker will serve last build's shell forever and the user has no way to
 * break out of it: she does not know what a service worker is, and clearing site data is
 * not a thing anyone should have to be told to do. Ilowa hit exactly this. The build
 * REFUSES to emit an unstamped worker rather than shipping one quietly. */
function stampServiceWorker() {
  return {
    name: 'oira-stamp-sw',
    apply: 'build' as const,
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js');
      if (!fs.existsSync(swPath)) {
        throw new Error('stamp-sw: dist/sw.js is missing; the service worker did not ship');
      }
      const sw = fs.readFileSync(swPath, 'utf8');
      const re = /^const VERSION = '([^']+)'/m;
      if (!re.test(sw)) {
        throw new Error("stamp-sw: no VERSION line in dist/sw.js; refusing to ship an unversioned worker");
      }
      const stamped = `oira-${Date.now().toString(36)}`;
      fs.writeFileSync(swPath, sw.replace(re, `const VERSION = '${stamped}'`), 'utf8');
      console.log(`stamp-sw: cache version -> ${stamped}`);
    },
  };
}

const certDir = path.resolve(__dirname, '.certs');
const httpsCerts = fs.existsSync(path.join(certDir, 'dev.pem'))
  ? {
      key: fs.readFileSync(path.join(certDir, 'dev-key.pem')),
      cert: fs.readFileSync(path.join(certDir, 'dev.pem')),
    }
  : undefined;

export default defineConfig(() => {
  /* The build's own name, in the app, where she can read it out to me.
   *
   * Every draft deploy lands on a fresh hash subdomain, so "I do not see the change" and
   * "the change is not deployed" look identical from here and from a phone. They are not
   * the same problem and they have opposite fixes. A four character stamp at the bottom of
   * the menu settles it in one glance, and it costs nothing. */
  const buildId = Date.now().toString(36).slice(-5);

  return {
    define: { __BUILD_ID__: JSON.stringify(buildId) },
    plugins: [react(), tailwindcss(), dropDevAssets(), stampServiceWorker()],
    build: {
      rollupOptions: {
        input: {
          /* The app. */
          main: path.resolve(__dirname, 'index.html'),
          /* The residual store, readable. Built and shipped on purpose, unlike calib.html
             below it, which stays dev-only. The store lives in localStorage, localStorage is
             per origin, and the readings that matter are collected on real phones pointed at
             the deployed site: a page that only ran on localhost could only ever show
             residuals gathered on a laptop. Not linked from anywhere in the app, and it can
             only ever read the store on the device it is opened on. See src/residuals.ts.

             calib.html is deliberately NOT here. It needs the portrait set that
             dropDevAssets() strips from the build, so shipping it would ship a broken page
             and six photographs of faces with it. */
          residuals: path.resolve(__dirname, 'residuals.html'),
          /* The accuracy study harness. Ships for the same reason residuals does: readings
             have to be taken on real handsets in real rooms, and a page that only ran on a
             laptop would measure the one device whose answer does not matter. */
          study: path.resolve(__dirname, 'study.html'),
          /* The open study, for women: consent, her shade, five scans, and a send she
             chooses. Reached as myoira.com/study and app.myoira.com/join. */
          join: path.resolve(__dirname, 'join.html'),
          /* The study's live totals, public: myoira.com/study/live. */
          progress: path.resolve(__dirname, 'progress.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      https: httpsCerts,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
