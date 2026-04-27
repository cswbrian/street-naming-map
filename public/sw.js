const CACHE_NAME = 'hk-streets-v2'
const BASE_URL = new URL(self.registration.scope).pathname
const PRECACHE_URLS = [
  BASE_URL,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}icons/icon-192.svg`,
  `${BASE_URL}icons/icon-512.svg`,
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

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached
      }

      return fetch(request)
        .then((response) => {
          const cacheable = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cacheable))
          return response
        })
        .catch(() => caches.match(BASE_URL))
    }),
  )
})
