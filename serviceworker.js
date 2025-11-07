const VERSION = 'v8';
const CACHE_NAME = `garfield-${VERSION}`;
const RUNTIME_CACHE = `garfield-runtime-${VERSION}`;
const IMAGE_CACHE = `garfield-images-${VERSION}`;
const OFFLINE_URL = 'index.html';

// Maximum cache sizes
const MAX_IMAGE_CACHE_SIZE = 50; // Keep last 50 comic images
const MAX_RUNTIME_CACHE_SIZE = 30;

// Assets to precache
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './main.css',
  './app.js',
  './init.js',
  './comicExtractor.js',
  './swiped-events.min.js',
  './garlogo.png',
  './heartborder.svg',
  './heart.svg',
  './tune.svg',
  './share.svg'
];

// Message handler for skip waiting
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CHECK_NEW_COMIC') {
    checkForNewComic();
  }
});

// Install - precache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith('garfield-') && 
                          name !== CACHE_NAME && 
                          name !== RUNTIME_CACHE && 
                          name !== IMAGE_CACHE)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch - network first, cache fallback
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip cross-origin requests (except for same-origin)
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) {
    return;
  }
  
  const { destination } = event.request;
  
  // Strategy: Cache First for app shell (HTML, CSS, JS, SVG)
  if (['document', 'style', 'script'].includes(destination) || url.pathname.endsWith('.svg')) {
    event.respondWith(cacheFirstStrategy(event.request, CACHE_NAME));
    return;
  }
  
  // Strategy: Cache First with size limit for images
  if (destination === 'image') {
    event.respondWith(cacheFirstWithLimit(event.request, IMAGE_CACHE, MAX_IMAGE_CACHE_SIZE));
    return;
  }
  
  // Strategy: Network First for everything else
  event.respondWith(networkFirstStrategy(event.request, RUNTIME_CACHE));
});

// Cache First Strategy - for app shell
async function cacheFirstStrategy(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse?.status === 200) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // If fetch fails and it's an HTML request, return offline page
    if (request.headers.get('accept')?.includes('text/html')) {
      return caches.match('./offline.html');
    }
    throw error;
  }
}

// Cache First with cache size limit - for images
async function cacheFirstWithLimit(request, cacheName, maxSize) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse?.status === 200) {
      const cache = await caches.open(cacheName);
      
      // Manage cache size - remove oldest entries when limit reached
      const keys = await cache.keys();
      while (keys.length >= maxSize) {
        await cache.delete(keys.shift()); // Remove oldest (FIFO)
      }
      
      // Cache the new response
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('Image not available offline', { 
      status: 503,
      statusText: 'Service Unavailable'
    });
  }
}

// Network First Strategy - for API calls and external resources
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse?.status === 200) {
      const cache = await caches.open(cacheName);
      
      // Limit runtime cache size too
      const keys = await cache.keys();
      while (keys.length >= MAX_RUNTIME_CACHE_SIZE) {
        await cache.delete(keys.shift());
      }
      
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Check for new comic
async function checkForNewComic() {
  try {
    // Use Eastern Time (EST/EDT) since GoComics publishes based on US Eastern time
    const nowUTC = new Date();
    const estOffset = -5; // EST is UTC-5 (or -4 during EDT, but simplified here)
    const nowEST = new Date(nowUTC.getTime() + (estOffset * 60 * 60 * 1000));
    
    const year = nowEST.getUTCFullYear();
    const month = String(nowEST.getUTCMonth() + 1).padStart(2, '0');
    const day = String(nowEST.getUTCDate()).padStart(2, '0');
    
    // Check if we already notified for this date
    const lastNotifiedDate = await getLastNotifiedDate();
    const todayStr = `${year}-${month}-${day}`;
    
    if (lastNotifiedDate === todayStr) {
      console.log('Already notified for today:', todayStr);
      return;
    }
    
    // Check if it's too early (before 12:05 AM EST)
    const estHour = nowEST.getUTCHours();
    const estMinute = nowEST.getUTCMinutes();
    if (estHour === 0 && estMinute < 5) {
      console.log('Too early, comics typically publish after 12:05 AM EST');
      return;
    }
    
    // Try to fetch today's comic from GoComics using CORS proxy
    const comicUrl = `https://www.gocomics.com/garfield/${year}/${month}/${day}`;
    const proxyUrl = `https://corsproxy.garfieldapp.workers.dev/?${encodeURIComponent(comicUrl)}`;
    
    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      
      // More robust check: Look for the comic image URL pattern
      const hasComic = html.includes('featureassets.gocomics.com') || 
                      html.includes('assets.amuniversal.com') ||
                      (html.includes('data-image') && html.includes('garfield'));
      
      // Also check it's not a "coming soon" or error page
      const isValid = !html.includes('Comic for') && 
                     !html.includes('will be available') &&
                     !html.includes('not yet available');
      
      if (hasComic && isValid) {
        // New comic is available!
        console.log('New comic detected for:', todayStr);
        await saveLastNotifiedDate(todayStr);
        await showNotification(todayStr);
      } else {
        console.log('Comic not yet available for:', todayStr);
      }
    } else {
      console.warn('Failed to fetch comic page, status:', response.status);
    }
  } catch (error) {
    console.error('Error checking for new comic:', error);
  }
}

async function getLastNotifiedDate() {
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match('last-notified-date');
  if (response) {
    return await response.text();
  }
  return null;
}

async function saveLastNotifiedDate(date) {
  const cache = await caches.open(CACHE_NAME);
  await cache.put('last-notified-date', new Response(date));
}

async function showNotification(date) {
  const options = {
    body: `Today's Garfield comic is now available! (${date})`,
    icon: './android/android-launchericon-192-192.png',
    badge: './android/android-launchericon-96-96.png',
    tag: 'new-comic',
    requireInteraction: false,
    data: {
      url: './',
      date: date
    },
    actions: [
      {
        action: 'view',
        title: 'View Comic'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };
  
  await self.registration.showNotification('New Garfield Comic!', options);
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data.url || './')
    );
  }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-new-comic') {
    event.waitUntil(checkForNewComic());
  }
});