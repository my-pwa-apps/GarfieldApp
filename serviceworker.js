const VERSION = 'v6';
const CACHE_NAME = `garfield-${VERSION}`;
const OFFLINE_URL = 'index.html';

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
            .filter(name => name.startsWith('garfield-') && name !== CACHE_NAME)
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

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone and cache successful responses
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request)
          .then(cachedResponse => {
            return cachedResponse || caches.match(OFFLINE_URL);
          });
      })
  );
});

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