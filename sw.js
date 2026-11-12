/* GymTrack v2 service worker
 * - Pre-caches every app file on install, so the app opens with zero signal.
 * - Serves from cache first, then refreshes the cache in the background
 *   (stale-while-revalidate), so updates arrive on the next launch without
 *   bumping version numbers by hand (the v1 problem).
 * Bump VERSION only if you rename or remove files. */
const VERSION = 'gymtrack-v2-10';
const FILES = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/ui.js', './js/store.js', './js/timer.js', './js/app.js',
  './js/screens/today.js', './js/screens/log.js', './js/screens/snapshot.js', './js/screens/activity.js',
  './js/screens/plan.js', './js/screens/progress.js', './js/screens/settings.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-192.png', './icons/maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const network = fetch(e.request).then((res) => { if (res && res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => null);
    return cached || (await network) || cache.match('./index.html');
  }));
});
