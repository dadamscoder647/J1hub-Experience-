// J1hub PWA – offline support with fallback page
const VERSION = "j1hub-v4";
const BASE = self.location.pathname.replace(/\/[^/]*$/, "/");
const ASSETS = [
  `${BASE}`, `${BASE}index.html`, `${BASE}hotel.html`, `${BASE}map.html`,
  `${BASE}resources.html`, `${BASE}qr.html`, `${BASE}qr-sheet.html`, `${BASE}admin.html`,
  `${BASE}import-hotels.html`, `${BASE}dashboard.html`, `${BASE}feedback.html`,
  `${BASE}offline.html`,
  `${BASE}hotels.json`, `${BASE}resources.json`, `${BASE}housing.json`, `${BASE}translations.json`,
  `${BASE}data/resources.json`, `${BASE}js/resources.js`,
  `${BASE}translations/en.json`, `${BASE}translations/es.json`, `${BASE}translations/pt.json`,
  `${BASE}manifest.json`, `${BASE}j1hub-192.png`, `${BASE}j1hub-512.png`
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // If it's a navigation (HTML page), do network-first with offline fallback
  if (req.mode === "navigate" || (req.destination === "document")) {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(VERSION);
        const offline = await cache.match(`${BASE}offline.html`);
        return offline || new Response("Offline", { status: 503 });
      })
    );
    return;
  }

  // JSON: network-first (so data stays fresh)
  if (req.url.endsWith(".json")) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else: cache-first
  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  return cached || fetch(req);
}

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const fresh = await fetch(req);
    cache.put(req, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response("Offline", { status: 503 });
  }
}
