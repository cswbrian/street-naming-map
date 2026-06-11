const CACHE_NAME = 'hk-streets-v5'
const TILE_CACHE_NAME = 'hk-streets-tiles-v1'
const BASE_URL = new URL(self.registration.scope).pathname
const PRECACHE_URLS = [
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}favicon-32.png`,
  `${BASE_URL}apple-touch-icon.png`,
  `${BASE_URL}icons/icon-192.png`,
  `${BASE_URL}icons/icon-512.png`,
]

function isHistoricalMapTileRequest(url) {
  return url.pathname.includes('/historical-maps/') && url.pathname.endsWith('.png')
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== TILE_CACHE_NAME)
          .map((key) => caches.delete(key)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  if (isHistoricalMapTileRequest(url)) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request)
        if (cached) return cached

        const response = await fetch(request)
        if (response.ok) {
          cache.put(request, response.clone())
        }
        return response
      }),
    )
    return
  }

  // Network-first: always fetch fresh HTML, JS, and JSON data. Fall back to
  // cache only when offline (precached icons/manifest, or a prior visit).
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((cached) => cached ?? caches.match(BASE_URL))),
  )
})
