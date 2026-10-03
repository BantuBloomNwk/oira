/* Oira's service worker.
 *
 * Two jobs, and one deliberate refusal.
 *
 * It keeps the app working with no signal, which for a beauty app that runs entirely on
 * her own phone is not a nice-to-have: the scan, the reading, the seal and her palette all
 * work offline already, and it would be strange for the shell around them to need a
 * network she does not have.
 *
 * It also caches the on-device models, which is the whole reason this file exists. The face
 * landmarker, the hair segmenter and the MediaPipe runtime come to about 16MB. Downloading
 * that once is a fair ask. Downloading it on every scan, on a phone in a country where data
 * is bought in bundles, is not.
 *
 * The refusal: the models are NOT precached. Precaching would pull 16MB the first time she
 * opens the app, before she has decided whether she wants to be scanned at all, and a woman
 * who only ever checks her palette would pay for models she never uses. They are cached the
 * first time she actually scans, and kept for good afterwards.
 *
 * VERSION is stamped per build (see vite.config.ts). The activate handler deletes every
 * cache that is not the current version, so a new build never serves last build's shell.
 * Ilowa learned this one the hard way: an unstamped worker will happily serve a stale app
 * forever, and the user has no way to break out of it.
 */
const VERSION = 'oira-dev';

const SHELL = `shell-${VERSION}`;
/* Deliberately not versioned. Model weights and font files are content addressed or
   immutable, so the bytes for a given URL never change, and rebuilding the app is no reason
   to make her download 16MB again. */
const ASSETS = 'assets-v1';

/* The one origin that is not ours and is still cached here: the Gemma weights, on our own
   Contabo box. It has to be named twice below, because both of the worker's usual rules
   would otherwise throw it away. The reason it is not on this origin at all is in
   public/_headers and infra/oira.caddy; the short version is that three gigabytes through
   Netlify would bill the whole account offline.

   Keep this in step with DEFAULT_MODEL_URL in src/lib/localModel.ts and with connect-src
   in public/_headers. All three name the same host and all three have to agree, which is
   the price of the file living somewhere else. */
const WEIGHTS_ORIGIN = 'https://models.myoira.com';

/* The shell only. Small, and it is what makes the app open at all. */
const PRECACHE = ['/', '/index.html'];

/* Immutable by construction: fingerprinted bundles, content-addressed fonts, versioned
   model weights, the vendored runtimes and the brand marks. Cache first, forever.

   /vendor/ is here for the same reason /mediapipe/ is. The GenAI runtime behind Ask Oira's
   on-device model is 27MB of WASM, copied out of the npm package by scripts/fetch-models.sh
   and served from our own origin. Leaving it out would have refetched it on every cold
   start and, worse, left her holding three gigabytes of weights that could not load without
   a network. */
const IMMUTABLE = /^\/(assets|fonts|models|mediapipe|vendor|brand)\//;

/* The concierge scripts. Code, and the only code here that is NOT fingerprinted.
 *
 * These were in IMMUTABLE, which was wrong in a way that hid itself completely. Everything
 * else in that list either never changes (fonts, brand marks) or gets a content hash in its
 * filename from Vite, so a new build is a new URL and the old entry is simply never asked for
 * again. /concierge/oira-remote.js is the same URL forever. Cached first and never revalidated,
 * it meant a woman who had opened the app once kept that copy for good: three separate fixes to
 * the concierge shipped to the server and reached nobody who had already been here. The app
 * looked broken in exactly the way the fixes had just addressed.
 *
 * Network first, cache as the fallback. 72KB total, fetched once a session, against the
 * alternative of never being able to fix them again. */
const CODE = /^\/concierge\//;

/* Hers, but not immutable: she may get new portraits and products with a deploy. Cache
   first so the app is instant, then quietly refresh in the background. */
const REFRESHABLE = /^\/(portraits|products)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL && k !== ASSETS)
          .map((k) => caches.delete(k))
      )
    ).then(async () => {
      /* Evict the concierge scripts from the asset cache on every activation.
       *
       * They used to be cached as immutable, so a phone that has been here before is still
       * holding whichever copy it first saw, and network-first would only stop serving it
       * once online. Dropping them here means the very next fetch repopulates from the
       * server, and the offline fallback is a current copy rather than an ancient one.
       * Everything else in ASSETS is content-addressed and stays: it is the 16MB of scan
       * models and, for some women, three gigabytes of weights. */
      try {
        const c = await caches.open(ASSETS);
        const stale = (await c.keys()).filter((r) => CODE.test(new URL(r.url).pathname));
        await Promise.all(stale.map((r) => c.delete(r)));
      } catch { /* nothing cached is the outcome asked for */ }
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const weights = url.origin === WEIGHTS_ORIGIN;
  /* Everything else cross-origin is none of this worker's business. Letting the weights
     host through is what makes the download a one-off: the engine fetches the model by URL
     when it starts, and without this line that fetch would miss the cache she already paid
     three gigabytes to fill and go to the network every time. */
  if (url.origin !== self.location.origin && !weights) return;

  /* Never cached, ever. The concierge's answers are about her, right now, and a stale one
     is worse than none. */
  if (url.pathname.startsWith('/api/')) return;

  /* Navigations go to the network first so a deploy actually lands, and fall back to the
     cached shell when there is no signal. */
  if (request.mode === 'navigate') {
    /* Only the app itself refreshes the cached shell.
     *
     * This used to write every navigation response to /index.html, which was fine while the
     * app was the only page on the origin and became a real bug the moment it was not:
     * opening /residuals.html once would have replaced the cached shell with that page, and
     * from then on every offline launch of Oira would have opened an internal debug table
     * instead of the app. Nothing would have looked wrong until somebody lost signal. */
    const isShell = url.pathname === '/' || url.pathname === '/index.html';
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (isShell && res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => (isShell ? caches.match('/index.html').then((r) => r || Response.error()) : Response.error()))
    );
    return;
  }

  /* Code, so the network gets asked first and the cache is only the safety net. Offline she
     gets the last copy that worked, which is the right answer; online she always gets the
     current one, which is the thing this could not do before. */
  if (CODE.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(ASSETS).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || Response.error()))
    );
    return;
  }

  /* The weights are immutable by the same argument as everything in IMMUTABLE, but they
     are matched by origin rather than by path: they live at the root of their own host, so
     there is no /models/ prefix on them to test. */
  if (weights || IMMUTABLE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            /* Only keep a real answer. Caching a 404 or an opaque error would poison the
               entry permanently, and for a 4MB model file that is a bad thing to get wrong. */
            if (res.ok && res.status === 200) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
    return;
  }

  if (REFRESHABLE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    );
  }
});
