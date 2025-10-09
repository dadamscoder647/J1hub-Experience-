const CACHE_VERSION = 'v-truss-1';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const ASSET_CACHE = `assets-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const OFFLINE_URL = '/pwa/offline.html';

const SHELL_URLS = ['/', '/index.html', OFFLINE_URL, '/pwa/manifest.json'];
const STATIC_ASSETS = [
  '/assets/css/theme.css',
  '/assets/css/main.css',
  '/assets/css/safety.css',
  '/assets/css/events.css',
  '/assets/js/onboarding.js',
  '/assets/js/safety.js',
  '/assets/js/events.js',
  '/assets/js/resources.js',
  '/assets/js/admin.js',
  '/assets/js/qr.js',
  '/assets/js/lib/i18n.js',
  '/assets/js/vendor/qr.min.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];
const DATA_PREFETCH_URLS = [
  '/assets/data/events.json',
  '/assets/data/resources.json',
  '/assets/data/onboarding.DEFAULT.json',
  '/assets/data/onboarding.KAL.json',
  '/assets/data/hotels.json',
  '/assets/data/housing.json',
  '/assets/i18n/en.json',
  '/assets/i18n/es.json',
  '/assets/i18n/pt.json',
  '/assets/i18n/translations.json'
];
const NAVIGATION_CACHE_PATHS = new Set([
  '/index.html',
  '/pages/events.html',
  '/pages/resources.html',
  '/pages/hotel.html',
  '/pages/map.html',
  '/pages/dashboard.html',
  '/pages/admin.html',
  '/pages/qr.html',
  '/pages/feedback.html',
  '/pages/qr-sheet.html',
  '/pages/import-hotels.html'
]);

const OFFLINE_JSON_RESPONSE = new Response(
  JSON.stringify({
    error: 'offline',
    message: 'Content unavailable while offline. Please reconnect and try again.'
  }),
  {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  }
);

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)),
      caches.open(ASSET_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
      caches.open(DATA_CACHE).then((cache) => cache.addAll(DATA_PREFETCH_URLS))
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, ASSET_CACHE, DATA_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (url.origin === self.location.origin) {
    if (SHELL_URLS.includes(url.pathname)) {
      event.respondWith(cacheFirst(event, SHELL_CACHE));
      return;
    }

    if (url.pathname.startsWith('/assets/data/') || url.pathname.startsWith('/assets/i18n/')) {
      event.respondWith(staleWhileRevalidate(event, DATA_CACHE));
      return;
    }

    if (
      url.pathname.startsWith('/assets/css/') ||
      url.pathname.startsWith('/assets/js/') ||
      url.pathname.startsWith('/assets/icons/')
    ) {
      event.respondWith(cacheFirst(event, ASSET_CACHE));
      return;
    }
  }

  event.respondWith(fetch(request).catch(() => caches.match(request)));
});

async function handleNavigation(event) {
  const { request } = event;
  const url = new URL(request.url);
  const normalizedPath = normalizePath(url.pathname);

  try {
    const response = await fetch(request);
    if (url.origin === self.location.origin) {
      const pathToCache = normalizedPath;
      if (NAVIGATION_CACHE_PATHS.has(pathToCache) || pathToCache === '/index.html') {
        const cache = await caches.open(SHELL_CACHE);
        event.waitUntil(cache.put(pathToCache, response.clone()));
      }
    }
    return response;
  } catch (error) {
    const cache = await caches.open(SHELL_CACHE);

    if (normalizedPath === '/index.html') {
      const cachedHome = await cache.match('/index.html');
      if (cachedHome) {
        return cachedHome;
      }
    }

    const cachedPage = await cache.match(normalizedPath);
    if (cachedPage) {
      return cachedPage;
    }

    const offlineFallback = await cache.match(OFFLINE_URL);
    if (offlineFallback) {
      return offlineFallback;
    }

    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

async function staleWhileRevalidate(event, cacheName) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        return cache.put(request, response.clone()).then(() => response);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    event.waitUntil(networkPromise);
    return cached;
  }

  const networkResponse = await networkPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return OFFLINE_JSON_RESPONSE.clone();
}

async function cacheFirst(event, cacheName) {
  const { request } = event;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    if (cached) {
      return cached;
    }
    throw error;
  }
}

function normalizePath(pathname) {
  if (pathname === '/' || pathname === '') {
    return '/index.html';
  }
  return pathname;
}
