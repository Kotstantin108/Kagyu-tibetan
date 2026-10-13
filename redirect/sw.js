// Replacement service worker for the old GitHub Pages address.
// Same file name as the app's sw.js, so the browser installs it over the old
// worker; it then removes every cache and unregisters itself, so the old
// address stops serving the cached app and the redirect page is the only thing left.

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .catch(() => {}),
  );
});
