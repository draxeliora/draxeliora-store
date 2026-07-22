// Draxeliora Store — Service Worker
// Bump this version string any time you deploy changed static files,
// so old caches are cleared and users get the latest version.
const CACHE_VERSION = "draxeliora-v1";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json"
];

// Install: pre-cache the app shell.
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        // Don't fail install if one asset (e.g. an icon not yet uploaded) is missing.
        console.warn("Service worker: some assets failed to pre-cache", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches from previous versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_VERSION)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - Never cache Firestore/Firebase Auth requests — always go to network,
//   so product data and login state are always fresh.
// - For same-origin static assets, use cache-first with a network fallback,
//   so the store still opens (app shell) when offline.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  const isFirebase =
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("google.com");

  if (isFirebase || event.request.method !== "GET") {
    return; // let the browser handle it normally
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Cache a copy of successful same-origin responses for offline use.
          if (response && response.status === 200 && url.origin === self.location.origin) {
            const responseClone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => {
          // Offline and not cached — fall back to the app shell for navigations.
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
    })
  );
});
