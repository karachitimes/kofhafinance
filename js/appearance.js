/* ---------- appearance (saved in this browser) ---------- */
const UI = Object.assign({ theme:"auto", accent:"harbour", density:"comfy", motion:"on", collapsed:false },
  (() => { try { return JSON.parse(localStorage.getItem("kofha.ui") || "{}"); } catch(e){ return {}; } })());
function applyUI(rerender){
  const r = document.documentElement;
  r.dataset.theme = UI.theme; r.dataset.accent = UI.accent; r.dataset.density = UI.density;
  r.classList.toggle("still", UI.motion === "off"); r.classList.toggle("collapsed", !!UI.collapsed);
  [["optTheme", UI.theme], ["optDensity", UI.density], ["optMotion", UI.motion]].forEach(([id, v]) =>
    document.querySelectorAll("#" + id + " button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === v))));
  document.querySelectorAll("#optAccent .swatch").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === UI.accent)));
  try { localStorage.setItem("kofha.ui", JSON.stringify(UI)); } catch(e){}
  if (rerender) setTimeout(renderAll, 0);
}
function isDark(){ return UI.theme === "dark" || (UI.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches); }
function openDrawer(on){ $("drawer").classList.toggle("hidden", !on); $("drawerBack").classList.toggle("hidden", !on); }
[["optTheme","theme"],["optDensity","density"],["optMotion","motion"],["optAccent","accent"]].forEach(([id, key]) =>
  $(id).addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; UI[key] = b.dataset.v; applyUI(true); }));
$("themeBtn").addEventListener("click", () => { UI.theme = isDark() ? "light" : "dark"; applyUI(true); });
// filter bar: hide / show (remembered on this computer)
(function () {
  const sec = document.querySelector("section.filters"), btn = $("filtersBtn");
  const set = (hide) => { sec.classList.toggle("collapsed", hide); btn.setAttribute("aria-pressed", hide ? "false" : "true");
    btn.title = hide ? "Show the filter bar" : "Hide the filter bar"; btn.querySelector("path").setAttribute("d", hide ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"); };
  let hide = false; try { hide = localStorage.getItem("kofha_filters_hidden") === "1"; } catch (_) {}
  set(hide);
  btn.addEventListener("click", () => { hide = !sec.classList.contains("collapsed"); set(hide); try { localStorage.setItem("kofha_filters_hidden", hide ? "1" : "0"); } catch (_) {} });
})();
$("settingsBtn").addEventListener("click", () => openDrawer(true));
$("settingsBtn2").addEventListener("click", () => openDrawer(true));
$("drawerClose").addEventListener("click", () => openDrawer(false));
$("drawerBack").addEventListener("click", () => openDrawer(false));
document.addEventListener("keydown", e => { if (e.key === "Escape") openDrawer(false); });
$("collapseBtn").addEventListener("click", () => { UI.collapsed = !UI.collapsed; applyUI(true); });
applyUI(false);

boot();
