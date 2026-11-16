// Installable app (PWA): service worker, Install button, "new version" prompt, offline notice.
(function () {
  const bar = document.getElementById("pwaBar"), msg = document.getElementById("pwaMsg"), go = document.getElementById("pwaGo"), ib = document.getElementById("installBtn");
  const show = (text, btn, fn) => { msg.textContent = text; go.classList.toggle("hidden", !btn); go.textContent = btn || ""; go.onclick = fn || null; bar.classList.remove("hidden"); };
  const hide = () => bar.classList.add("hidden");

  // Install button (Android / Windows / Mac Chrome and Edge); iPhone: Share > Add to Home Screen
  let deferred = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; if (ib) ib.classList.remove("hidden"); });
  if (ib) ib.addEventListener("click", async () => { if (!deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (_) {} deferred = null; ib.classList.add("hidden"); });
  window.addEventListener("appinstalled", () => { if (ib) ib.classList.add("hidden"); });

  // offline / online
  window.addEventListener("offline", () => show("You are offline: figures cannot be refreshed until the connection is back.", "", null));
  window.addEventListener("online", hide);

  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) return; reloading = true; location.reload(); });
  navigator.serviceWorker.register("sw.js").then(reg => {
    const offer = w => show("A new version of KoFHA ERP is ready.", "Reload", () => w.postMessage("SKIP_WAITING"));
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const w = reg.installing; if (!w) return;
      w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
    });
    // look for a new version when the app comes back to the screen, and every 30 minutes
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => { /* the dashboard works without the service worker */ });
})();
