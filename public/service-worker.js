// A service worker to make the app installable (PWA) and work offline.

const CACHE_NAME = 'makoti-pwa-cache-v1';
// These are the files that make up the "app shell".
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/makoti-logo.jpg'
  // NOTE: JS and CSS files are usually added here, but without knowing the build output,
  // we'll let them be cached dynamically during the first visit.
];

// Install the service worker and cache the app shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting()) // Activate worker immediately
  );
});

// Clean up old caches on activation.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of open clients
  );
});

// Serve cached content when offline.
self.addEventListener('fetch', event => {
  // We only care about GET requests.
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return the response from the cache.
        if (response) {
          return response;
        }

        // Not in cache - fetch from the network, and cache it for next time.
        return fetch(event.request).then(
          response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        ).catch(() => {
            // If the request is for a page navigation, show the offline page.
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        });
      })
  );
});
