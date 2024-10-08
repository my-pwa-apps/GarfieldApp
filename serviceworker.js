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

self.addEventListener('push', event => {
  const data = event.data.json();
  const options = {
      body: data.body,
      icon: data.icon,
      badge: data.badge
  };
  event.waitUntil(
      self.registration.showNotification(data.title, options)
  );
});

async function checkForNewComic() {
  const siteUrl = 'https://corsproxy.garfieldapp.workers.dev/cors-proxy?https://www.gocomics.com/garfield';
  try {
      const response = await fetch(siteUrl);
      const text = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const comicImg = doc.querySelector('.comic__image img');
      const pictureUrl = comicImg ? comicImg.getAttribute('data-srcset').split(' ')[0] : '';

      const storedPictureUrl = await caches.match('latestComicUrl');
      if (pictureUrl && pictureUrl !== storedPictureUrl) {
          await caches.open(CACHE).then(cache => cache.put('latestComicUrl', new Response(pictureUrl)));
          self.registration.showNotification('New Garfield Comic Available!', {
              body: 'Check out the latest Garfield comic now!',
              icon: '/path/to/icon.png',
              badge: '/path/to/badge.png'
          });
      }
  } catch (error) {
      console.error("Failed to fetch comic:", error);
  }
}

// Periodically check for new comic in the background
setInterval(checkForNewComic, 3600000); // Check every hour

async function requestNotificationPermission() {
  if ('Notification' in window && navigator.serviceWorker) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
          console.log('Notification permission granted.');
      } else if (permission === 'denied') {
          console.log('Notification permission denied.');
      } else {
          console.log('Notification permission dismissed.');
      }
  } else {
      console.log('Notifications are not supported in this browser.');
  }
}