const VERSION = 'v1.0.9';
const CACHE_NAME = `garfield-${VERSION}`;
const RUNTIME_CACHE = `garfield-runtime-${VERSION}`;
const IMAGE_CACHE = `garfield-images-${VERSION}`;

// Cache size limits
const MAX_IMAGE_CACHE_SIZE = 50;
const MAX_RUNTIME_CACHE_SIZE = 30;

// Critical assets to precache
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './main.css',
  './app.js',
  './init.js',
  './comicExtractor.js',
  './toolbar.js',
  './googleDriveSync.js',
  './manifest.webmanifest',
  './garlogo.webp',
  './garfield-first.gif'
];

// Assets without which the app cannot boot. `app.js` is an ES module that
// statically imports `comicExtractor.js` and `toolbar.js`, so a missing module
// graph member is a hard failure (blank screen), not a degraded experience.
const REQUIRED_PRECACHE_ASSETS = new Set([
  './',
  './index.html',
  './main.css',
  './app.js',
  './comicExtractor.js',
  './toolbar.js'
]);

/**
 * Message handler for client communication.
 *
 * `SKIP_WAITING` is sent by the update banner in init.js. The install step
 * deliberately does NOT call skipWaiting(), so a new worker stays in `waiting`
 * until the user accepts the update. That keeps the currently open page on the
 * cache generation it was loaded with (activate deletes older caches).
 *
 * `GET_VERSION` lets the settings panel read the *active* worker's version over
 * a MessageChannel instead of re-fetching and regex-scraping this file.
 */
self.addEventListener('message', (event) => {
  const type = event.data?.type;

  if (type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (type === 'GET_VERSION') {
    event.ports?.[0]?.postMessage({ type: 'VERSION', version: VERSION });
  }
});

/**
 * Install - precache critical assets
 */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(PRECACHE_ASSETS.map(asset => precacheAsset(cache, asset))))
  );
});

async function precacheAsset(cache, asset) {
  try {
    await cache.add(new Request(asset, { cache: 'reload' }));
  } catch (error) {
    console.error(`Failed to precache ${asset}`, error);
    if (REQUIRED_PRECACHE_ASSETS.has(asset)) {
      throw error;
    }
  }
}

/**
 * Activate - clean old caches
 */
self.addEventListener('activate', (event) => {
  const currentCaches = [CACHE_NAME, RUNTIME_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => name.startsWith('garfield-') && !currentCaches.includes(name))
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

/**
 * Fetch - intelligent caching strategies
 */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const { destination } = event.request;

  // Cache-first with LRU eviction for images (including cross-origin comic images)
  if (destination === 'image' || url.pathname.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
    event.respondWith(cacheFirstWithLimit(event.request, IMAGE_CACHE, MAX_IMAGE_CACHE_SIZE));
    return;
  }

  // Only handle same-origin for other assets
  if (url.origin !== location.origin) return;

  // Cache-first for app shell
  if (['document', 'style', 'script'].includes(destination) || url.pathname.endsWith('.svg')) {
    event.respondWith(cacheFirstStrategy(event.request, CACHE_NAME));
    return;
  }

  // Network-first for other resources
  event.respondWith(networkFirstStrategy(event.request, RUNTIME_CACHE));
});

/**
 * Cache-first strategy for app shell
 */
async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    // For navigation requests, ensure redirects are followed properly
    const fetchOptions = request.mode === 'navigate' ? { redirect: 'follow' } : {};
    const networkResponse = await fetch(request, fetchOptions);

    // Only cache successful, non-redirected responses.
    // The write is awaited so the response is durably stored before the fetch
    // handler settles — otherwise the browser may terminate the worker first.
    if (networkResponse?.status === 200 && !networkResponse.redirected) {
      const cache = await caches.open(cacheName);
      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    if (request.headers.get('accept')?.includes('text/html')) {
      return (await caches.match('./index.html')) ||
        (await caches.match('./offline.html')) ||
        Response.error();
    }
    throw error;
  }
}

/**
 * Cache-first with LRU eviction for images
 */
async function cacheFirstWithLimit(request, cacheName, maxSize) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    // For opaque responses (no-cors cross-origin images), status will be 0
    const networkResponse = await fetch(request);
    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
      const cache = await caches.open(cacheName);

      // LRU eviction
      const keys = await cache.keys();
      while (keys.length >= maxSize) {
        await cache.delete(keys.shift());
      }

      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Image not available offline', {
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

/**
 * Network-first strategy for dynamic resources
 */
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse?.status === 200) {
      const cache = await caches.open(cacheName);

      // Limit cache size
      const keys = await cache.keys();
      while (keys.length >= MAX_RUNTIME_CACHE_SIZE) {
        await cache.delete(keys.shift());
      }

      await cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) return cachedResponse;
    throw error;
  }
}

