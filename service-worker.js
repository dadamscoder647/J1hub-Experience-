// J1hub PWA – service worker providing offline shell + data caching
//
// Strategy overview:
// 1. Precache the application shell (core HTML, CSS, JS) during install so that
//    the site loads instantly when offline.
// 2. Use stale-while-revalidate for runtime JSON under /data/ so previously
//    viewed datasets (events/resources/onboarding) are available offline while
//    refreshing them in the background when online.
// 3. Handle navigations with a network-first approach, keeping cached copies of
//    events/resources pages to display cached data offline and falling back to a
//    dedicated offline page if nothing is cached.

const CACHE_VERSION = "j1hub-v5";
const BASE = self.location.pathname.replace(/\/[^/]*$/, "/");
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const OFFLINE_URL = `${BASE}offline.html`;

const SHELL_ASSETS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}events.html`,
  `${BASE}resources.html`,
  `${BASE}offline.html`,
  `${BASE}manifest.json`,
  `${BASE}css/theme.css`,
  `${BASE}css/events.css`,
  `${BASE}css/safety.css`,
  `${BASE}js/events.js`,
  `${BASE}js/resources.js`,
  `${BASE}js/lib/i18n.js`
];

const OFFLINE_DATA_RESPONSE = new Response(
  JSON.stringify({
    error: "offline",
    message: "Content unavailable while offline. Please reconnect and try again."
  }),
  {
    status: 503,
    headers: {
      "Content-Type": "application/json"
    }
  }
);

const OFFLINE_NAVIGATION_PATHS = new Set([
  `${BASE}events.html`,
  `${BASE}resources.html`
]);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const allowedCaches = [SHELL_CACHE, DATA_CACHE];
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => !allowedCaches.includes(key)).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (
    url.origin === self.location.origin &&
    url.pathname.startsWith(`${BASE}data/`) &&
    url.pathname.endsWith(".json")
  ) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  if (["style", "script", "image", "font"].includes(request.destination)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

async function handleNavigation(event) {
  const { request } = event;
  const url = new URL(request.url);

  try {
    const response = await fetch(request);

    if (url.origin === self.location.origin && OFFLINE_NAVIGATION_PATHS.has(url.pathname)) {
      const cache = await caches.open(SHELL_CACHE);
      event.waitUntil(cache.put(request, response.clone()));
    }

    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    if (url.origin === self.location.origin && OFFLINE_NAVIGATION_PATHS.has(url.pathname)) {
      const cachedPage =
        (await cache.match(request)) || (await cache.match(`${BASE}${url.pathname.split("/").pop()}`));
      if (cachedPage) {
        return cachedPage;
      }
    }

    const offlinePage = await cache.match(OFFLINE_URL);
    return offlinePage || new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(event) {
  const { request } = event;
  const cache = await caches.open(DATA_CACHE);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        event.waitUntil(cache.put(request, copy));
      }
      return response;
    })
    .catch(() => null);

  if (cachedResponse) {
    event.waitUntil(networkPromise);
    return cachedResponse;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return OFFLINE_DATA_RESPONSE;
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  return cached || fetch(request);
}
