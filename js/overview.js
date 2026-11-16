/* ---------- period ---------- */
function fyObj(){ return (S.meta.fiscal_years || []).find(f => f.code === S.fy); }
function fillMonths(){
  const f = fyObj(); if (!f) return;
  const out = []; let d = new Date(f.start + "T00:00:00");
  for (let i = 0; i < 12; i++){ out.push(new Date(d.getFullYear(), d.getMonth() + i, 1)); }
  $("monthSel").innerHTML = out.map(x => `<option value="${iso(x)}">${x.toLocaleDateString("en-GB",{month:"long",year:"numeric"})}</option>`).join("");
  if (!S.month || !out.some(x => iso(x) === S.month)) {
    const last = S.meta.last_date || iso(new Date());
    const pick = out.filter(x => iso(x) <= last).pop() || out[0];
    S.month = iso(pick);
  }
  $("monthSel").value = S.month;
}
function computePeriod(){
  const f = fyObj(); if (!f) return;
  const start = new Date(f.start + "T00:00:00");
  const q = (n) => [iso(new Date(start.getFullYear(), start.getMonth() + 3*(n-1), 1)), iso(new Date(start.getFullYear(), start.getMonth() + 3*n, 0))];
  const today = iso(new Date());
  switch (S.preset){
    case "full": S.from = f.start; S.to = f.end; break;
    case "q1": [S.from, S.to] = q(1); break;
    case "q2": [S.from, S.to] = q(2); break;
    case "q3": [S.from, S.to] = q(3); break;
    case "q4": [S.from, S.to] = q(4); break;
    case "month": { const m = new Date(S.month + "T00:00:00"); S.from = S.month; S.to = iso(new Date(m.getFullYear(), m.getMonth()+1, 0)); break; }
    case "custom": S.from = $("fromDate").value || f.start; S.to = $("toDate").value || f.end; break;
    default: S.from = f.start; S.to = today < f.end ? (today > f.start ? today : f.end) : f.end;
  }
  if (S.to < S.from) { const t = S.from; S.from = S.to; S.to = t; }
  $("fromDate").value = S.from; $("toDate").value = S.to;
}
function setPreset(p, silent){
  S.preset = p;
  document.querySelectorAll("#presetSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === p)));
  $("monthWrap").classList.toggle("hidden", p !== "month");
  $("customWrap").classList.toggle("hidden", p !== "custom");
  if (p === "month") fillMonths();
  computePeriod();
  if (!silent) load();
}
$("presetSeg").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setPreset(b.dataset.p); });
$("fySel").addEventListener("change", () => { S.fy = $("fySel").value; S.month = null; $("fcAsOf").value = ""; setPreset(S.preset === "custom" ? "fytd" : S.preset); });
$("monthSel").addEventListener("change", () => { S.month = $("monthSel").value; computePeriod(); load(); });
["fromDate","toDate"].forEach(id => $(id).addEventListener("change", () => { if (S.preset === "custom") { computePeriod(); load(); } }));
$("fgChips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  const g = b.dataset.g;
  if (!g) S.groups = []; else S.groups = S.groups.includes(g) ? S.groups.filter(x => x !== g) : [...S.groups, g];
  document.querySelectorAll("#fgChips .chip").forEach(c => c.setAttribute("aria-pressed", String(c.dataset.g ? S.groups.includes(c.dataset.g) : S.groups.length === 0)));
  load();
});
$("bankSel").addEventListener("change", () => { S.bank = $("bankSel").value; load(); });
$("recoupSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return; S.recoup = b.dataset.r;
  document.querySelectorAll("#recoupSeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  load();
});
$("unitSeg").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return; S.unit = b.dataset.u;
  document.querySelectorAll("#unitSeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
  renderAll();
});
document.querySelector("nav.tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) showTab(b.dataset.t); });
const TITLES = { maker:"Report maker", reports:"Report library", forecast:"Forecast", analysis:"Analysis builder", budgetm:"Releases and commitments", payroll:"Payroll", salary:"Salary history", payables:"Invoices and advances", explorer:"Data explorer", columns:"Columns", lines:"Report lines", designer:"Report designer", ask:"Ask KoFHA", overview:"Overview", ie:"Income and expenditure", budget:"Budget against actual", position:"Financial position", utility:"Utilities and tenants", billing:"Billing and collections", txn:"Transactions" };
function showTab(t){
  S.tab = t; $("pageTitle").textContent = TITLES[t] || "";
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.t === t)));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === "p-" + t));
  if (t === "txn") loadTxn(); else if (MODULES[t]) loadModule(t); else renderAll();
}

/* ---------- data ---------- */
let reqNo = 0;
async function load(){
  if (S.billingOnly) {
    if (MODULES[S.tab]) loadModule(S.tab);
    if (S.tab === "reports" && RL.current) runReport();
    return;
  }
  const my = ++reqNo; loading(true);
  try {
    const d = await rpc("rpt_dashboard", { p_from:S.from, p_to:S.to, p_fy:S.fy, p_func_groups: S.groups.length ? S.groups : null,
      p_banks: S.bank ? [S.bank] : null, p_recoup: S.recoup || null });
    if (my !== reqNo) return;
    S.data = d; renderAll();
    if (S.tab === "txn") { S.txn.offset = 0; loadTxn(); }
    if (MODULES[S.tab]) loadModule(S.tab);
    if (S.tab === "analysis" && anLast && anLast.v.period) runAnalysis();
    if (S.tab === "reports" && RL.current) runReport();
    if (S.tab === "maker" && RM.last && RM.last.spec) { const sp = RM.last.spec;
      if (sp.type === "format") rmRunFormat(sp.id, sp.period, sp.from, sp.to); else rmRun(sp); }
  } catch(e){ if (e.message !== "signed out") alert("Could not load the figures.\n\n" + e.message); }
  finally { if (my === reqNo) loading(false); }
}

/* ---------- render ---------- */
function renderAll(){
  if (!S.data) return;
  renderHeadline();
  const t = S.tab;
  if (t === "overview") renderOverview();
  if (t === "ie") renderIE();
  if (t === "budget") renderBudget();
  if (t === "position") renderPosition();
  if (t === "utility") renderUtility();
  if (t === "txn") renderTxn();
  if (MODULES[t] && M[t]) MODULES[t].render(M[t]);
}

function renderHeadline(){
  const k = S.data.kpi, p = S.data.period, py = S.data.kpi_py || {};
  const fy = (S.meta.fiscal_years || []).find(f => f.code === p.fy) || fyObj();
  const flt = [...S.groups, S.bank, S.recoup, S.status && ("status " + S.status), S.voucher && ("voucher " + S.voucher), S.tagText && ("tag " + S.tagText)].filter(Boolean);
  const groups = flt.length ? " (" + flt.join(", ") + " only)" : "";
  const res = k.surplus >= 0 ? `a surplus of ${moneyWords(k.surplus)}` : `a deficit of ${moneyWords(k.surplus)}`;
  $("headline").textContent = `Income of ${moneyWords(k.income)} against spending of ${moneyWords(k.expenditure)}, ${res}.`;
  const ch = change(k.income, py.income);
  const cmp = ch === null ? "" : ` Income is ${ch >= 0 ? "up" : "down"} ${pct(Math.abs(ch))} on the same period last year.`;
  $("subline").textContent = `${fy ? fy.name : ""}, ${fmtDate(p.from)} to ${fmtDate(p.to)}${groups}.${cmp}`;
  $("periodText").textContent = `${fy ? fy.name : ""}  ${fmtDate(p.from)} to ${fmtDate(p.to)}`;
}

const ICON = {"coins": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><ellipse cx=\"9\" cy=\"7\" rx=\"6\" ry=\"3\"/><path d=\"M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7\"/><path d=\"M15 11.5c3.4.2 6 1.5 6 3v0c0 1.7-2.7 3-6 3-1.6 0-3-.3-4.1-.8\"/></svg>", "wallet": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"6\" width=\"18\" height=\"14\" rx=\"3\"/><path d=\"M3 10h18\"/><circle cx=\"16.5\" cy=\"15\" r=\"1.2\"/></svg>", "up": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M7 17L17 7\"/><path d=\"M8 7h9v9\"/></svg>", "scale": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3v18M5 21h14\"/><path d=\"M6 7h12\"/><path d=\"M6 7l-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z\"/></svg>", "bank": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M3 10l9-6 9 6\"/><path d=\"M5 10v8M9.5 10v8M14.5 10v8M19 10v8\"/><path d=\"M3 20h18\"/></svg>", "shield": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z\"/></svg>", "drop": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z\"/></svg>", "bolt": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M13 2L4 14h7l-1 8 9-12h-7z\"/></svg>", "wave": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M2 14c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2\"/><path d=\"M2 19c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2\"/><path d=\"M12 3v7M9 6l3-3 3 3\"/></svg>", "target": "<svg class=\"i\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"8\"/><circle cx=\"12\" cy=\"12\" r=\"4\"/><circle cx=\"12\" cy=\"12\" r=\"0.5\"/></svg>"};
function spark(series, cls){
  const v = (series || []).map(Number).filter(x => isFinite(x)); if (v.length < 2) return "";
  const mn = Math.min(...v), mx = Math.max(...v), rg = (mx - mn) || 1, w = 96, h = 34;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * w).toFixed(1)},${(h - 3 - (x - mn) / rg * (h - 6)).toFixed(1)}`).join(" ");
  const col = cls === "spend" ? "var(--spend)" : cls === "bal" ? "var(--bal)" : "var(--income)";
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function figure(cls, label, value, cmpHtml, icon, series, kind){
  const shown = kind === "count" ? nfR.format(Number(value) || 0) : money(value);
  return `<div class="fig ${cls}"><div class="top"><div class="ico">${ICON[icon || (cls === "spend" ? "wallet" : cls === "bal" ? "bank" : "coins")]}</div><div class="lbl">${esc(label)}</div></div>
    <div class="val${value < 0 ? " neg" : ""}" data-v="${Number(value) || 0}" data-kind="${kind || ""}">${shown}</div><div class="cmp">${cmpHtml || "&nbsp;"}</div>${spark(series, cls)}</div>`;
}
let countKey = "";
function countUp(scope){
  const key = S.from + S.to + S.fy + S.groups.join() + S.tab;
  if (document.documentElement.classList.contains("still") || window.matchMedia("(prefers-reduced-motion: reduce)").matches || key === countKey) return;
  countKey = key;
  const els = [...document.querySelectorAll(scope + " .val[data-v]")]; const t0 = performance.now(), dur = 700;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    els.forEach(el => { const v = Number(el.dataset.v) * e; el.textContent = el.dataset.kind === "count" ? nfR.format(Math.round(v)) : money(v); }); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function cmpLine(cur, prev, goodWhenUp=true){
  const c = change(cur, prev); if (c === null) return "No figure for last year";
  const good = goodWhenUp ? c >= 0 : c <= 0;
  return `<span class="delta ${good ? "up" : "down"}">${c >= 0 ? "▲" : "▼"} ${pct(Math.abs(c))}</span> vs last year ${money(prev)}`;
}

function renderOverview(){
  const k = S.data.kpi, b = S.data.balances, py = S.data.kpi_py || {};
  const ms = S.data.monthly || [];
  $("ovFigures").innerHTML =
    figure("income", "Total income", k.income, cmpLine(k.income, py.income), "coins", ms.map(x => x.income)) +
    figure("spend", "Total expenditure", k.expenditure, cmpLine(k.expenditure, py.expenditure, false), "wallet", ms.map(x => x.expenditure)) +
    figure(k.surplus >= 0 ? "income" : "spend", k.surplus >= 0 ? "Surplus" : "Deficit", k.surplus, cmpLine(k.surplus, py.surplus), "scale", ms.map(x => x.income - x.expenditure)) +
    figure("income", "Own-source revenue", k.own_source, cmpLine(k.own_source, py.own_source), "up", ms.map(x => x.own_source)) +
    (S.bank ? figure("bal", S.bank + " balance at " + fmtDate(S.data.period.to), S.data.selected_banks_balance, "all bank accounts " + money(b.cash_bank), "bank")
            : figure("bal", "Cash and bank at " + fmtDate(S.data.period.to), b.cash_bank, "of which utility fund " + money(b.utility_fund), "bank")) +
    figure("bal", "Liquid funds available", b.liquid_funds, b.months_covered ? `Covers ${Number(b.months_covered).toFixed(1)} months of spending` : "", "shield");
  countUp("#ovFigures");
  const margin = k.income ? k.surplus / k.income : 0, mClamped = Math.max(0, Math.min(1, Math.abs(margin)));
  $("gaugeVal").textContent = k.income ? pct(margin) : "–";
  $("gaugeVal").className = margin < 0 ? "neg" : "";
  $("gaugeLbl").textContent = margin < 0 ? "deficit margin" : "surplus margin";
  drawChart("chGauge", { type:"doughnut",
    data:{ datasets:[{ data:[mClamped, 1 - mClamped], backgroundColor:[margin < 0 ? css("--bad") : css("--accent"), css("--bg2")], borderWidth:0, borderRadius:10 }] },
    options:{ responsive:true, maintainAspectRatio:false, cutout:"78%", rotation:-120, circumference:240, animation: document.documentElement.classList.contains("still") ? false : { duration:700 },
      plugins:{ legend:{ display:false }, tooltip:{ enabled:false } } } });
  // monthly chart
  const mon = S.data.monthly || [];
  drawChart("chMonthly", {
    type:"bar",
    data:{ labels: mon.map(x => new Date(x.month + "T00:00:00").toLocaleDateString("en-GB",{month:"short",year:"2-digit"})),
      datasets:[
        { label:"Income", data: mon.map(x => x.income), backgroundColor: css("--income"), borderRadius:6, maxBarThickness:22 },
        { label:"Expenditure", data: mon.map(x => x.expenditure), backgroundColor: css("--spend"), borderRadius:6, maxBarThickness:22 } ] },
    options: baseOpts({ money:true })
  });
  // mix
  // sections are the COA ACCNTTYPE headings; income or expenditure comes from the sign of the line
  const sec = {}, secSign = {}; (S.data.ie || []).forEach(r => { sec[r.section] = (sec[r.section] || 0) + Number(r.amount); secSign[r.section] = Number(r.sign); });
  const inc = Object.keys(sec).filter(s => secSign[s] < 0), exp = Object.keys(sec).filter(s => secSign[s] > 0);
  const tInc = inc.reduce((a,s)=>a+sec[s],0) || 1, tExp = exp.reduce((a,s)=>a+sec[s],0) || 1;
  const palInc = [css("--bal"), css("--income"), css("--accent")], palExp = [css("--spend"), css("--bad"), css("--muted")];
  const short = s => String(s || "");
  drawChart("chMix", {
    type:"bar",
    data:{ labels:["Income","Expenditure"],
      datasets:[ ...inc.map((s,i)=>({ label:short(s), data:[sec[s]/tInc*100, null], backgroundColor:palInc[i%3], raw:[sec[s], null] })),
                 ...exp.map((s,i)=>({ label:short(s), data:[null, sec[s]/tExp*100], backgroundColor:palExp[i%3], raw:[null, sec[s]] })) ] },
    options: { ...baseOpts({}), indexAxis:"y",
      scales:{ x:{ stacked:true, max:100, ticks:{ callback:v=>v+"%", color:css("--muted") }, grid:{ color:css("--line") } },
               y:{ stacked:true, ticks:{ color:css("--ink") }, grid:{ display:false } } },
      plugins:{ legend:{ position:"bottom", labels:{ color:css("--ink"), boxWidth:12 } },
        tooltip:{ callbacks:{ label:(c)=> `${c.dataset.label}: ${Number(c.raw).toFixed(1)}% (${money(c.dataset.raw[c.dataIndex])})` } } } }
  });
  // budget mini
  const bud = (S.data.budget || []).filter(x => Number(x.budget) || Number(x.actual));
  $("budgetNote").textContent = bud.length ? `Actual spending as a share of the ${S.data.period.fy} budget, by function.` : `No budget entered for ${S.data.period.fy}.`;
  drawChart("chBudgetMini", {
    type:"bar",
    data:{ labels: bud.map(x => x.function_id), datasets:[{ label:"Used", data: bud.map(x => x.budget ? x.actual / x.budget * 100 : 0),
      backgroundColor: bud.map(x => (x.budget && x.actual > x.budget) ? css("--bad") : css("--income")), borderRadius:6, maxBarThickness:18 }] },
    options:{ ...baseOpts({}), indexAxis:"y", plugins:{ legend:{ display:false },
      tooltip:{ callbacks:{ label:(c)=>{ const x = bud[c.dataIndex]; return `${x.func_name}: ${Number(c.raw).toFixed(0)}% (${money(x.actual)} of ${money(x.budget)})`; } } } },
      scales:{ x:{ ticks:{ callback:v=>v+"%", color:css("--muted") }, grid:{ color:css("--line") } }, y:{ ticks:{ color:css("--ink") }, grid:{ display:false } } } }
  });
  renderWatch();
}

function renderWatch(){
  const k = S.data.kpi, b = S.data.balances, items = [];
  (S.data.budget || []).forEach(x => {
    if (Number(x.budget) > 0 && Number(x.actual) > Number(x.budget))
      items.push(["bad", `${x.function_id} ${x.func_name} has spent ${pct(x.actual / x.budget)} of its budget (${money(x.actual - x.budget, {rs:true})} over).`]);
  });
  if (k.surplus < 0) items.push(["bad", `Spending is higher than income by ${money(-k.surplus, {rs:true})} in this period.`]);
  if (k.grant_dependency > 0.5) items.push(["warn", `${pct(k.grant_dependency)} of income is the federal grant.`]);
  else if (k.grant_dependency !== null && k.grant_dependency !== undefined) items.push(["ok", `The federal grant is ${pct(k.grant_dependency)} of income.`]);
  if (k.own_cover_non_ere !== null && k.own_cover_non_ere !== undefined)
    items.push([k.own_cover_non_ere < 1 ? "warn" : "ok", `Own-source revenue covers ${pct(k.own_cover_non_ere)} of Non-ERE spending.`]);
  if (Number(k.recoup_payments) || Number(k.non_recoup_payments))
    items.push(["ok", `Payments tagged Recoup ${money(k.recoup_payments, {rs:true})}, Non Recoup ${money(k.non_recoup_payments, {rs:true})}.`]);
  if (Number(k.recoup_pending) > 0) items.push(["warn", `${money(k.recoup_pending, {rs:true})} paid from the Revenue account is tagged Recoup with no recoup status yet.`]);
  if (b.months_covered !== null && b.months_covered !== undefined)
    items.push([b.months_covered < 6 ? "warn" : "ok", `Liquid funds cover ${Number(b.months_covered).toFixed(1)} months of spending at the current rate.`]);
  if (Number(b.adb_loan) > 0) items.push(["warn", `ADB loan outstanding ${money(b.adb_loan, {rs:true})}, plus accrued charges of ${money(b.adb_accrued, {rs:true})}.`]);
  $("watchList").innerHTML = items.length ? items.map(([c, t]) => `<li><span class="dot ${c === "ok" ? "" : c}"></span><span>${esc(t)}</span></li>`).join("")
    : `<li><span class="dot"></span><span>Nothing needs attention for this period.</span></li>`;
}

function baseOpts({ money:isMoney }){
  return { responsive:true, maintainAspectRatio:false, animation: document.documentElement.classList.contains("still") ? false : { duration:500 },
    plugins:{ legend:{ position:"bottom", labels:{ color:css("--ink"), boxWidth:10, usePointStyle:true, pointStyle:"circle" } },
      tooltip:{ backgroundColor: css("--side"), padding:10, cornerRadius:10, callbacks: isMoney ? { label:(c)=> `${c.dataset.label}: ${money(c.raw, {rs:true})}` } : {} } },
    scales:{ x:{ ticks:{ color:css("--muted") }, grid:{ display:false } },
             y:{ ticks:{ color:css("--muted"), callback:(v)=> isMoney ? (S.unit === "M" ? nfR.format(v/1e6) + " M" : nfR.format(v)) : v }, grid:{ color:css("--line") } } } };
}
function drawChart(id, cfg){
  if (typeof Chart === "undefined") return;
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart($(id), cfg);
}

/* ----- I&E ----- */
let ieRows = [];
function renderIE(){
  const rows = S.data.ie || [], k = S.data.kpi, p = S.data.period;
  $("ieNote").textContent = `${fmtDate(p.from)} to ${fmtDate(p.to)}, compared with ${fmtDate(p.py_from)} to ${fmtDate(p.py_to)}. Select a line to see its entries.`;
  // sections = COA ACCNTTYPE, in the order the server sends them; income / expenditure by the sign of the line
  const incS = [...new Set(rows.filter(r => Number(r.sign) < 0).map(r => r.section))], expS = [...new Set(rows.filter(r => Number(r.sign) > 0).map(r => r.section))];
  const totInc = k.income || 0;
  ieRows = [["Line", "This period", "Same period last year", "Change", "Share of income"]];
  let h = `<thead><tr><th>Line</th><th>This period</th><th>Same period last year</th><th>Change</th><th>Share of income</th></tr></thead><tbody>`;
  const block = (title, secs, sign) => {
    let tc = 0, tp = 0;
    h += `<tr class="sec"><td colspan="5">${title}</td></tr>`;
    secs.forEach(s => {
      let sc = 0, sp = 0; h += `<tr class="sec"><td colspan="5">${esc(s)}</td></tr>`;
      rows.filter(r => r.section === s && Math.sign(Number(r.sign)) === sign).forEach(r => {
        const a = Number(r.amount), b2 = Number(r.amount_py); sc += a; sp += b2;
        if (!a && !b2) return;
        const c = change(a, b2);
        h += `<tr class="click" data-line="${esc(r.line)}" tabindex="0"><td>${esc(r.line)}</td><td>${money(a)}</td><td>${money(b2)}</td><td>${c === null ? "–" : `<span class="${(title === "Income") === (c >= 0) ? "up" : "down"}">${pct(c)}</span>`}</td><td>${totInc ? pct(a / totInc, 1) : "–"}</td></tr>`;
        ieRows.push([r.line, a, b2, c === null ? "" : (c*100).toFixed(1) + "%", totInc ? (a/totInc*100).toFixed(1) + "%" : ""]);
      });
      h += `<tr class="total"><td>Total ${esc(s)}</td><td>${money(sc)}</td><td>${money(sp)}</td><td>${pct(change(sc, sp))}</td><td>${totInc ? pct(sc / totInc, 1) : "–"}</td></tr>`;
      ieRows.push(["Total " + s, sc, sp, "", ""]); tc += sc; tp += sp;
    });
    h += `<tr class="grand"><td>Total ${title.toLowerCase()}</td><td>${money(tc)}</td><td>${money(tp)}</td><td>${pct(change(tc, tp))}</td><td></td></tr>`;
    ieRows.push(["Total " + title.toLowerCase(), tc, tp, "", ""]);
    return [tc, tp];
  };
  const [ic, ip] = block("Income", incS, -1); const [ec, ep] = block("Expenditure", expS, 1);
  h += `<tr class="grand"><td>${ic - ec >= 0 ? "Surplus" : "Deficit"}</td><td class="${ic - ec < 0 ? "neg" : ""}">${money(ic - ec)}</td><td>${money(ip - ep)}</td><td>${pct(change(ic - ec, ip - ep))}</td><td></td></tr>`;
  ieRows.push(["Surplus / (deficit)", ic - ec, ip - ep, "", ""]);
  $("ieTable").innerHTML = h + "</tbody>";
}
$("ieTable").addEventListener("click", e => { const tr = e.target.closest("tr[data-line]"); if (tr) drill({ p_line: tr.dataset.line }, "Line: " + tr.dataset.line); });
$("ieTable").addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-line]"); if (tr) drill({ p_line: tr.dataset.line }, "Line: " + tr.dataset.line); } });

/* ----- Budget ----- */
let budRows = [];
function renderBudget(){
  const rows = S.data.budget || [], p = S.data.period;
  $("budNote").textContent = `Budget and releases for ${p.fy}. Actual spending from ${fmtDate(p.from)} to ${fmtDate(p.to)}. Select a function to see its entries.`;
  let tb = 0, tr = 0, ta = 0;
  budRows = [["Function", "Name", "Budget", "Released", "Actual", "Available", "Used %"]];
  let h = `<thead><tr><th>Function</th><th>Budget</th><th>Released</th><th>Actual</th><th>Available</th><th>Used</th></tr></thead><tbody>`;
  rows.forEach(x => {
    const bdg = Number(x.budget), rel = Number(x.released), act = Number(x.actual), used = bdg ? act / bdg : null;
    tb += bdg; tr += rel; ta += act;
    const w = used === null ? 0 : Math.min(used, 1.5) * 60;
    h += `<tr class="click" data-fn="${esc(x.function_id)}" tabindex="0"><td><strong>${esc(x.function_id)}</strong> ${esc(x.func_name)} <span class="pill">${esc(x.func_group || "")}</span></td>
      <td>${money(bdg)}</td><td>${money(rel)}</td><td>${money(act)}</td><td class="${bdg - act < 0 ? "neg" : ""}">${money(bdg - act)}</td>
      <td>${pct(used)}<span class="bar${used > 1 ? " over" : ""}" style="width:${w}px"></span></td></tr>`;
    budRows.push([x.function_id, x.func_name, bdg, rel, act, bdg - act, used === null ? "" : (used*100).toFixed(1) + "%"]);
  });
  const tu = tb ? ta / tb : null;
  h += `<tr class="grand"><td>Total</td><td>${money(tb)}</td><td>${money(tr)}</td><td>${money(ta)}</td><td class="${tb - ta < 0 ? "neg" : ""}">${money(tb - ta)}</td><td>${pct(tu)}</td></tr>`;
  budRows.push(["Total", "", tb, tr, ta, tb - ta, tu === null ? "" : (tu*100).toFixed(1) + "%"]);
  $("budTable").innerHTML = rows.length ? h + "</tbody>" : `<tbody><tr><td class="empty">No budget entered for ${esc(p.fy)}.</td></tr></tbody>`;
  drawChart("chBudget", {
    type:"bar",
    data:{ labels: rows.map(x => x.function_id), datasets:[
      { label:"Budget", data: rows.map(x => x.budget), backgroundColor: css("--bg2"), borderColor: css("--bal"), borderWidth:1.5, borderRadius:6 },
      { label:"Released", data: rows.map(x => x.released), backgroundColor: css("--bal"), borderRadius:6 },
      { label:"Actual", data: rows.map(x => x.actual), backgroundColor: css("--spend"), borderRadius:6 } ] },
    options: baseOpts({ money:true })
  });
}
$("budTable").addEventListener("click", e => { const tr = e.target.closest("tr[data-fn]"); if (tr) drill({ p_function: tr.dataset.fn }, "Function: " + tr.dataset.fn); });

/* ----- Position ----- */
let posRows = [];
function renderPosition(){
  const b = S.data.balances, p = S.data.period;
  $("posNote").textContent = `Balances at ${fmtDate(p.to)}: opening trial balance plus every entry up to that date.` +
    (S.bank || S.recoup ? " The bank-account list follows your Bank filter; the other balances are for the whole organisation." : "");
  $("posFigures").innerHTML =
    figure("bal", "Cash and bank", b.cash_bank, "utility fund " + money(b.utility_fund), "bank") +
    figure("bal", "Investments", b.investments, "accrued profit " + money(b.accrued_profit), "up") +
    figure("bal", "Liquid funds available", b.liquid_funds, "cash less utility fund, plus investments", "shield") +
    figure("spend", "ADB loan outstanding", b.adb_loan, "accrued charges " + money(b.adb_accrued), "wallet") +
    figure("spend", "Employees' CPF held", b.cpf_held, "held for staff", "coins") +
    figure("bal", "Net assets", b.net_assets, "assets " + money(b.total_assets) + ", liabilities " + money(b.total_liabilities), "scale");
  countUp("#posFigures");
  const sfp = S.data.sfp || [];
  posRows = [["Group", "Line", "Amount"]];
  let h = `<thead><tr><th>Statement of financial position</th><th>Amount</th></tr></thead><tbody>`;
  // groups are the COA Account Head of the accounts (asset / liability side found by the server)
  ["ASSET","LIABILITY"].forEach(cls => {
    const its = sfp.filter(x => x.cls === cls); if (!its.length) return;
    const g = its[0].group || cls;
    let t = 0; h += `<tr class="sec"><td colspan="2">${esc(g)}</td></tr>`;
    its.filter(x => Math.abs(Number(x.amount)) > 0.5).forEach(x => { t += Number(x.amount); h += `<tr><td>${esc(x.line)}</td><td class="${x.amount < 0 ? "neg" : ""}">${money(x.amount)}</td></tr>`; posRows.push([g, x.line, Number(x.amount)]); });
    h += `<tr class="total"><td>Total ${esc(g)}</td><td>${money(t)}</td></tr>`;
  });
  h += `<tr class="grand"><td>Net assets</td><td>${money(b.net_assets)}</td></tr>`;
  $("sfpTable").innerHTML = h + "</tbody>";
  const banks = S.data.banks || [];
  $("bankTable").innerHTML = `<thead><tr><th>Bank account</th><th>Balance</th></tr></thead><tbody>` +
    banks.map(x => `<tr><td>${esc(x.account)}</td><td class="${x.balance < 0 ? "neg" : ""}">${money(x.balance)}</td></tr>`).join("") +
    `<tr class="grand"><td>Total cash and bank</td><td>${money(b.cash_bank)}</td></tr></tbody>`;
  banks.forEach(x => posRows.push(["Bank", x.account, Number(x.balance)]));
}

/* ----- Utilities & tenants ----- */
let tenRows = [];
function renderUtility(){
  const u = S.data.utility || [], t = S.data.tenants || [], f = S.data.utility_fund || {};
  // by Report Role code of the accounts (COA), so a renamed heading changes nothing here
  const amt = (code) => u.filter(x => x.code === code).reduce((a, x) => a + Number(x.amount || 0), 0);
  const pw = amt("PAID_KE"), pc = amt("POWER_COLLECTION");
  const wp = amt("PAID_KWSC"), wc = amt("WATER_COLLECTION");
  const shortfall = pc - pw;
  $("utilFigures").innerHTML =
    figure("income", "Water bills collected", wc, wp ? `${pct(wc / wp)} of the ${money(wp)} paid to KWSC` : "Nothing paid to KWSC in this period", "drop") +
    figure("income", "Power bills collected", pc, pw ? `${pct(pc / pw)} of the ${money(pw)} paid to K-Electric` : "Nothing paid to K-Electric in this period", "bolt") +
    figure(shortfall < 0 ? "spend" : "income", shortfall < 0 ? "Power shortfall" : "Power surplus", shortfall, shortfall < 0 ? "met from water collections and the fund" : "power collections exceed K-Electric bills", "bolt") +
    figure("bal", "Utility fund balance", f.closing, `was ${money(f.opening)} at the start of the period`, "shield");
  countUp("#utilFigures");
  const other = Number(f.closing || 0) - Number(f.opening || 0) - Number(f.collections || 0) + Number(f.payments || 0);
  const coll = u.filter(x => /COLLECTION$/.test(x.code || "")), pays = u.filter(x => !/COLLECTION$/.test(x.code || ""));
  const line = (x) => `<tr class="click" data-role="${esc(x.role)}" tabindex="0"><td>${esc(x.role)}</td><td class="${x.amount < 0 ? "neg" : ""}">${money(x.amount)}</td></tr>`;
  $("utilTable").innerHTML = `<thead><tr><th>Utility fund (RM account)</th><th>Amount</th></tr></thead><tbody>
    <tr><td>Opening balance</td><td>${money(f.opening)}</td></tr>
    <tr class="sec"><td colspan="2">Collected from users</td></tr>${coll.map(line).join("")}
    <tr class="total"><td>Total collected</td><td>${money(f.collections)}</td></tr>
    <tr class="sec"><td colspan="2">Paid out of the fund</td></tr>${pays.map(line).join("")}
    <tr class="total"><td>Total paid</td><td>${money(f.payments)}</td></tr>
    <tr><td>Other movements (transfers, refunds)</td><td class="${other < 0 ? "neg" : ""}">${money(other)}</td></tr>
    <tr class="grand"><td>Closing balance</td><td>${money(f.closing)}</td></tr></tbody>`;
  tenRows = [["Tenant", "Rent and fees", "Utility bills", "Total"]];
  $("tenantTable").innerHTML = `<thead><tr><th>Largest tenants</th><th>Rent and fees</th><th>Utility bills</th><th>Total</th></tr></thead><tbody>` +
    (t.length ? t.map(x => { const tot = Number(x.rent_fees) + Number(x.utility); tenRows.push([x.tenant, Number(x.rent_fees), Number(x.utility), tot]);
      return `<tr class="click" data-tenant="${esc(x.tenant)}" tabindex="0"><td>${esc(x.tenant)}</td><td>${money(x.rent_fees)}</td><td>${money(x.utility)}</td><td>${money(tot)}</td></tr>`; }).join("")
     : `<tr><td class="empty" colspan="4">No tenant receipts in this period.</td></tr>`) + "</tbody>";
}
$("utilTable").addEventListener("click", e => { const tr = e.target.closest("tr[data-role]"); if (tr) drill({ p_role: tr.dataset.role }, "Utility: " + tr.dataset.role); });
$("tenantTable").addEventListener("click", e => { const tr = e.target.closest("tr[data-tenant]"); if (tr) drill({ p_tenant: tr.dataset.tenant }, "Tenant: " + tr.dataset.tenant); });

/* ----- Transactions ----- */
function drill(filter, label){ S.txn.drill = { filter, label }; S.txn.offset = 0; showTab("txn"); }
function txnArgs(limit, offset){
  const a = { p_from:S.from, p_to:S.to, p_search: $("tSearch").value.trim() || null, p_account: $("tAccount").value.trim() || null,
    p_bank: $("tBank").value || S.bank || null, p_section: $("tSection").value || null, p_limit: limit, p_offset: offset,
    p_recoup: S.recoup || null, p_filters: FB.txnFb && FB.txnFb.get().length ? FB.txnFb.get() : null };
  return Object.assign(a, S.txn.drill ? S.txn.drill.filter : {});
}
async function loadTxn(){
  renderDrill(); loading(true, "Loading entries");
  try { S.txn.result = await rpc("rpt_ledger", txnArgs(S.txn.limit, S.txn.offset)); renderTxn(); }
  catch(e){ if (e.message !== "signed out") $("txnTable").innerHTML = `<tbody><tr><td class="empty">${esc(e.message)}</td></tr></tbody>`; }
  finally { loading(false); }
}
function renderDrill(){
  $("drillBar").innerHTML = S.txn.drill ? `<span class="pill">${esc(S.txn.drill.label)}</span><button class="btn ghost" type="button" id="dropDrill">Show all entries</button>` : "";
  const d = $("dropDrill"); if (d) d.onclick = () => { S.txn.drill = null; S.txn.offset = 0; loadTxn(); };
}
function renderTxn(){
  const r = S.txn.result; if (!r) return;
  const rows = r.rows || [];
  $("txnTable").innerHTML = `<thead><tr><th>Date</th><th>Voucher</th><th>Description</th><th>Account</th><th>Bank</th><th>Payment</th><th>Deposit</th></tr></thead><tbody>` +
    (rows.length ? rows.map(x => `<tr><td>${fmtDate(x.txn_date)}</td><td>${esc(x.voucher_no || "")}</td><td class="txt">${esc(x.description || "")}${x.pay_to ? `<br><small style="color:var(--muted)">${esc(x.pay_to)}</small>` : ""}</td><td class="txt">${esc(x.account || "")}</td><td>${esc(x.bank || "")}</td><td>${x.payment ? money(x.payment, {full:true}) : ""}</td><td>${x.deposit ? money(x.deposit, {full:true}) : ""}</td></tr>`).join("")
      : `<tr><td class="empty" colspan="7">No entries match these filters. Widen the period or clear a filter.</td></tr>`) +
    `<tr class="grand"><td colspan="5">${nfR.format(r.total)} entries in total</td><td>${money(r.sum_payment, {full:true})}</td><td>${money(r.sum_deposit, {full:true})}</td></tr></tbody>`;
  const from = r.total ? S.txn.offset + 1 : 0, to = Math.min(S.txn.offset + S.txn.limit, r.total);
  $("pageInfo").textContent = `Showing ${nfR.format(from)} to ${nfR.format(to)} of ${nfR.format(r.total)}`;
  $("prevPage").disabled = S.txn.offset === 0; $("nextPage").disabled = to >= r.total;
}
$("tApply").addEventListener("click", () => { S.txn.offset = 0; loadTxn(); });
$("tSearch").addEventListener("keydown", e => { if (e.key === "Enter") { S.txn.offset = 0; loadTxn(); } });
$("tClear").addEventListener("click", () => { ["tSearch","tAccount"].forEach(i => $(i).value = ""); $("tBank").value = ""; $("tSection").value = ""; S.txn.drill = null; S.txn.offset = 0; loadTxn(); });
$("prevPage").addEventListener("click", () => { S.txn.offset = Math.max(0, S.txn.offset - S.txn.limit); loadTxn(); });
$("nextPage").addEventListener("click", () => { S.txn.offset += S.txn.limit; loadTxn(); });
$("txnExport").addEventListener("click", async () => {
  loading(true, "Preparing download");
  try {
    const r = await rpc("rpt_ledger", txnArgs(5000, 0));
    const out = [["Date","Voucher","Description","Pay to","Account","Bank","Payment","Deposit","Report section","Report line"]]
      .concat((r.rows || []).map(x => [x.txn_date, x.voucher_no, x.description, x.pay_to, x.account, x.bank, x.payment, x.deposit, x.report_section, x.report_line]));
    downloadCsv(out, "KoFHA_transactions");
    if (r.total > 5000) alert(`The download holds the latest 5,000 of ${nfR.format(r.total)} entries. Narrow the period for the rest.`);
  } catch(e){ alert(e.message); } finally { loading(false); }
});

/* ---------- downloads ---------- */
function downloadCsv(rows, name){
  const csv = rows.map(r => r.map(v => { if (v === null || v === undefined) return ""; const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type:"text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `${name}_${S.from}_to_${S.to}.csv`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-export]"); if (!b || !S.data) return;
  const k = b.dataset.export;
  if (k === "ie") downloadCsv(ieRows, "KoFHA_income_expenditure");
  if (k === "budget") downloadCsv(budRows, "KoFHA_budget_vs_actual");
  if (k === "position") downloadCsv(posRows, "KoFHA_financial_position");
  if (k === "tenants") downloadCsv(tenRows, "KoFHA_tenants");
});
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => renderAll());

/* ---------- management modules ---------- */
const M = {}, MKEY = {};
const tableHtml = (head, rows, foot) => `<thead><tr>${head.map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.join("") ||
  `<tr><td class="empty" colspan="${head.length}">Nothing recorded for this selection.</td></tr>`}${foot || ""}</tbody>`;
const EXPORTS = {};
