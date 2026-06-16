// Service worker for Freezy Trading Hub PWA.
// CACHE_VERSION must be bumped on every deployment to bust stale caches.
const CACHE_VERSION = 'v3';
const CACHE_NAME = `freezy-trading-hub-pwa-cache-${CACHE_VERSION}`;

// Static assets that are safe to cache long-term (they have content-hashed filenames).
const STATIC_ASSET_REGEX = /\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp)(\?.*)?$/i;

// Install: skip waiting so the new SW activates immediately.
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(['/freezy-logo.png', '/manifest.json']))
            .then(() => self.skipWaiting())
    );
});

// Activate: delete ALL old caches so stale data is never served.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // --- Network-first for HTML navigation requests ---
    // This ensures users always get the latest index.html after a new deployment.
    if (event.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Only cache a valid response.
                    if (response && response.status === 200) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request).then(cached => cached || caches.match('/index.html')))
        );
        return;
    }

    // --- Cache-first for hashed static assets (JS, CSS, fonts, images) ---
    if (STATIC_ASSET_REGEX.test(url.pathname)) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response && response.status === 200 && response.type === 'basic') {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
                    }
                    return response;
                });
            })
        );
        return;
    }

    // --- Network-only for everything else (API calls, WebSockets, etc.) ---
    // Do not intercept; let the browser handle it normally.
});
