// Service worker: the whole app (shell, data, font) works offline.
//
// Strategy: network first for app files and data (so an online user always
// gets the latest deploy, an offline user gets the cached copy), cache first
// for the font. The cache name carries the deploy version, which the
// workflow writes into config.js; a new version replaces the old cache.

importScripts('./config.js');

const VERSION = (self.TIB_CONFIG && self.TIB_CONFIG.VERSION) || 'dev';
const CACHE = `tib-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './config.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './fonts/NotoSerifTibetan-Regular.woff2',
  './data/words.json',
  './data/sentences.json',
  './data/sets.json',
  './src/app.js',
  './src/store.js',
  './src/ui.js',
  './src/sync.js',
  './src/report.js',
  './src/transfer.js',
  './src/engine/config.js',
  './src/engine/progress.js',
  './src/engine/next.js',
  './src/engine/check.js',
  './src/engine/streak.js',
  './src/engine/merge.js',
  './src/engine/tib.js',
  './src/engine/wylie.js',
  './src/engine/hard.js',
  './src/i18n/index.js',
  './src/i18n/en.js',
  './src/i18n/ru.js',
  './src/i18n/de.js',
  './src/i18n/fr.js',
  './src/i18n/pl.js',
  './src/screens/play.js',
  './src/screens/onboarding.js',
  './src/screens/dict.js',
  './src/screens/grammar.js',
  './src/screens/stats.js',
  './src/screens/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.allSettled(SHELL.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('tib-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Google APIs, GSI script: straight to the network

  if (url.pathname.endsWith('.woff2')) {
    event.respondWith(caches.match(req).then((hit) => hit || fetchAndStore(req)));
    return;
  }

  event.respondWith(
    fetchAndStore(req).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    })),
  );
});

function fetchAndStore(req) {
  return fetch(req).then((res) => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
    }
    return res;
  });
}
