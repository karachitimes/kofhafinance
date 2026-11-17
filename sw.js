// KoFHA ERP service worker.
// Raise VERSION whenever a file is added to or removed from SHELL, or a CDN library version changes.
// Own files (page, css, js, icons) are always read from the network first (revalidated), so an upload reaches users
// on their next open; the cached copy is used only offline. Supabase (data, sign-in) is never touched here:
// the page keeps its own offline copies of report answers (js/core.js, OFF).
const VERSION = "kofha-2026-11-17-4";
const SHELL = [
  "./KoFHA_Dashboard.html", "./manifest.webmanifest", "./css/app.css",
  "./js/core.js", "./js/overview.js", "./js/modules.js", "./js/designer.js", "./js/reports.js",
  "./js/salary-billing.js", "./js/ask.js", "./js/appearance.js", "./js/pwa.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/apple-touch-icon.png"
];
const CDN = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js",
  "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
];
const CDN_HOSTS = ["cdn.jsdelivr.net", "cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", event => {
  // own files must cache; a CDN that is slow or blocked must not stop the install
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).then(() => Promise.all(CDN.map(u => c.add(u).catch(() => null))))));
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

  // own files: network first (revalidated), the cached copy only when offline
  if (url.origin === location.origin) {
    event.respondWith(
      fetch(req, { cache: "no-cache" }).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === "navigate" ? caches.match("./KoFHA_Dashboard.html") : undefined)))
    );
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
