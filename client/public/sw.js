/* Fluency PWA: instalación online-first, sin caché de aplicación ni datos. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  const isSameOriginNavigation = (
    event.request.mode === 'navigate'
    && requestUrl.origin === self.location.origin
  );

  if (isSameOriginNavigation) {
    event.respondWith(fetch(event.request));
  }
});
