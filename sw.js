// KoFHA ERP service worker.
// Raise VERSION whenever this file, the icons or the CDN library versions change.
// The dashboard page itself is always fetched from the network first, so a new KoFHA_Dashboard.html
// reaches users on their next open even without changing VERSION.
// Supabase (data, sign-in) is never cached: requests to other hosts pass straight through.
const VERSION = "kofha-2026-11-16-1";
const SHELL = [
  "./KoFHA_Dashboard.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png",
  "./icons/apple-touch-icon.png"
];
const CDN = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
];
const CDN_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", event => {
  // own files must cache; a CDN that is slow or blocked must not stop the install
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => Promise.all(CDN.map(u => c.add(u).catch(() => null))))));
  // no skipWaiting here: the page asks the user ("New version: Reload") and then sends SKIP_WAITING
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // the page: network first (latest version), the cached copy only when offline
  if (req.mode === "navigate" || (url.origin === location.origin && url.pathname.endsWith(".html"))) {
    event.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match("./KoFHA_Dashboard.html")))
    );
    return;
  }
  // own files (icons, manifest): cache, refreshed in the background
  if (url.origin === location.origin) {
    event.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // libraries and fonts (fixed versions): cache first
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
  // everything else (Supabase data and sign-in): not touched, never cached
});
