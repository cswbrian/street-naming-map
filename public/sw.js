const CACHE_NAME = 'hk-streets-v4'
const BASE_URL = new URL(self.registration.scope).pathname
const PRECACHE_URLS = [
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}favicon-32.png`,
  `${BASE_URL}apple-touch-icon.png`,
  `${BASE_URL}icons/icon-192.png`,
  `${BASE_URL}icons/icon-512.png`,
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  // Network-first: always fetch fresh HTML, JS, and JSON data. Fall back to
  // cache only when offline (precached icons/manifest, or a prior visit).
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((cached) => cached ?? caches.match(BASE_URL))),
  )
})
