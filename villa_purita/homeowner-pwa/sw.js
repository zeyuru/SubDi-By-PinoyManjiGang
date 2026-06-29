// ══════════════════════════════════════════════════════════════════════════
// VILLA PURITA — HOMEOWNER PWA — SERVICE WORKER
// Strategy:
//   - HTML & JS (index.html, app.js — the app's logic, including the
//     Homeowner-only role check): NETWORK-FIRST, cache fallback. This is
//     deliberate and important: these files must never go permanently stale.
//     If they were cache-first, a phone that cached an older version would
//     keep running outdated logic indefinitely (e.g. an old build that
//     doesn't yet block non-Homeowner roles), even after the server is
//     fixed. Network-first means "always use the latest version when
//     online; only fall back to the cached version when truly offline."
//   - CSS, icons, fonts, Leaflet (cosmetic/library assets that don't affect
//     security logic): cache-first, since staleness here is harmless and
//     cache-first is faster.
//   - GET API calls (/api/...): network-first, fall back to cache
//     (offline-first for data — last successful response shown when offline).
//   - Non-GET API calls (POST login, pay, incident report, etc.): never
//     cached, always go to network. If offline, the request fails and the
//     app shows a friendly "you're offline" message — actions are never
//     silently queued or guessed at.
// ══════════════════════════════════════════════════════════════════════════

const SHELL_CACHE = 'vp-ho-shell-v2';
const DATA_CACHE  = 'vp-ho-data-v1';

// Files whose staleness is a correctness/security concern — always network-first.
const NETWORK_FIRST_FILES = ['./', './index.html', './app.js', './sw.js'];

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/fonts/syne-latin-700-normal.woff2',
  './vendor/fonts/syne-latin-800-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-400-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-500-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-600-normal.woff2',
  './vendor/fonts/plus-jakarta-sans-latin-700-normal.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

function isApiRequest(url) {
  return url.pathname.includes('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Safety net: only ever handle page/asset requests whose path is inside this service
  // worker's own registration scope (homeowner-pwa/). API calls are exempt from this check
  // because the API lives one folder above (../api), outside the PWA's own scope, but still
  // needs to be reachable for the offline-data-caching feature to work.
  const swScopePath = self.registration.scope.replace(self.location.origin, '');
  const isApi = url.pathname.includes('/api/');
  if (url.origin === self.location.origin && !isApi && !url.pathname.startsWith(swScopePath)) {
    return;
  }

  // Only handle GET — let POST/PUT/DELETE go straight to network (no caching of mutations)
  if (req.method !== 'GET') return;

  // Skip cross-origin requests we don't own (map tile servers) — let the browser handle those normally.
  // Leaflet, fonts, and icons are all vendored locally (same-origin) so they're reliably cached below.
  if (url.origin !== self.location.origin && !isApiRequest(url)) {
    return;
  }

  if (isApiRequest(url)) {
    // Network-first, cache fallback (offline-first viewing of last-known data)
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.open(DATA_CACHE).then((cache) =>
            cache.match(req).then((cached) => {
              if (cached) return cached;
              return new Response(
                JSON.stringify({ success: false, error: 'Offline — no cached data available.' }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
              );
            })
          )
        )
    );
    return;
  }

  // Is this one of the network-first files? (the page itself, or its JS/SW logic)
  const isNetworkFirstFile = NETWORK_FIRST_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')) || url.pathname === swScopePath);

  if (isNetworkFirstFile) {
    // Network-first: always fetch the latest version when online. Only fall back
    // to the cached copy if the network is genuinely unreachable (offline).
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Cosmetic/library assets (CSS, fonts, icons, Leaflet) — cache-first, since
  // staleness here is harmless and cache-first is faster / works offline immediately.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => undefined);
    })
  );
});
