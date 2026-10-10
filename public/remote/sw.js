// MESHplay Remote service worker — caches the controller app so it installs
// and runs fully offline (open once while paired, then it never needs the net).
const CACHE = 'meshplay-remote-v1'
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/pwa-192.png',
  './icons/pwa-512.png',
  './icons/maskable-512.png',
]

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // WebSocket + the pairing token live in the query string; never cache those
  if (url.pathname.startsWith('/ws') || e.request.method !== 'GET') return
  e.respondWith(
    caches.match(e.request).then(
      (hit) =>
        hit ||
        fetch(e.request)
          .then((res) => {
            if (res.ok && url.origin === location.origin) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(e.request, copy))
            }
            return res
          })
          .catch(() => caches.match('./index.html')),
    ),
  )
})
