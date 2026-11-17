/* =================================================================
   SETTINGS — the finance office edits these two lines once
   ================================================================= */
const SUPABASE_URL = "https://eaaeihoroprhmrlfopgc.supabase.co";
const SUPABASE_KEY = "sb_publishable_dC8v5D3ODBrvGZwLzzhrCg_bN16Iv5q";   // Project Settings > API Keys > publishable (or legacy anon). Never the private server key.

/* ================================================================= */
const $ = (id) => document.getElementById(id);
const S = { meta:null, data:null, fy:null, preset:"fytd", month:null, from:null, to:null, groups:[], bank:"", recoup:"", unit:"M", tab:"overview",
            salMonth:null, bill:{ follow:true, bFrom:null, bTo:null, pFrom:null, pTo:null, cust:"", type:"" },
            txn:{ offset:0, limit:100, drill:null, total:0 } };
let sb = null; const charts = {};

function storedKey(){ try { return localStorage.getItem("kofha.sbkey") || ""; } catch(e){ return ""; } }
function apiKey(){ return SUPABASE_KEY.startsWith("PASTE") ? storedKey() : SUPABASE_KEY; }

/* ---------- formatting ---------- */
const nfR = new Intl.NumberFormat("en-PK",{maximumFractionDigits:0});
const nfM = new Intl.NumberFormat("en-PK",{minimumFractionDigits:2,maximumFractionDigits:2});
function money(v, opts={}){
  if (v === null || v === undefined || isNaN(v)) return "–";
  v = Number(v); const neg = v < 0; const a = Math.abs(v);
  let s = S.unit === "M" && !opts.full ? nfM.format(a/1e6) + " M" : nfR.format(a);
  if (opts.rs) s = "Rs " + s;
  return neg ? "(" + s + ")" : s;
}
function moneyWords(v){ // for the headline
  const a = Math.abs(Number(v)||0);
  if (a >= 1e9) return "Rs " + nfM.format(a/1e9) + " billion";
  if (a >= 1e6) return "Rs " + nfM.format(a/1e6) + " million";
  return "Rs " + nfR.format(a);
}
function pct(v, d=0){ return (v === null || v === undefined || !isFinite(v)) ? "–" : (Number(v)*100).toFixed(d) + "%"; }
function change(cur, prev){
  if (!prev) return null; return (cur - prev) / Math.abs(prev);
}
function fmtDate(d){ if(!d) return ""; const x = new Date(d + "T00:00:00"); return x.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}); }
function iso(d){ const z = new Date(d.getTime() - d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); }
function esc(s){ return String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function css(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
// Busy overlay: counts open requests, so the overlay stays until the last one finishes (two loads at once used to hide it early).
const BUSY = machine("busy", { initial:"idle", states:{ idle:{ on:{ START:"busy" } }, busy:{ on:{ START:"busy", DONE:"idle" } } } });
let busyN = 0;
function loading(on, text){
  if (on) { busyN++; $("loadingText").textContent = text || "Loading figures"; BUSY.send("START"); }
  else if (busyN > 0 && --busyN === 0) BUSY.send("DONE");
  $("loading").classList.toggle("hidden", busyN === 0);
}
function loadingReset(){ busyN = 0; if (BUSY.state !== "idle") BUSY.send("DONE"); $("loading").classList.add("hidden"); }

// Which screen is shown: setup (no key) / public summary / sign-in / the dashboard. One screen at a time.
const SCREEN = machine("screen", { initial:"boot", states:{
  boot:   { on:{ NEED_KEY:"setup", PUBLIC:"public", SIGNED_IN:"app", SIGN_IN:"gate" } },
  setup:  { on:{ KEY_SAVED:"boot" } },
  public: { on:{ PUBLIC:"public", SIGN_IN:"gate" } },
  gate:   { on:{ PUBLIC:"public", SIGN_IN:"gate", SIGNED_IN:"app" } },
  app:    { on:{ SIGN_IN:"gate", SIGNED_IN:"app" } }
} });
SCREEN.subscribe(st => {
  ["setup","pub","gate","app"].forEach(id => $(id).classList.toggle("hidden", id !== ({ setup:"setup", public:"pub", gate:"gate", app:"app" })[st]));
  if (st !== "app") loadingReset();
});

/* ---------- start ---------- */
async function boot(){
  if (!apiKey()) { SCREEN.send("NEED_KEY"); return; }
  sb = supabase.createClient(SUPABASE_URL, apiKey(), { auth:{ persistSession:true, storageKey:"kofha-dashboard" } });
  const { data } = await sb.auth.getSession();
  if (data && data.session) { start(data.session); return; }
  // offline with an expired token: open with the session kept on this device; reports come from the offline copies
  if (!navigator.onLine) { try { const s = JSON.parse(localStorage.getItem("kofha-dashboard") || "null"); if (s && s.user) { start(s); return; } } catch(_) {} }
  showPublic();
}
function showGate(msg){ SCREEN.send("SIGN_IN"); $("loginErr").textContent = msg || ""; }

/* ---------- public summary (no sign-in): totals prepared every 15 minutes by Supabase ---------- */
async function showPublic(fy){
  SCREEN.send("PUBLIC");
  const body = $("pubBody");
  try {
    const { data, error } = await sb.rpc("rpt_public_summary", { p: fy ? { fy } : {} });
    if (error) throw new Error(error.message);
    if (data.error) { body.innerHTML = `<p class="note">${esc(data.error)}</p>`; return; }
    renderPublic(data);
  } catch(e) { body.innerHTML = `<p class="note">The summary could not be loaded: ${esc(e.message)}</p>`; }
}
function renderPublic(d){
  const sel = $("pubFy");
  sel.innerHTML = (d.years || [d.fy]).map(y => `<option value="${esc(y)}" ${y === d.fy ? "selected" : ""}>FY ${esc(y)}</option>`).join("");
  const R = (v) => (v === null || v === undefined || isNaN(v)) ? "–" : (Number(v) < 0 ? "(" + nfR.format(Math.abs(v)) + ")" : nfR.format(v));
  const RK = (v) => (v === null || v === undefined || isNaN(v)) ? "–" : moneyWords(v).replace(" million", " M").replace(" billion", " B") ;
  const k = (d.kpi || {}).cur || {}, kp = (d.kpi || {}).prv || {};
  const chg = (c, p, goodUp = true) => { if (!p || c === null || c === undefined) return `<div class="chg">&nbsp;</div>`;
    const r = (c - p) / Math.abs(p), up = r >= 0;
    return `<div class="chg ${up === goodUp ? "up" : "down"}">${up ? "▲" : "▼"} ${pct(Math.abs(r), 1)} on the same period last year</div>`; };
  const card = (lbl, cur, prev, goodUp = true) => `<div class="card pub-kpi"><div class="lbl">${esc(lbl)}</div><div class="val">${(Number(cur) < 0 ? "−" : "") + RK(cur)}</div>${chg(cur, prev, goodUp)}</div>`;
  const bt = d.billing_total || {}, dw = d.daily_wagers || {}, rc = d.recoup || {};
  const tbl = (head, rows, foot) => `<div class="tw"><table><thead><tr>${head.map(h => `<th class="${h[1] || ""}">${esc(h[0])}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>${foot ? `<tfoot>${foot}</tfoot>` : ""}</table></div>`;
  const sum = (a, f) => a.reduce((s, x) => s + (Number(x[f]) || 0), 0);
  const own = d.own_revenue || [], gu = d.grant_use || [], pr = d.payroll || [], ag = d.agpr || [], bl = d.billing || [], le = d.latest_exp || [];

  $("pubBody").innerHTML = `
    <div><h2>Financial summary - FY ${esc(d.fy)}</h2>
      <div class="note">${fmtDate(d.from)} to ${fmtDate(d.to)}, compared with ${fmtDate(d.prev_from)} to ${fmtDate(d.prev_to)}. Updated ${new Date(d.built_at).toLocaleString("en-GB")}.</div></div>
    <div class="pub-kpis">
      ${card("Total income", k.income, kp.income)}
      ${card("Total expenditure", k.expenditure, kp.expenditure, false)}
      ${card("Surplus / (deficit)", k.surplus, kp.surplus)}
      ${card("Grant received", k.grant, kp.grant)}
      ${card("Own-source revenue", k.own_revenue, kp.own_revenue)}
      ${card("Investment income", k.investment, kp.investment)}
      ${card("Daily wagers", dw.cur, dw.prev, false)}
      <div class="card pub-kpi"><div class="lbl">Billing recovered</div><div class="val">${pct(bt.pct, 1)}</div><div class="chg">${RK(bt.received)} of ${RK(bt.billed)} billed</div></div>
    </div>
    <div class="pub-grid">
      <div class="card"><h3>Revenue vs expenditure</h3><div class="chartbox"><canvas id="pubChartIE"></canvas></div></div>
      <div class="card"><h3>Billing vs received</h3><div class="chartbox"><canvas id="pubChartBill"></canvas></div></div>
    </div>
    <div class="pub-grid">
      <div class="card"><h3>Own-source revenue by head</h3>
        ${tbl([["Head"], ["This year", "n"], ["Last year", "n"]],
              own.map(r => `<tr><td>${esc(r.head)}</td><td class="n">${R(r.cur)}</td><td class="n">${R(r.prev)}</td></tr>`),
              `<tr class="tot"><td>Total</td><td class="n">${R(sum(own, "cur"))}</td><td class="n">${R(sum(own, "prev"))}</td></tr>`)}</div>
      <div class="card"><h3>Billing by head (bill + surcharge)</h3>
        ${tbl([["Head"], ["Bills", "n"], ["Surcharge", "n"], ["Received", "n"], ["%", "n"]],
              bl.map(r => `<tr><td>${esc(r.type)}</td><td class="n">${R(r.bill)}</td><td class="n">${R(r.surcharge)}</td><td class="n">${R(r.received)}</td><td class="n">${pct(r.pct, 1)}</td></tr>`),
              `<tr class="tot"><td>Total</td><td class="n">${R(sum(bl, "bill"))}</td><td class="n">${R(sum(bl, "surcharge"))}</td><td class="n">${R(bt.received)}</td><td class="n">${pct(bt.pct, 1)}</td></tr>`)}
        <p class="note">Bills and surcharge of billing_issued in the year; received = money into the bank on the same customer accounts.</p></div>
    </div>
    <div class="pub-grid">
      <div class="card"><h3>Grant released and used, by object code</h3>
        ${tbl([["Object code"], ["Grant", "n"], ["Spent", "n"], ["Used", "n"]],
              gu.map(r => `<tr><td>${esc(r.code)}${r.name ? `<div class="note">${esc(r.name)}</div>` : ""}</td><td class="n">${R(r.grant)}</td><td class="n">${R(r.spent)}</td><td class="n">${pct(r.pct, 0)}<div class="bar"><span style="width:${Math.min(100, (Number(r.pct) || 0) * 100)}%"></span></div></td></tr>`),
              `<tr class="tot"><td>Total</td><td class="n">${R(sum(gu, "grant"))}</td><td class="n">${R(sum(gu, "spent"))}</td><td class="n">${pct(sum(gu, "grant") ? sum(gu, "spent") / sum(gu, "grant") : null, 0)}</td></tr>`)}</div>
      <div class="card"><h3>Payroll (employee related) by object code</h3>
        ${tbl([["Object code"], ["This year", "n"], ["Last year", "n"]],
              pr.map(r => `<tr><td>${esc(r.code)}${r.name ? `<div class="note">${esc(r.name)}</div>` : ""}</td><td class="n">${R(r.cur)}</td><td class="n">${R(r.prev)}</td></tr>`),
              `<tr class="tot"><td>Total</td><td class="n">${R(sum(pr, "cur"))}</td><td class="n">${R(sum(pr, "prev"))}</td></tr>`)}
        <p class="note">Daily wagers: ${R(dw.cur)} this year${dw.latest ? ` · ${esc(dw.latest.month)}: ${esc(dw.latest.people)} daily wagers, gross ${R(dw.latest.gross)}, net ${R(dw.latest.net)}` : ""}.</p></div>
    </div>
    <div class="pub-grid">
      <div class="card"><h3>AGPR - spent from the Assignment account</h3>
        ${tbl([["Object code"], ["Spent", "n"], ["Entries", "n"]],
              ag.map(r => `<tr><td>${esc(r.code)}${r.name ? `<div class="note">${esc(r.name)}</div>` : ""}</td><td class="n">${R(r.amount)}</td><td class="n">${esc(r.entries)}</td></tr>`),
              `<tr class="tot"><td>Total spent</td><td class="n">${R(d.agpr_total)}</td><td></td></tr><tr><td>Grant received in the account</td><td class="n">${R(d.agpr_grant)}</td><td></td></tr>`)}</div>
      <div class="card"><h3>Recoup and assignment</h3>
        ${tbl([["", ""], ["Amount", "n"]], [
          `<tr><td>Spent from the Assignment account</td><td class="n">${R(rc.assignment_spent)}</td></tr>`,
          `<tr><td>Spent from the Revenue account</td><td class="n">${R(rc.revenue_spent)}</td></tr>`,
          `<tr><td>Revenue account payments</td><td class="n">${R(rc.payments)}</td></tr>`,
          `<tr><td>&nbsp;&nbsp;Recouped</td><td class="n">${R(rc.recouped)}</td></tr>`,
          `<tr><td>&nbsp;&nbsp;Recoup pending</td><td class="n">${R(rc.pending)}</td></tr>`,
          `<tr><td>&nbsp;&nbsp;Non recoupable</td><td class="n">${R(rc.non_recoupable)}</td></tr>`,
          `<tr><td>&nbsp;&nbsp;Not tagged</td><td class="n">${R(rc.untagged)}</td></tr>`])}</div>
    </div>
    <div class="card"><h3>Latest 10 expenditure entries</h3>
      ${tbl([["Date"], ["Head"], ["Paid to"], ["From"], ["Amount", "n"]],
            le.map(r => `<tr><td>${fmtDate(r.date)}</td><td>${esc(r.head)}${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}</td><td>${esc(r.paid_to || "")}</td><td>${esc(r.from || "")}</td><td class="n">${R(r.amount)}</td></tr>`))}</div>
    <p class="note">Amounts in tables are in Rupees. Totals only, from the KoFHA general ledger. Sign in for the full reports.</p>`;

  const mo = d.monthly || [], bm = d.billing_monthly || [];
  drawChart("pubChartIE", { type:"bar", data:{ labels: mo.map(x => x.month), datasets:[
      { label:"Income", data: mo.map(x => x.income), backgroundColor: css("--income"), borderRadius:6 },
      { label:"Expenditure", data: mo.map(x => x.expenditure), backgroundColor: css("--spend"), borderRadius:6 }] }, options: baseOpts({ money:true }) });
  drawChart("pubChartBill", { type:"bar", data:{ labels: bm.map(x => x.month), datasets:[
      { label:"Billed", data: bm.map(x => x.billed), backgroundColor: css("--bal"), borderRadius:6 },
      { label:"Received", data: bm.map(x => x.received), backgroundColor: css("--good"), borderRadius:6 }] }, options: baseOpts({ money:true }) });
}
$("pubFy").addEventListener("change", (e) => showPublic(e.target.value));
$("pubSignIn").addEventListener("click", () => showGate());
$("loginBack").addEventListener("click", () => showPublic($("pubFy").value || undefined));

$("setupForm").addEventListener("submit", (e) => {
  e.preventDefault(); const k = $("setupKey").value.trim();
  try { localStorage.setItem("kofha.sbkey", k); } catch(err) {}
  SCREEN.send("KEY_SAVED"); boot();
});
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); $("loginBtn").disabled = true; $("loginErr").textContent = "";
  const { data, error } = await sb.auth.signInWithPassword({ email:$("email").value.trim(), password:$("password").value });
  $("loginBtn").disabled = false;
  if (error) { $("loginErr").textContent = error.message === "Invalid login credentials" ? "Email or password is not correct." : error.message; return; }
  start(data.session);
});
$("signOutBtn").addEventListener("click", async () => { await OFF.clear(); await sb.auth.signOut(); location.reload(); });
$("printBtn").addEventListener("click", () => window.print());

// Offline copies of report answers (this device only, cleared at sign out). Calls that change data are never kept or replayed.
const OFF = {
  db: null, asOf: null,
  write: n => /^(request_|bank_match_(confirm|reject)|top_filters_|sb_push|save_|set_|grant_|delete_|update_|insert_|upsert_|ask_)/i.test(n),
  open(){ if (this.db) return this.db; this.db = new Promise((ok, no) => { try { const r = indexedDB.open("kofha-offline", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("rpc"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch(e) { no(e); } }); return this.db; },
  async put(k, v){ try { const db = await this.open(); db.transaction("rpc", "readwrite").objectStore("rpc").put({ t: Date.now(), v }, k); } catch(_) {} },
  async get(k){ try { const db = await this.open(); return await new Promise(ok => { const q = db.transaction("rpc").objectStore("rpc").get(k); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch(_) { return null; } },
  async clear(){ try { const db = await this.open(); db.transaction("rpc", "readwrite").objectStore("rpc").clear(); } catch(_) {} },
  isNet: m => !navigator.onLine || /Failed to fetch|NetworkError|Load failed|network/i.test(String(m || ""))
};
// Bottom notice bar. A "new version" offer is never pushed aside by an offline / online message.
const NOTICE = machine("notice", { initial:"hidden", states:{
  hidden:       { on:{ OFFLINE:"offline", CACHED:"offline_copy", UPDATE:"update" } },
  offline:      { on:{ ONLINE:"hidden", CACHED:"offline_copy", UPDATE:"update", OFFLINE:"offline" } },
  offline_copy: { on:{ ONLINE:"hidden", CACHED:"offline_copy", UPDATE:"update", OFFLINE:"offline_copy" } },
  update:       { on:{ UPDATE:"update" } }
} });
NOTICE.subscribe((st, prev, ev, d) => {
  const bar = document.getElementById("pwaBar"), msg = document.getElementById("pwaMsg"), go = document.getElementById("pwaGo");
  if (!bar) return;
  const show = (text, btn, fn) => { msg.textContent = text; go.classList.toggle("hidden", !btn); go.textContent = btn || ""; go.onclick = fn || null; bar.classList.remove("hidden"); };
  if (st === "hidden") bar.classList.add("hidden");
  else if (st === "offline") show("You are offline: figures cannot be refreshed until the connection is back.");
  else if (st === "offline_copy") show("Offline: figures as of " + new Date(OFF.asOf).toLocaleString() + ". They refresh when the internet is back.");
  else if (st === "update") show("A new version of KoFHA ERP is ready.", "Reload", () => d && d.postMessage("SKIP_WAITING"));
});
function offlineNote(t){ OFF.asOf = t; NOTICE.send("CACHED"); }
async function rpc(name, args){
  const key = name + "|" + JSON.stringify(args || {});
  let res;
  try { res = await sb.rpc(name, args || {}); } catch(e) { res = { data: null, error: e }; }
  const { data, error } = res;
  if (error && OFF.isNet(error.message)) {
    if (OFF.write(name)) throw new Error("You are offline: this needs the internet.");
    const hit = await OFF.get(key);
    if (hit) { offlineNote(hit.t); return hit.v; }
    throw new Error("You are offline and this was not opened before on this device.");
  }
  if (!error && !OFF.write(name)) OFF.put(key, data);
  if (error) {
    if (/NOT_ALLOWED: this login can open the billing pages only/.test(error.message)) throw new Error("This login can open the billing pages only.");
    if (/NOT_ALLOWED/.test(error.message)) throw new Error("This login has no report access. Ask the finance office to give it access: select kofha.grant_access('email');");
    if (/JWT|expired|401/i.test(error.message)) { showGate("Your session ended. Sign in again."); throw new Error("signed out"); }
    throw new Error(error.message);
  }
  return data;
}

// System check: a chip at the top while anything needs attention (checked at sign-in and every 10 minutes)
async function checkHealth(){
  try {
    const h = await rpc("rpt_health_summary");
    const c = $("healthChip"); const np = h.problems || 0, nw = h.warnings || 0;
    if (!np && !nw) { c.classList.add("hidden"); return; }
    c.classList.remove("hidden"); c.classList.toggle("bad", np > 0);
    c.textContent = "System check: " + [np ? np + " problem" + (np > 1 ? "s" : "") : "", nw ? nw + " warning" + (nw > 1 ? "s" : "") : ""].filter(Boolean).join(", ");
    c.title = (h.items || []).join("\n") + "\n\nClick to open the System check.";
  } catch(e) { /* the check itself must never stop the dashboard */ }
}
setInterval(() => { if (S.meta && !S.billingOnly) checkHealth(); }, 600000);
async function openHealthReport(){
  showTab("reports");
  for (let i = 0; i < 40; i++) { if (RL.list && RL.list.find(x => x.id === "system_health")) { openReport("system_health"); return; } await new Promise(r => setTimeout(r, 250)); }
}
async function start(session){
  SCREEN.send("SIGNED_IN");
  $("userEmail").textContent = session.user.email;
  $("avatar").textContent = (session.user.email || "K").charAt(0).toUpperCase();
  loading(true, "Loading lists");
  try { S.meta = await rpc("rpt_meta"); }
  catch(e){ loading(false); showGate(e.message); return; }
  loading(false);
  const m = S.meta;
  S.billingOnly = m.scope === "billing";
  if (S.billingOnly) {
    // billing-only login: just the Billing page and the billing reports of the Report library
    // extra pages given to this login: Ask KoFHA (can_ask); extra reports (e.g. daily wagers) appear in the Report library
    const allowed = ["billing","reports"].concat(m.can_ask ? ["ask"] : []);
    document.querySelectorAll("nav.tabs button[data-t]").forEach(b => b.classList.toggle("hidden", !allowed.includes(b.dataset.t)));
    // a heading stays when any page under it is shown
    document.querySelectorAll("nav.tabs .navh").forEach(h => { let el = h.nextElementSibling, any = false;
      while (el && !el.classList.contains("navh")) { if (el.matches("button[data-t]") && !el.classList.contains("hidden")) any = true; el = el.nextElementSibling; }
      h.classList.toggle("hidden", !any); });
    ["fgChips","bankSel","recoupSeg","healthChip","bmBtn","bmSt"].forEach(id => { const el = $(id); if (el) el.classList.add("hidden"); });
    if (m.org) $("orgName").textContent = m.org;
    if (m.updated_at) $("updatedAt").textContent = "Figures as sent from Excel on " + new Date(m.updated_at).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
    const fys = m.fiscal_years || [];
    $("fySel").innerHTML = fys.map(f => `<option value="${esc(f.code)}">${esc(f.name || f.code)}</option>`).join("");
    const today = iso(new Date());
    const cur = fys.find(f => f.current) || fys.find(f => today >= f.start && today <= f.end) || fys[fys.length-1];
    S.fy = cur ? cur.code : null; $("fySel").value = S.fy;
    S.extra = {};
    setPreset("fytd", true);
    showTab("billing");
    return;
  }
  checkHealth(); bmPoll();
  if (m.org) $("orgName").textContent = m.org;
  if (m.updated_at) $("updatedAt").textContent = "Figures as sent from Excel on " + new Date(m.updated_at).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  // financial years
  const fys = m.fiscal_years || [];
  $("fySel").innerHTML = fys.map(f => `<option value="${esc(f.code)}">${esc(f.name || f.code)}</option>`).join("");
  const today = iso(new Date());
  const cur = fys.find(f => f.current) || fys.find(f => today >= f.start && today <= f.end) || fys[fys.length-1];
  S.fy = cur ? cur.code : null; $("fySel").value = S.fy;
  // function groups
  $("fgChips").innerHTML = `<button type="button" class="chip" data-g="" aria-pressed="true">All</button>` +
    (m.func_groups || []).sort().map(g => `<button type="button" class="chip" data-g="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join("");
  // transaction filters
  $("tBank").innerHTML = `<option value="">Any bank</option>` + (m.banks || []).sort().map(b => `<option>${esc(b)}</option>`).join("");
  $("bankSel").innerHTML = `<option value="">All bank accounts</option>` + (m.banks || []).sort().map(b => `<option>${esc(b)}</option>`).join("");
  $("tSection").innerHTML = `<option value="">Any section</option>` + (m.sections || []).map(s => `<option>${esc(s)}</option>`).join("");
  $("accountList").innerHTML = (m.accounts || []).map(a => `<option value="${esc(a)}">`).join("");
  try {
    const x = await rpc("rpt_meta_extra"); S.extra = x;
    const tags = (x && x.recoup_tags) || [];
    if (tags.length) $("recoupSeg").innerHTML = `<button type="button" data-r="" aria-pressed="true">All</button>` +
      tags.map(t => `<button type="button" data-r="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join("");
  } catch(e){ S.extra = {}; }
  fb("txnFb", () => (S.extra && S.extra.cashbook_columns) || [], () => { S.txn.offset = 0; loadTxn(); });
  setPreset("fytd", true);
  load();
}
