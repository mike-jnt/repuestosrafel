'use strict';
const CACHE_NAME = 'comercializadora-mar-c1-8-1';
const APP_SHELL = [
  '/', '/index.html', '/css/app.css', '/js/core.js', '/js/firebase-config.js', '/js/image-cache.js', '/js/firestore-files.js', '/js/cloud.js',
  '/js/brand.js', '/js/pdf.js', '/js/app.js', '/assets/logo-comercializadora-mar.jpeg', '/assets/product-placeholder.svg',
  '/assets/icon-192.png', '/assets/icon-512.png', '/manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function cacheCopy(request, response) {
  // La copia debe crearse inmediatamente, antes de que el navegador consuma
  // el cuerpo de la respuesta original.
  const copy = response.clone();
  caches.open(CACHE_NAME)
    .then(cache => cache.put(request, copy))
    .catch(error => console.warn('[SW] No se pudo actualizar caché:', error));
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  if (url.hostname.includes('googleapis.com') || url.hostname.includes('firebaseio.com')) return;

  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/')) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
        cacheCopy(event.request, response);
        return response;
      }))
    );
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        cacheCopy('/index.html', response);
        return response;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (url.origin === self.location.origin && response.ok) cacheCopy(event.request, response);
      return response;
    }))
  );
});
