// Offline cache for the app shell and reference data (NFR-03). Bump VERSION on each release.
const VERSION = 'agentfit-v1.0.1';
const SHELL = [
  './', './index.html', './css/app.css', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './js/main.js', './js/store.js', './js/api.js', './js/drive.js', './js/config.js', './js/router.js',
  './js/lib/dom.js', './js/lib/idb.js',
  './js/core/dates.js', './js/core/plans.js', './js/core/validate.js', './js/core/equipment.js', './js/core/nutrition.js', './js/core/norms.js', './js/core/diff.js', './js/core/merge.js',
  './js/screens/common.js', './js/screens/journey.js', './js/screens/today.js', './js/screens/progress.js', './js/screens/coach.js', './js/screens/settings.js', './js/screens/plans.js', './js/screens/misc.js',
  './data/exercises.json', './data/foods.json', './data/norms.json', './data/goals.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API, Google and AI calls always go to the network.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
