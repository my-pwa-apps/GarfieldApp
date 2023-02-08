const OFFLINE_VERSION = 2;
const CACHE_NAME = 'offline';
const OFFLINE_URL = [
  "./index.html",
  "./garlogo.webp",
  "./mail.webp",
  "./swiped-events.min.js",    
  "./app.js",
  "./main.css",
  "./serviceworker.js",
  "./garfield.webp",    
  "./garyellowmask.png",
  "./garscreenshot1.png",
  "./mstile-150x150.png",
  "./favicon.ico",
  "./favicon-32x32.png",
  "./favicon-16x16.png",
  "./favicon-32x32.webp",
  "./favicon-16x16.webp",
  "./apple-touch-icon.png",
  "./android-chrome-192x192.png"
];

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
