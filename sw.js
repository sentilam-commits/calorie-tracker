// Service worker: makes the app launch instantly and work offline.
// Bump CACHE when the app shell or the pinned Supabase version changes.
const CACHE = "ct-cache-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;                       // never touch sync writes
  const url = new URL(req.url);
  if (url.hostname.endsWith("supabase.co")) return;       // API/auth => always live network

  if (req.mode === "navigate") {
    // Network-first for the page so updates appear; fall back to cache offline.
    e.respondWith(fetch(req).catch(function () { return caches.match("./index.html"); }));
    return;
  }
  // Static assets (icons, manifest, Supabase library): cache-first.
  e.respondWith(caches.match(req).then(function (c) { return c || fetch(req); }));
});
