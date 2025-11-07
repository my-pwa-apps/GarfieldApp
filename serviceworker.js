const OFFLINE_VERSION = 3;
const CACHE_NAME = "offline-v3";
const OFFLINE_URL = "offline.html";

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Exclude specific URLs (e.g., fonts) from being cached or proxied
const excludedUrls = [
  /https:\/\/corsproxy\.io\/_next\/static\/media\/.*\.woff2/,
  /https:\/\/fonts\.googleapis\.com/,
  /https:\/\/fonts\.gstatic\.com/
];

workbox.routing.registerRoute(
  ({ url }) => {
    // Skip caching for excluded URLs
    return !excludedUrls.some((pattern) => pattern.test(url.href));
  },
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: CACHE_NAME,
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50, // Limit the number of cached entries
        maxAgeSeconds: 7 * 24 * 60 * 60, // Cache for 7 days
      }),
    ],
  })
);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Clean up old caches
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter(name => name !== CACHE_NAME)
        .map(name => caches.delete(name))
    );

    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }
  })());

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) {
          return preloadResponse;
        }

        const networkResponse = await fetch(event.request);
        return networkResponse;
      } catch (error) {
        console.log('Fetch failed; returning offline page instead.', error);

        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(OFFLINE_URL);
        return cachedResponse || new Response('Offline content unavailable.', { status: 503 });
      }
    })());
  } else if (excludedUrls.some((pattern) => pattern.test(event.request.url))) {
    // Skip handling excluded URLs
    return;
  } else {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(event.request);
        return networkResponse;
      } catch (error) {
        console.log('Fetch failed for non-navigation request:', event.request.url, error);
        return new Response('Resource unavailable.', { status: 503 });
      }
    })());
  }
});