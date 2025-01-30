const CACHE = "pwabuilder-offline";

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

workbox.routing.registerRoute(
  new RegExp('.*'),
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: CACHE
  })
);

self.addEventListener('install', async event => {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(OFFLINE_URL);
});

self.addEventListener('activate', async event => {
  if ('navigationPreload' in self.registration) {
    await self.registration.navigationPreload.enable();
  }
  self.clients.claim();
});

self.addEventListener('fetch', async event => {
  if (event.request.mode === 'navigate') {
    try {
      const preloadResponse = await event.preloadResponse;
      if (preloadResponse) {
        return preloadResponse;
      }
      const networkResponse = await fetch(event.request);
      return networkResponse;
    } catch (error) {
      console.error('Fetch failed; returning offline page instead.', error);
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(OFFLINE_URL[0]);
      return cachedResponse;
    }
  }
});