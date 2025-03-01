const OFFLINE_VERSION = 2;
const CACHE = "offline";

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

beforeinstallprompt = null;
self.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  beforeinstallprompt = e;
  return false;
});

const CACHE_VERSION = 'v2';
const CACHE_NAME = `garfield-${CACHE_VERSION}`;
const OFFLINE_URL = 'offline.html';

const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/main.css',
    '/app.js',
    '/manifest.webmanifest',
    '/garlogo.png',
    '/heart.svg',
    '/heartborder.svg',
    '/share.svg',
    '/tune.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.add(new Request(OFFLINE_URL, {cache: 'reload'}));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
   
    if ('navigationPreload' in self.registration) {
      await self.registration.navigationPreload.enable();
    }
  })());

  self.clients.claim();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
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
        return cachedResponse;
      }
    })());
  } else {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return caches.match(event.request) || caches.match(OFFLINE_URL);
        })
    );
  }
});