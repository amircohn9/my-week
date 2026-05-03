const CACHE_NAME = 'focus-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/config.js',
  '/supabase-helpers.js',
  '/utils.js',
  '/charts.js',
  '/tasks.js',
  '/checkin-form.js',
  '/app.js',
  '/weekend-ideas.js',
  '/job-applications.js',
  '/manifest.json'
];

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first for everything (always get latest version)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful same-origin responses for offline fallback
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline: serve from cache
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') return caches.match('/index.html');
        });
      })
  );
});
