// service-worker.js
// J1hub PWA – cache static assets + JSON, work offline

const VERSION = "j1hub-v2";
const BASE = self.location.pathname.replace(/\/[^/]*$/, "/"); // handles GitHub Pages subpath
const ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}hotel.html`,
  `${BASE}map.html`,
  `${BASE}qr.html`,
  `${BASE}qr-sheet.html`,
  `${BASE}admin.html`,
  `${BASE}import-hotels.html`,
  `${BASE}dashboard.html`,
  `${BASE}feedback.html`,
  `${BASE}hotels.json`,
  `${BASE}resources.json`,
  `${BASE}housing.json`,
  `${BASE}translations.json`,
  `${BASE}j1hub-192.png`,
  `${BASE}j1hub-512.png`,
  `${BASE}manifest.json`
];

// Install – pre-cache core files
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate – clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Strategy: network-first for JSON, cache-first for other assets
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const isJSON = req.url.endsWith(".json");
  if (isJSON) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(cacheFirst(req));
  }
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
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    // last resort
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}
