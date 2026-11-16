/* ----- report library ----- */
const RL = { list: [], current: null, last: null };
function drawReportList(){
  $("rlList").classList.remove("hidden"); $("rlRun").classList.add("hidden");
  const secs = [...new Set(RL.list.map(r => r.section))];
  $("rlCards").innerHTML = secs.map(s => `<div class="rl-sec">${esc(s)}</div><div class="rl-grid">` +
    RL.list.filter(r => r.section === s).map(r => `<div class="rl-card"><h3>${esc(r.title)}</h3><p>${esc(r.description || "")}</p>
      ${r.source ? `<small>Matches: ${esc(r.source)}</small>` : ""}<div><button class="btn" type="button" data-rl="${esc(r.id)}">Run</button></div></div>`).join("") + `</div>`).join("") ||
    `<p class="empty">No reports yet. Run 12_report_library.sql in Supabase.</p>`;
}
$("rlCards").addEventListener("click", e => { const b = e.target.closest("[data-rl]"); if (b) openReport(b.dataset.rl); });
$("rlBack").addEventListener("click", () => { RL.current = null; drawReportList(); });
$("rlPrint").addEventListener("click", () => window.print());
function paramList(r){ return (r.params || []).map(p => typeof p === "string" ? { key:p, type:p } : p); }
function openReport(id, preset){
  const r = RL.list.find(x => x.id === id); if (!r) return; RL.current = r;
  $("rlList").classList.add("hidden"); $("rlRun").classList.remove("hidden");
  $("rlTitle").textContent = r.title; $("rlDesc").textContent = r.description || "";
  const fys = (S.meta.fiscal_years || []);
  $("rlParams").innerHTML = paramList(r).map(p => {
    if (p.type === "period") return `<label>Period<input type="text" disabled value="${esc(fmtDate(S.from) + " to " + fmtDate(S.to))}" id="rlPeriodTxt"><small class="mini">Change it with Year and Period at the top.</small></label>`;
    if (p.type === "fy") {
      // a year list; "wide" adds older years (from 2015-16) for reports with historical figures; "offset" moves the default
      let codes = fys.map(f => f.code);
      if (p.wide && codes.length) { const first = parseInt(codes.slice().sort()[0], 10);
        for (let y = 2015; y < first; y++) codes.push(y + "-" + String((y + 1) % 100).padStart(2, "0")); }
      codes = [...new Set(codes)].sort();
      let sel = p.default || S.fy;
      if (p.offset) { const i = codes.indexOf(S.fy); if (i >= 0) sel = codes[Math.max(0, Math.min(codes.length - 1, i + Number(p.offset)))]; }
      const nm = c => ((fys.find(f => f.code === c) || {}).name) || ("FY " + c);
      return `<label>${esc(p.label || "Financial year")}<select data-p="${esc(p.key || "fy")}">${codes.map(c => `<option value="${esc(c)}" ${c === sel ? "selected" : ""}>${esc(nm(c))}</option>`).join("")}</select></label>`; }
    if (p.type === "as_of") return `<label>As at<input type="date" data-p="as_of" value="${esc(S.to)}"></label>`;
    if (p.type === "date") return `<label>${esc(p.label || p.key)}<input type="date" data-p="${esc(p.key)}" value="${esc(p.default ?? "")}"></label>`;
    if (p.type === "bank") { const bs = [...new Set([...(S.meta.banks || []), p.default].filter(Boolean))].sort();
      return `<label>${esc(p.label || "Bank account")}<select data-p="${esc(p.key)}">${bs.map(b => `<option ${b === p.default ? "selected" : ""}>${esc(b)}</option>`).join("")}</select></label>`; }
    if (p.type === "select") { const ops = (p.options || []).map(o => typeof o === "object" ? o : { value:o, label:o });
      return `<label>${esc(p.label || p.key)}<select data-p="${esc(p.key)}"><option value="">${ops.length ? "— choose —" : "— nothing to choose —"}</option>${ops.map(o => `<option value="${esc(o.value)}" ${o.value === p.default ? "selected" : ""}>${esc(o.label ?? o.value)}</option>`).join("")}</select></label>`; }
    if (p.type === "levels") { const ops = (p.options || []).map(o => typeof o === "object" ? o : { value:o, label:o });
      return `<div class="lvl-field"><span class="lvl-lbl">${esc(p.label || "COA levels")}</span><input type="hidden" data-p="${esc(p.key)}" value="${esc(p.default ?? "")}">
        <div class="lvl-row"><span class="lvl-chips" data-lvl="${esc(p.key)}"></span><select data-lvladd="${esc(p.key)}"><option value="">+ add a level…</option>${ops.map(o => `<option value="${esc(o.value)}">${esc(o.label ?? o.value)}</option>`).join("")}</select></div></div>`; }
    if (p.type === "cheques") return `<label>${esc(p.label || "Cheques")}<span class="chqrow"><input type="text" data-p="${esc(p.key)}" value="${esc(p.default ?? "")}" placeholder="e.g. B566419-B566435, B566440" autocomplete="off"><button class="btn ghost" type="button" data-chqpick="${esc(p.key)}">Pick</button></span></label>`;
    const num = /^-?[\d.,]+$/.test(String(p.default ?? ""));
    return `<label>${esc(p.label || p.key)}<input type="text" ${num ? 'inputmode="decimal"' : ""} data-p="${esc(p.key)}" value="${esc(p.default ?? "")}"></label>`;
  }).join("");
  // inputs handed over (e.g. from an Ask KoFHA answer)
  if (preset) document.querySelectorAll("#rlParams [data-p]").forEach(el => { const v = preset[el.dataset.p]; if (v !== undefined && v !== null && v !== "") el.value = String(v); });
  document.querySelectorAll("#rlParams [data-lvl]").forEach(el => lvlDraw(el.dataset.lvl));
  runReport();
}
// open a report from an Ask KoFHA answer with the same period and inputs
async function openReportFromAsk(o){
  const p = o.params || {};
  if (p.from && p.to) {
    const fy = (S.meta.fiscal_years || []).find(f => p.to >= f.start && p.to <= f.end);
    if (fy && fy.code !== S.fy) { S.fy = fy.code; $("fySel").value = S.fy; }
    $("fromDate").value = p.from; $("toDate").value = p.to; setPreset("custom", true);
  } else if (p.fy && p.fy !== S.fy && (S.meta.fiscal_years || []).some(f => f.code === p.fy)) { S.fy = p.fy; $("fySel").value = S.fy; setPreset(S.preset, true); }
  showTab("reports");
  for (let i = 0; i < 40 && !(RL.list && RL.list.length); i++) await new Promise(r => setTimeout(r, 250));
  if (!(RL.list || []).some(x => x.id === o.report_id)) { alert("That report is not in your Report library."); return; }
  openReport(o.report_id, p);
}
// the top bar's Bank account / Recoup / Group filters, sent with every report
function topFilters(){ const f = {};
  if (S.bank) f.banks = [S.bank]; if (S.recoup) f.recoup = S.recoup; if ((S.groups || []).length) f.func_groups = [...S.groups];
  if (S.status) f.status = S.status; if (S.voucher) f.voucher = S.voucher; if (S.tagText) f.tag_contains = S.tagText;
  return f; }
$("stSel").addEventListener("change", () => { S.status = $("stSel").value; topRerun(); });
["vchIn","tagIn"].forEach(id => $(id).addEventListener("change", () => { S.voucher = $("vchIn").value.trim(); S.tagText = $("tagIn").value.trim(); topRerun(); }));
// the new top-bar filters apply to the Report library and the Report designer
function topRerun(){ if (S.tab === "reports" && RL.current) runReport(); else if (S.tab === "designer" && DZ.last) dzPreview(); }
function reportArgs(){
  const a = { from:S.from, to:S.to, fy:S.fy, ...topFilters() };
  document.querySelectorAll("#rlParams [data-p]").forEach(el => { if (String(el.value).trim() !== "") a[el.dataset.p] = el.value.trim(); });
  return a;
}
$("rlGo").addEventListener("click", () => runReport());
$("healthChip").addEventListener("click", openHealthReport);

// Bank matching: runs only when this button is pressed (nothing runs by itself). The matching takes minutes and works in
// the background; only lines not matched before are read. Shift + click forgets the matches and starts again.
let BM_TIMER = null;
function bmShow(list){
  const st = $("bmSt"); if (!st) return;
  const act = (list || []).filter(x => x.status === "queued" || x.status === "running");
  const bad = (list || []).filter(x => x.status === "failed");
  const done = (list || []).filter(x => x.status === "done" && x.finished);
  if (act.length) { st.textContent = "Matching " + (list.length - act.length) + " of " + list.length + " bank accounts done..."; $("bmBtn").disabled = true; return; }
  $("bmBtn").disabled = false;
  if (bad.length) { st.textContent = bad.length + " bank account(s) failed: " + String(bad[0].error || "").slice(0, 80); return; }
  if (done.length) { const t = done.map(x => x.finished).sort().pop(); st.textContent = "Last matching: " + new Date(t).toLocaleString(); }
}
async function bmPoll(){
  try { const l = await rpc("bank_match_status"); bmShow(l);
    if ((l || []).some(x => x.status === "queued" || x.status === "running")) { clearTimeout(BM_TIMER); BM_TIMER = setTimeout(bmPoll, 20000); }
    else { clearTimeout(BM_TIMER); BM_TIMER = null; if (RL && RL.last && /bank/i.test(RL.last.title || "")) { /* reopen the report to see the new result */ } }
  } catch(e) { /* the status must never stop the dashboard */ }
}
$("bmBtn").addEventListener("click", async (ev) => {
  const all = ev.shiftKey;
  if (!confirm(all ? "Forget ALL bank matches and match everything again? This takes long." : "Match the bank statements with the GL now?\n\nOnly lines not matched before are read. It runs in the background; you can keep working.")) return;
  try { const r = await rpc("request_bank_match", { p_rebuild_all: all }); $("bmSt").textContent = r.queued ? "Matching started..." : "Matching is already running.";
    clearTimeout(BM_TIMER); BM_TIMER = setTimeout(bmPoll, 5000); }
  catch(e) { alert("Could not start the matching.\n\n" + e.message); }
});
function fmtCell(v, t){
  if (v === null || v === undefined || v === "") return "";
  switch (t) {
    case "pct": return pct(Number(v), 1);
    case "number": return nfM.format(Number(v)).replace(/\.00$/, "");
    case "count": return nfR.format(Number(v));
    case "date": return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? fmtDate(String(v).slice(0, 10)) : esc(v);
    case "text": return esc(v);
    case "code": return `<details class="dax"><summary>show</summary><pre>${esc(v)}</pre></details>`;
    case "bmact": return `<button type="button" class="btn bm-ok" data-k="${esc(v)}">Confirm</button> <button type="button" class="btn bm-no" data-k="${esc(v)}">Reject</button>`;
    default: return isNaN(Number(v)) ? esc(v) : money(Number(v));
  }
}
async function runReport(){
  const r = RL.current; if (!r) return;
  loading(true, "Running " + r.title);
  try {
    const d = await rpc("rpt_run_report", { p_id:r.id, p_params:reportArgs() }); RL.last = d;
    if ($("rlPeriodTxt")) $("rlPeriodTxt").value = fmtDate(S.from) + " to " + fmtDate(S.to);
    $("rlOutTitle").textContent = d.title || r.title; $("rlOutSub").textContent = [ (d.ref_line || []).join("    "), d.subtitle, d.intro ].filter(Boolean).join("  ·  ");
    $("rlExtra").innerHTML = (d.extra || []).map(x => `<div class="fig bal"><div class="lbl">${esc(x.label)}</div><div class="val">${fmtCell(x.value, x.type)}</div></div>`).join("");
    const parts = reportParts(d), cols = parts[0].columns || [], rows = parts[0].rows || [];
    const tableHtml = (pt, pi) => `<thead>${headRows(pt.columns || [], null)}</thead><tbody>` +
      (pt.rows || []).map((x, i) => `<tr class="${x._style || ""}${x._drill ? " click" : ""}" data-i="${i}" data-pi="${pi}">` + (pt.columns || []).map((c, j) => {
        const t = c.type === "auto" ? (x._fmt || "money") : c.type;
        return `<td class="${j === 0 && x._indent ? "ind" + (x._indent > 1 ? " ind2" : "") + (x._indent > 2 ? " ind" + Math.min(x._indent, 6) : "") : ""}${t === "text" && j > 0 ? " txt" : ""}${(t === "money" || t === "auto") && Number(x[c.key]) < 0 ? " neg" : ""}">${j === 0 && t === "text" ? esc(x[c.key] ?? "") : fmtCell(x[c.key], t)}</td>`;
      }).join("") + `</tr>`).join("") + `</tbody>`;
    const kv = (d.header || []).length ? `<table class="rl-kv">${d.header.map(h => `<tr><th>${esc(h.label)}</th><td>${esc(h.value ?? "")}</td></tr>`).join("")}</table>` : "";
    $("rlExtra").innerHTML += kv;
    if (d.bulk) $("rlExtra").innerHTML += `<div class="fig bal"><div class="lbl">Confirm all proposals with score at least</div><div class="val"><input id="bmBulkScore" type="number" min="61" max="99" value="75" style="width:72px"> <button type="button" class="btn bm-ok" id="bmBulkGo">Confirm all</button></div></div>`;
    $("rlTable").innerHTML = (parts[0].title ? `<caption class="rl-part" style="caption-side:top;text-align:left">${esc(parts[0].title)}</caption>` : "") + tableHtml(parts[0], 0);
    $("rlMore").innerHTML = parts.slice(1).map((pt, k) => `<h4 class="rl-part">${esc(pt.title || "")}</h4><div class="tscroll detail"><table>${tableHtml(pt, k + 1)}</table></div>`).join("");
    $("rlNotes").textContent = (d.certificate ? "Certificate: " + d.certificate + " " : "") + (d.notes || []).join(" ") + ((d.closing || []).length ? " " + d.closing.join(" ") : "");
    // chart
    const ch = d.chart; $("rlChartWrap").classList.toggle("hidden", !ch);
    if (ch) {
      const pal = [css("--accent"), css("--spend"), css("--bal"), css("--income"), css("--bad"), css("--muted")];
      if (ch.rows_as_series) {
        const ks = ch.month_keys || [];
        drawChart("chReport", { type: ch.type || "line", data:{ labels: ks.map(k => new Date(k + "-01T00:00:00").toLocaleDateString("en-GB",{month:"short",year:"2-digit"})),
          datasets: ch.rows_as_series.map((lbl, i) => { const row = rows.find(x => x.line === lbl) || {}; return { label: lbl, data: ks.map(k => Number(row[k] || 0)), borderColor: pal[i], backgroundColor: pal[i], tension:.25 }; }) },
          options: baseOpts({ money:true }) });
      } else {
        let rs = rows.filter(x => (!ch.exclude_styled || !x._style) && (!ch.only_indented || x._indent));
        const first = (ch.series || [])[0];
        if (ch.top) rs = [...rs].sort((a, b) => Math.abs(Number(b[first] || 0)) - Math.abs(Number(a[first] || 0))).slice(0, ch.top);
        const lab = x => { const s = String(x[ch.label] ?? ""); return s.length > 34 ? s.slice(0, 32) + "…" : s; };
        const label = k => (cols.find(c => c.key === k) || {}).label || k;
        drawChart("chReport", { type: ch.type || "bar", data:{ labels: rs.map(lab),
          datasets: (ch.series || []).map((k, i) => ({ label: label(k), data: rs.map(x => Number(x[k] || 0)), backgroundColor: pal[i], borderColor: pal[i], borderRadius:5, maxBarThickness:24 })) },
          options: { ...baseOpts({ money:true }), ...(ch.stacked ? { scales:{ x:{ stacked:true, ticks:{ color:css("--muted") }, grid:{ display:false } }, y:{ stacked:true, ticks:{ color:css("--muted") }, grid:{ color:css("--line") } } } } : {}) } });
      }
    }
  } catch(e){ $("rlTable").innerHTML = `<tbody><tr><td class="empty">${esc(e.message)}</td></tr></tbody>`; }
  finally { loading(false); }
}
// "Bank match - proposed": Confirm all with a score at or above the number given (never a difference, another Reconcile date or an ambiguous total)
$("rlExtra").addEventListener("click", async e => {
  const go = e.target.closest("#bmBulkGo"); if (!go || !RL.last || !RL.last.bulk) return;
  const s = Number($("bmBulkScore").value), bk = RL.last.bulk;
  if (!(s >= 61)) { alert("Give a score of 61 or more."); return; }
  if (!confirm(`Confirm every proposal with score ${s} or more${bk.acct ? "" : " for ALL bank accounts"} in this period?\n\nDifferences, other Reconcile dates and ambiguous totals are never confirmed this way.`)) return;
  go.disabled = true;
  try { const r = await rpc("bank_match_confirm_all", { p_acct: bk.acct || null, p_min_score: s, p_from: bk.from, p_to: bk.to });
        alert((r.confirmed || 0) + " proposal(s) confirmed."); runReport(); }
  catch(err){ alert("Could not confirm.\n\n" + err.message); }
  finally { go.disabled = false; }
});
// "Bank match - proposed" report: Confirm makes the match final, Reject frees the lines (never proposed again)
$("rlTable").addEventListener("click", async e => {
  const b = e.target.closest("button.bm-ok, button.bm-no"); if (!b) return;
  e.stopPropagation();
  const [acct, grp] = String(b.dataset.k || "").split("|"), ok = b.classList.contains("bm-ok");
  if (!ok && !confirm("Reject this proposal? Its lines become free and this group is never proposed again.")) return;
  const cell = b.parentElement; cell.querySelectorAll("button").forEach(x => x.disabled = true);
  try { await rpc(ok ? "bank_match_confirm" : "bank_match_reject", { p_acct: acct, p_grp: Number(grp) });
        cell.textContent = ok ? "Confirmed" : "Rejected"; cell.closest("tr").style.opacity = ".55"; }
  catch(err){ cell.querySelectorAll("button").forEach(x => x.disabled = false); alert((ok ? "Could not confirm." : "Could not reject.") + "\n\n" + err.message); }
});
$("rlTable").addEventListener("click", e => {
  if (e.target.closest("button.bm-ok, button.bm-no")) return;
  const tr = e.target.closest("tr[data-i]"); if (!tr || !RL.last) return; const x = (reportParts(RL.last)[+tr.dataset.pi || 0].rows || [])[+tr.dataset.i]; if (!x || !x._drill) return;
  const f = { ...x._drill }; let label = Object.values(f)[0];
  // a drill that opens another report (or the same one with other inputs), e.g. a daily wager's months
  if (f.report) { const id = f.report; delete f.report; openReport(id, f); return; }
  if (f.p_bank) { S.bank = ""; }
  drill(f, "From report: " + label);
});
$("rlExport").addEventListener("click", () => { const d = RL.last; if (!d) return; const parts = reportParts(d), out = [];
  if (parts.length > 1 || (d.header || []).length) { out.push([d.title || ""]); if (d.subtitle) out.push([d.subtitle]); (d.header || []).forEach(h => out.push([h.label, h.value ?? ""])); out.push([]); }
  parts.forEach((pt, k) => { const cols = pt.columns || []; if (pt.title) out.push([pt.title]);
    out.push(cols.map(c => (c.group ? c.group + " - " : "") + String(c.label).replace(/\n/g, " ")));
    (pt.rows || []).forEach(x => out.push(cols.map(c => x[c.key] ?? ""))); if (k < parts.length - 1) out.push([]); });
  if (d.certificate) { out.push([]); out.push(["Certificate: " + d.certificate]); }
  downloadCsv(out, "KoFHA_" + (RL.current ? RL.current.id : "report")); });

/* a report may have several tables (parts), e.g. the cash book's receipts and payments pages */
function reportParts(d){ return d.parts && d.parts.length ? d.parts : [{ columns: d.columns || [], rows: d.rows || [] }]; }
// heading rows; columns sharing a "group" get a joint heading above them; "\n" in a label breaks the line
function headRows(cols, snoLabel){
  const lab = c => esc(c.label).replace(/\n/g, "<br>"), sno = snoLabel != null;
  if (!cols.some(c => c.group)) return `<tr>${sno ? `<th>${esc(snoLabel)}</th>` : ""}${cols.map(c => `<th>${lab(c)}</th>`).join("")}</tr>`;
  let r1 = sno ? `<th rowspan="2">${esc(snoLabel)}</th>` : "", r2 = "";
  for (let i = 0; i < cols.length; ) { const g = cols[i].group;
    if (!g) { r1 += `<th rowspan="2">${lab(cols[i])}</th>`; i++; continue; }
    let j = i; while (j < cols.length && cols[j].group === g) { r2 += `<th>${lab(cols[j])}</th>`; j++; }
    r1 += `<th colspan="${j - i}">${esc(g)}</th>`; i = j; }
  return `<tr>${r1}</tr><tr>${r2}</tr>`;
}

/* cheque picker for "cheques" inputs */
const CHQ = { key:null, list:[], picked:new Set() };
function chqNum(c){ const m = String(c).match(/^(.*?)(\d+)$/); return m ? { pre:m[1].toUpperCase(), n:Number(m[2]) } : null; }
function chqMatch(chq, spec){
  const c = String(chq || "").trim().toUpperCase(); if (!String(spec || "").trim()) return false;
  return String(spec).toUpperCase().split(/\s*[,;\n]+\s*/).some(it => { it = it.trim(); if (!it) return false; if (it === c) return true;
    if (it.includes("*")) return new RegExp("^" + it.split("*").map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(c);
    const m = it.match(/^(\S+)\s*-\s*(\S+)$/); if (!m) return false; const a = chqNum(m[1]), b = chqNum(m[2]), x = chqNum(c);
    return !!(a && b && x && a.pre === x.pre && x.n >= a.n && x.n <= b.n); });
}
// ticked cheques -> "B566419-B566428, B566430"
function chqCompact(list){
  const out = []; let run = null;
  list.forEach(c => { const x = chqNum(c);
    if (run && x && run.pre === x.pre && x.n === run.last + 1) { run.last = x.n; run.to = c; return; }
    if (run) out.push(run.from === run.to ? run.from : run.from + "-" + run.to);
    run = x ? { pre:x.pre, last:x.n, from:c, to:c } : { pre:null, last:NaN, from:c, to:c }; });
  if (run) out.push(run.from === run.to ? run.from : run.from + "-" + run.to);
  return out.join(", ");
}
function chqDraw(){
  const q = $("chqFind").value.trim().toLowerCase();
  const shown = CHQ.list.filter(c => !q || [c.chq, c.payee, String(c.amount)].join(" ").toLowerCase().includes(q));
  $("chqList").innerHTML = shown.map(c => `<label><input type="checkbox" data-chq="${esc(c.chq)}" ${CHQ.picked.has(c.chq) ? "checked" : ""}>
      <span class="c-no">${esc(c.chq)}</span><span class="c-dt">${esc(fmtDate(String(c.date).slice(0, 10)))}</span><span class="c-py">${esc(c.payee || "")}</span><span class="c-am">Rs ${nfR.format(Math.round(Number(c.amount)))}</span></label>`).join("")
    || `<p class="empty" style="padding:14px">No cheques ${q ? "match the search" : "in this period"}.</p>`;
  const tot = CHQ.list.filter(c => CHQ.picked.has(c.chq)).reduce((a, c) => a + Number(c.amount), 0);
  $("chqCount").textContent = `${CHQ.picked.size} of ${CHQ.list.length} ticked · Rs ${nfR.format(Math.round(tot))}`;
}
async function openChqPicker(key){
  CHQ.key = key; const inp = document.querySelector(`#rlParams [data-p="${key}"]`); const bankEl = document.querySelector('#rlParams [data-p="bank"]');
  const bank = bankEl ? bankEl.value : "";
  $("chqNote").textContent = `Cheques paid from ${bank || "the budget account"}, ${fmtDate(S.from)} to ${fmtDate(S.to)}. Change Year and Period at the top to see other months.`;
  $("chqFind").value = ""; $("chqList").innerHTML = `<p class="empty" style="padding:14px">Loading cheques…</p>`; $("chqCount").textContent = "";
  const dl = $("chqDlg"); if (dl.showModal) dl.showModal(); else dl.setAttribute("open", "");
  try { CHQ.list = await rpc("rpt_cheque_list", { p_from:S.from, p_to:S.to, p_bank: bank || null }) || []; }
  catch(e){ $("chqList").innerHTML = `<p class="empty" style="padding:14px">${esc(e.message)}</p>`; return; }
  CHQ.picked = new Set(CHQ.list.filter(c => chqMatch(c.chq, inp ? inp.value : "")).map(c => c.chq));
  chqDraw();
}
function chqClose(){ const dl = $("chqDlg"); dl.close ? dl.close() : dl.removeAttribute("open"); }
$("rlParams").addEventListener("click", e => { const b = e.target.closest("[data-chqpick]"); if (b) openChqPicker(b.dataset.chqpick); });
/* "COA levels" input: Chart of Accounts columns picked in order, sent as "Col1|Col2|Col3" */
function lvlGet(k){ const h = document.querySelector(`#rlParams [data-p="${k}"]`); return h && h.value ? h.value.split("|").filter(Boolean) : []; }
function lvlSet(k, list){ const h = document.querySelector(`#rlParams [data-p="${k}"]`); if (h) h.value = list.join("|"); lvlDraw(k); runReport(); }
function lvlDraw(k){
  const box = document.querySelector(`#rlParams [data-lvl="${k}"]`); if (!box) return; const list = lvlGet(k);
  box.innerHTML = list.length ? list.map((c, i) => `<span class="chip lvl-chip">${i ? `<button type="button" class="lvl-btn" data-lvlup="${i}" title="Move up">‹</button>` : ""}<b>${i + 1}.</b> ${esc(c)}<button type="button" class="lvl-btn" data-lvlx="${i}" title="Remove">×</button></span>`).join(`<span class="lvl-sep">›</span>`)
    : `<span class="mini">usual layout</span>`;
  const sel = document.querySelector(`#rlParams [data-lvladd="${k}"]`);
  if (sel) [...sel.options].forEach(o => { if (o.value) o.disabled = list.includes(o.value); });
}
$("rlParams").addEventListener("change", e => { const s = e.target.closest("[data-lvladd]"); if (!s || !s.value) return;
  const k = s.dataset.lvladd, v = s.value; s.value = ""; lvlSet(k, [...lvlGet(k), v]); });
$("rlParams").addEventListener("click", e => {
  const box = e.target.closest("[data-lvl]"); if (!box) return; const k = box.dataset.lvl, list = lvlGet(k);
  const x = e.target.closest("[data-lvlx]"), u = e.target.closest("[data-lvlup]");
  if (x) { list.splice(+x.dataset.lvlx, 1); lvlSet(k, list); }
  else if (u) { const i = +u.dataset.lvlup; [list[i - 1], list[i]] = [list[i], list[i - 1]]; lvlSet(k, list); } });
$("chqFind").addEventListener("input", chqDraw);
$("chqList").addEventListener("change", e => { const c = e.target.dataset.chq; if (!c) return; e.target.checked ? CHQ.picked.add(c) : CHQ.picked.delete(c); chqDraw(); });
$("chqAll").addEventListener("click", () => { const q = $("chqFind").value.trim().toLowerCase();
  CHQ.list.filter(c => !q || [c.chq, c.payee, String(c.amount)].join(" ").toLowerCase().includes(q)).forEach(c => CHQ.picked.add(c.chq)); chqDraw(); });
$("chqNone").addEventListener("click", () => { CHQ.picked.clear(); chqDraw(); });
$("chqCancel").addEventListener("click", chqClose);
$("chqUse").addEventListener("click", () => { const inp = document.querySelector(`#rlParams [data-p="${CHQ.key}"]`);
  if (inp) inp.value = chqCompact(CHQ.list.map(c => c.chq).filter(c => CHQ.picked.has(c))); chqClose(); runReport(); });

/* ----- report maker: three steps, government formats, saved reports, official sheet ----- */
const RM_TOPICS = [
  { id:"exp", label:"Expenditure", ds:"Ledger", measures:[["Expenditure","Expenditure"]],
    groups:[["Report line","Expenditure line"],["Report section","Section"],["Function code","Function / object code"],["Function group","Function group (ERE / Non-ERE)"],["Account","Account head"],["Pay to","Paid to"],["Bank","Bank account"]] },
  { id:"inc", label:"Income", ds:"Ledger", measures:[["Income","Income"]],
    groups:[["Report line","Income line"],["Report section","Section"],["Account","Account head"],["Tenant","Tenant"],["Bank","Bank account"]] },
  { id:"pay", label:"Payments (money paid out)", ds:"Ledger", measures:[["Payments","Payments"]],
    groups:[["Pay to","Paid to"],["Account","Account head"],["Report line","Expenditure line"],["Function code","Function / object code"],["Bank","Bank account"]] },
  { id:"rec", label:"Receipts (money received)", ds:"Ledger", measures:[["Receipts","Receipts"]],
    groups:[["Account","Account head"],["Tenant","Tenant"],["Report line","Income line"],["Bank","Bank account"]] },
  { id:"bill", label:"Bills issued", ds:"billing_issued", measures:[["Total Payable","Total payable"],["Amount","Bill amount"],["Surcharge","Surcharge"],["Arrears","Arrears"],["TotalUnits","Units"]],
    groups:[["Bill Type","Bill type"],["Customer Name","Customer"],["Unit Type","Unit type"]] },
  { id:"budget", label:"Budget", ds:"budget_txn", measures:[["Amount","Amount"]], noPeriod:true, fyCol:"FY",
    groups:[["FunctionID","Function / object code"],["BudgetType","Budget type"],["FY","Financial year"]] },
  { id:"rel", label:"Releases", ds:"release_txn", measures:[["ReleaseAmount","Amount released"]], noPeriod:true, fyCol:"FY",
    groups:[["FunctionID","Function / object code"],["Quarter","Quarter"],["ReleaseType","Release type"],["FY","Financial year"]] },
  { id:"sal", label:"Salary bill", ds:"salary_monthly", measures:[["Total Pay & Allow.","Gross pay and allowances"],["Net Amount","Net pay"],["Total Deduction","Deductions"],["Income  Tax","Income tax"],["Basic Pay","Basic pay"]],
    groups:[["Designation","Designation"],["Grade","Grade"],["BPS","BPS"],["Name of Employee","Employee"]] },
  { id:"inv", label:"Invoices", ds:"invoice_txn", measures:[["Entered Invoice Amount (PKR)","Invoice amount"],["Recoupable Portion (PKR)","Recoupable portion"]],
    groups:[["VendorName","Vendor"],["FunctionID","Function / object code"],["ExpenseCategory","Expense category"],["Status","Status"]] },
];
const RM_PERIODS = [["this_month","This month"],["last_month","Last month"],["this_quarter","This quarter"],["last_quarter","Last quarter"],
  ["fytd","This year to date"],["last_fy","Last financial year"],["top","Same as the top filter"],["custom","Choose dates"]];
const RM = { topic:"exp", measure:null, rows:[], period:"fytd", formats:[], saved:[], savedRemote:true, last:null, millions:false };

function rmTopic(){ return RM_TOPICS.find(t => t.id === RM.topic) || RM_TOPICS[0]; }
function fyStartOf(d){ const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1; return new Date(y, 6, 1); }
// a period choice -> real dates (worked out on the day the report is run)
function rmDates(mode, from, to){
  const t = new Date(); t.setHours(0,0,0,0);
  const m0 = new Date(t.getFullYear(), t.getMonth(), 1), q0 = new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1);
  const end = (d, months) => new Date(d.getFullYear(), d.getMonth() + months, 0);
  switch (mode) {
    case "this_month": return [iso(m0), iso(t)];
    case "last_month": { const a = new Date(m0.getFullYear(), m0.getMonth() - 1, 1); return [iso(a), iso(end(a, 1))]; }
    case "this_quarter": return [iso(q0), iso(t)];
    case "last_quarter": { const a = new Date(q0.getFullYear(), q0.getMonth() - 3, 1); return [iso(a), iso(end(a, 3))]; }
    case "fytd": return [iso(fyStartOf(t)), iso(t)];
    case "last_fy": { const a = fyStartOf(t); a.setFullYear(a.getFullYear() - 1); return [iso(a), iso(end(a, 12))]; }
    case "custom": return [from || S.from, to || S.to];
    default: return [S.from, S.to];
  }
}
function shiftYear(d, n){ const x = new Date(d + "T00:00:00"); x.setFullYear(x.getFullYear() + n); return iso(x); }
function periodLabel(mode, f, t){ const p = (RM_PERIODS.find(x => x[0] === mode) || [])[1]; return `${fmtDate(f)} to ${fmtDate(t)}` + (p && mode !== "custom" && mode !== "top" ? ` (${p.toLowerCase()})` : ""); }

/* heading and signatures, kept in this browser */
const RM_HEAD_DEFAULT = { org:"Korangi Fisheries Harbour Authority", org2:"Finance Department", prepared:"Accounts Officer", checked:"Deputy Director (Finance)", approved:"Director (Finance)" };
function rmHead(){ try { return { ...RM_HEAD_DEFAULT, ...JSON.parse(localStorage.getItem("kofha.head") || "{}") }; } catch(e){ return { ...RM_HEAD_DEFAULT }; } }
$("rmHeadBtn").addEventListener("click", () => { const h = rmHead();
  $("rmHOrg").value = h.org; $("rmHOrg2").value = h.org2; $("rmHP").value = h.prepared; $("rmHC").value = h.checked; $("rmHA").value = h.approved;
  const d = $("rmHeadDlg"); if (d.showModal) d.showModal(); else d.setAttribute("open", ""); });
$("rmHClose").addEventListener("click", () => $("rmHeadDlg").close ? $("rmHeadDlg").close() : $("rmHeadDlg").removeAttribute("open"));
$("rmHSave").addEventListener("click", () => {
  const h = { org:$("rmHOrg").value.trim(), org2:$("rmHOrg2").value.trim(), prepared:$("rmHP").value.trim(), checked:$("rmHC").value.trim(), approved:$("rmHA").value.trim() };
  try { localStorage.setItem("kofha.head", JSON.stringify(h)); } catch(e){}
  $("rmHClose").click(); if (RM.last) rmRenderSheet(RM.last);
});

/* the official sheet: same look on screen, in print and in the PDF */
function sheetHtml(d){
  const h = rmHead(), o = d.official || {}, parts = reportParts(d);
  const full = !RM.millions;
  const cell = (v, t) => {
    if (v === null || v === undefined || v === "") return "";
    if (t === "money" || t === "auto") { const n = Number(v); if (isNaN(n)) return esc(v); const a = Math.abs(n);
      const s = full ? nfR.format(a) : nfM.format(a / 1e6); return n < 0 ? "(" + s + ")" : s; }
    if (t === "pct") return pct(Number(v), 1);
    if (t === "count") return nfR.format(Number(v));
    if (t === "date") return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? fmtDate(String(v).slice(0, 10)) : esc(v);
    return esc(v);
  };
  const block = pt => { const cols = pt.columns || [], rows = pt.rows || []; let sno = 0;
    const body = rows.map(x => {
      const plain = !x._style; if (plain) sno++;
      return `<tr class="${x._style || ""}"><td class="sno">${plain ? sno : ""}</td>` + cols.map((c, j) => {
        const t = c.type === "auto" ? (x._fmt || "money") : c.type, first = j === 0 && t === "text";
        return `<td class="${first && !d.plain_first ? "part" : ""}${j === 0 && x._indent ? " ind" + (x._indent > 1 ? " ind2" : "") : ""}${t === "text" && !(first && !d.plain_first) ? " txt" : ""}">${first ? esc(x[c.key] ?? "") : cell(x[c.key], t)}</td>`;
      }).join("") + `</tr>`; }).join("");
    return `<div class="pblock">${pt.title ? `<div class="ptitle">${esc(pt.title)}</div>` : ""}<table class="grid"><thead>${headRows(cols, d.sno_label || "S. No.")}</thead>
      <tbody>${body || `<tr><td class="empty" colspan="${cols.length + 1}">Nothing recorded for this choice.</td></tr>`}</tbody></table></div>`; };
  const anyMoney = parts.some(pt => (pt.columns || []).some(c => c.type === "money" || c.type === "auto"));
  const kv = (d.header || []).length ? `<table class="kv">${d.header.map(x => `<tr><th>${esc(x.label)}:</th><td>${esc(x.value ?? "")}</td></tr>`).join("")}</table>` : "";
  const checks = (d.notes || []).filter(Boolean);
  const now = new Date();
  return `<div class="org">${esc(h.org)}</div>${h.org2 ? `<div class="org2">${esc(h.org2)}</div>` : ""}${o.authority ? `<div class="org2">${esc(o.authority)}</div>` : ""}
    ${(d.ref_line || []).length ? `<div class="refline">${d.ref_line.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}
    <div class="ttl">${esc(d.title || "Report")}</div>${d.subtitle ? `<div class="sub">${esc(d.subtitle)}</div>` : ""}
    ${d.intro ? `<p class="intro">${esc(d.intro)}</p>` : ""}
    ${kv}<div class="unit">${anyMoney && !d.hide_unit ? (full ? "(Amount in Rupees)" : "(Rupees in million)") : ""}</div>
    ${d.flow ? `<div class="flowwrap">${parts.map(block).join("")}</div>` : parts.map(block).join("")}
    ${d.certificate ? `<p class="cert"><b>Certificate:</b> ${esc(d.certificate)}</p>` : ""}
    ${checks.length ? `${d.notes_title ? `<div class="ntitle">${esc(d.notes_title)}</div>` : ""}<ul class="checks${d.notes_title ? " letter" : ""}">${checks.map(n => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    ${(d.closing || []).map(x => `<p class="closing">${esc(x)}</p>`).join("")}
    ${d.signatory ? `<div class="sign one"><div>${esc(d.signatory)}</div></div>` : `<div class="sign"><div>${esc(o.prepared_by || h.prepared)}<small>Prepared by</small></div><div>${esc(o.checked_by || h.checked)}<small>Checked by</small></div><div>${esc(o.approved_by || h.approved)}<small>Approved by</small></div></div>`}
    ${(d.copy_to || []).length ? `<div class="copyto"><b>Copy for information and further necessary action to:</b><ol>${d.copy_to.map(x => `<li>${esc(x)}</li>`).join("")}</ol></div>` : ""}
    <div class="foot"><span>KoFHA ERP</span><span>Printed ${esc(now.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"}))} ${esc(now.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}))}</span></div>`;
}
function rmRenderSheet(d){ RM.last = d; $("rmSheet").innerHTML = sheetHtml(d); $("rmSheet").classList.toggle("wide", Math.max(...reportParts(d).map(pt => (pt.columns || []).length)) > 9); $("rmOut").classList.remove("hidden");
  $("rmUnits").textContent = RM.millions ? "Show full rupees" : "Show in millions"; }
// printable width of an A4 page with the margins in @page, in CSS pixels (96 per inch)
const PAGE_PX = { portrait: (210 - 24) * 96 / 25.4, landscape: (297 - 16) * 96 / 25.4 };
function fitPrintSheet(el){
  // measure the table at print font sizes; use landscape when it does not fit upright, then shrink to the page width
  const tbls = [...el.querySelectorAll("table.grid")]; if (!tbls.length) return;
  tbls.forEach(t => t.style.zoom = "");
  const tbl = { get scrollWidth(){ return Math.max(...tbls.map(t => t.scrollWidth)); }, style:{ set zoom(z){ tbls.forEach(t => t.style.zoom = z); } } };
  // lay the sheet out at the page width: the table wraps headings and names, and is only wider than the page when it cannot fit
  el.classList.add("pp", "measure"); el.classList.remove("wide");
  el.style.width = PAGE_PX.portrait + "px";
  let w = tbl.scrollWidth;
  if (w > PAGE_PX.portrait + 1) { el.classList.add("wide"); el.style.width = PAGE_PX.landscape + "px"; w = tbl.scrollWidth; }
  const avail = el.classList.contains("wide") ? PAGE_PX.landscape : PAGE_PX.portrait;
  el.classList.remove("measure"); el.style.width = "";
  if (w > avail) tbl.style.zoom = String(Math.max(0.45, Math.floor((avail / w) * 100) / 100));
}
function printOfficial(d){
  const el = $("printSheet");
  el.innerHTML = sheetHtml(d); el.className = "sheet";
  fitPrintSheet(el);
  document.body.classList.add("print-official");
  // keep the print layout until the print dialog is closed (the preview re-renders when settings change)
  const mq = window.matchMedia ? window.matchMedia("print") : null;
  const done = () => { document.body.classList.remove("print-official"); window.removeEventListener("afterprint", done); if (mq && mq.removeEventListener) mq.removeEventListener("change", onMq); };
  const onMq = e => { if (!e.matches) setTimeout(done, 300); };
  window.addEventListener("afterprint", done);
  if (mq && mq.addEventListener) mq.addEventListener("change", onMq);
  window.print();
}
$("rmPrint").addEventListener("click", () => RM.last && printOfficial(RM.last));
$("rmUnits").addEventListener("click", () => { RM.millions = !RM.millions; if (RM.last) rmRenderSheet(RM.last); });
$("rmExcel").addEventListener("click", () => { const d = RM.last; if (!d) return; const h = rmHead(), cols = d.columns || [];
  downloadCsv([[h.org], [d.title || ""], [d.subtitle || ""], [], cols.map(c => c.label)].concat((d.rows || []).map(x => cols.map(c => x[c.key] ?? ""))), "KoFHA_" + String(d.title || "report").replace(/[^A-Za-z0-9]+/g, "_")); });
// the Report library prints the same official sheet
$("rlPrint").replaceWith($("rlPrint").cloneNode(true));
$("rlPrint").addEventListener("click", () => RL.last ? printOfficial({ ...RL.last, subtitle: RL.last.subtitle || `${fmtDate(S.from)} to ${fmtDate(S.to)}` }) : window.print());

/* step controls */
function rmMaxRows(){ return /^f:/.test($("rmTime").value) ? 2 : 3; }
function rmDraw(){
  const T = rmTopic();
  if (!RM.measure || !T.measures.some(m => m[0] === RM.measure)) RM.measure = T.measures[0][0];
  RM.rows = (RM.rows || []).filter(r => T.groups.some(g => g[0] === r));
  if (!RM.rows.length) RM.rows = [T.groups[0][0]];
  // columns: a total, a time breakdown, or any other field across the page
  const keep = $("rmTime").value;
  const colOpts = [["", "One column (total)"], ["month", "Month by month"], ["quarter", "Quarter by quarter"], ["fy", "Year by year"]]
    .concat(T.groups.filter(g => !RM.rows.includes(g[0])).map(g => ["f:" + g[0], g[1] + " across the page"]));
  $("rmTime").innerHTML = colOpts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join("");
  $("rmTime").value = colOpts.some(o => o[0] === keep) ? keep : "";
  if (RM.rows.length > rmMaxRows()) RM.rows = RM.rows.slice(0, rmMaxRows());
  $("rmTopics").innerHTML = RM_TOPICS.map(t => `<button type="button" class="chip" data-topic="${t.id}" aria-pressed="${t.id === RM.topic}">${esc(t.label)}</button>`).join("");
  $("rmMeasureRow").innerHTML = T.measures.length > 1 ? `<label>Amount to show<select id="rmMeasure">${T.measures.map(m => `<option value="${esc(m[0])}" ${m[0] === RM.measure ? "selected" : ""}>${esc(m[1])}</option>`).join("")}</select></label>` : "";
  $("rmGroups").innerHTML = T.groups.map(g => { const i = RM.rows.indexOf(g[0]);
    return `<button type="button" class="chip" data-g="${esc(g[0])}" aria-pressed="${i >= 0}">${i >= 0 ? `<span class="ord">${i + 1}</span>` : ""}${esc(g[1])}</button>`; }).join("");
  $("rmPeriods").innerHTML = RM_PERIODS.map(p => `<button type="button" class="chip" data-per="${p[0]}" aria-pressed="${p[0] === RM.period}">${esc(p[1])}</button>`).join("");
  $("rmDates").classList.toggle("hidden", RM.period !== "custom");
  const noP = !!T.noPeriod; $("rmPeriods").classList.toggle("hidden", noP); $("rmCompare").disabled = noP || !!$("rmTime").value;
  $("rmPeriodNote").textContent = noP ? "Budget and releases are shown for the financial year chosen at the top (Year). To compare years, choose Columns: Year by year, or Show it by Financial year." :
    "Saved reports keep this choice, so \u201cLast month\u201d always means the month before the day you run it.";
  const [f, t] = rmDates(RM.period, $("rmFrom").value, $("rmTo").value);
  const lab = k => (T.groups.find(g => g[0] === k) || [k, k])[1];
  const ml = (T.measures.find(m => m[0] === RM.measure) || [])[1];
  const tv = $("rmTime").value;
  $("rmSummary").innerHTML = `<b>${esc(ml)}</b> by ${RM.rows.map(r => `<b>${esc(lab(r))}</b>`).join(", then ")}${tv ? `, ${esc($("rmTime").selectedOptions[0].text.toLowerCase())}` : ""}${noP ? `, FY ${esc(S.fy || "")}` : `, ${esc(periodLabel(RM.period, f, t))}`}${!$("rmCompare").disabled && $("rmCompare").checked ? ", compared with last year" : ""}.`;
}
$("rmTopics").addEventListener("click", e => { const b = e.target.closest("[data-topic]"); if (!b) return; RM.topic = b.dataset.topic; RM.measure = null; RM.rows = []; $("rmTime").value = ""; rmDraw(); });
$("rmGroups").addEventListener("click", e => { const b = e.target.closest("[data-g]"); if (!b) return; const g = b.dataset.g, i = RM.rows.indexOf(g);
  if (i >= 0) { if (RM.rows.length > 1) RM.rows.splice(i, 1); }
  else if (RM.rows.length < rmMaxRows()) RM.rows.push(g);
  else { RM.rows[RM.rows.length - 1] = g; }
  rmDraw(); });
$("rmPeriods").addEventListener("click", e => { const b = e.target.closest("[data-per]"); if (!b) return; RM.period = b.dataset.per;
  if (RM.period === "custom" && !$("rmFrom").value) { $("rmFrom").value = S.from; $("rmTo").value = S.to; } rmDraw(); });
$("rmMeasureRow").addEventListener("change", e => { if (e.target.id === "rmMeasure") { RM.measure = e.target.value; rmDraw(); } });
["rmTime","rmCompare","rmFrom","rmTo"].forEach(id => $(id).addEventListener("change", rmDraw));
$("rmModes").addEventListener("click", e => { const b = e.target.closest("[data-m]"); if (b) rmMode(b.dataset.m); });
function rmMode(m){
  document.querySelectorAll("#rmModes [data-m]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === m)));
  $("rmMake").classList.toggle("hidden", m !== "make"); $("rmFormats").classList.toggle("hidden", m !== "formats"); $("rmSaved").classList.toggle("hidden", m !== "saved");
  if (m === "saved") rmLoadSaved();
}
function rmSpec(){ return { type:"maker", topic:RM.topic, measure:RM.measure, rows:[...RM.rows], time:$("rmTime").value, period:RM.period,
  from:$("rmFrom").value, to:$("rmTo").value, compare:$("rmCompare").checked, only:$("rmOnly").value.trim(), limit:$("rmLimit").value }; }
function specRows(sp){ return (sp.rows && sp.rows.length) ? sp.rows : [sp.g1, sp.g2].filter(Boolean); }
function rmApply(sp){
  RM.topic = sp.topic || "exp"; RM.measure = sp.measure; RM.rows = specRows(sp); RM.period = sp.period || "fytd";
  $("rmFrom").value = sp.from || ""; $("rmTo").value = sp.to || ""; $("rmCompare").checked = sp.compare !== false;
  $("rmOnly").value = sp.only || ""; $("rmLimit").value = sp.limit || "25";
  $("rmTime").value = ""; rmDraw(); $("rmTime").value = sp.time || ""; rmDraw();
}

async function rmRun(spec, savedName){
  const sp = spec || rmSpec(); const T = RM_TOPICS.find(t => t.id === sp.topic) || RM_TOPICS[0];
  const rowsF = specRows(sp).slice(0, 3); const tv = sp.time || "";
  const colField = tv.startsWith("f:") ? tv.slice(2) : null, timeBy = colField ? null : (tv || null);
  const group = rowsF.concat(colField ? [colField] : []).slice(0, 3); const noP = !!T.noPeriod;
  const [f, t] = noP ? [null, null] : rmDates(sp.period, sp.from, sp.to);
  const filters = sp.only ? [{ col: rowsF[rowsF.length - 1], op:"contains", value: sp.only }] : [];
  const topNotes = [];
  const byYear = T.fyCol && (rowsF.includes(T.fyCol) || colField === T.fyCol || timeBy === "fy");
  if (T.fyCol && !byYear && S.fy) filters.push({ col:T.fyCol, op:"equals", value:S.fy });
  if (T.ds === "Ledger") {
    if (S.bank) { filters.push({ col:"Bank", op:"equals", value:S.bank }); topNotes.push("bank " + S.bank); }
    if (S.recoup) { filters.push({ col:"Tag (Bill No. Engg.)", op:"equals", value:S.recoup }); topNotes.push("tag " + S.recoup); }
    if ((S.groups || []).length === 1) { filters.push({ col:"Function group", op:"equals", value:S.groups[0] }); topNotes.push("function group " + S.groups[0]); }
    else if ((S.groups || []).length > 1) topNotes.push("several function groups are ticked; pick one group to filter this report");
  }
  const across = !!(colField || timeBy);
  const compare = !noP && sp.compare && !across;
  loading(true, "Making the report");
  try {
    const ask = (a, b) => rpc("rpt_analyze", { p_dataset:T.ds, p_group:group, p_time: timeBy, p_measure: sp.measure, p_agg:"sum",
      p_from:a, p_to:b, p_filters:filters.length ? filters : null, p_limit:5000, p_order: across ? "name" : "value_desc" });
    const [r, rp] = await Promise.all([ask(f, t), compare ? ask(shiftYear(f, -1), shiftYear(t, -1)) : Promise.resolve(null)]);
    const label = k => (T.groups.find(g => g[0] === k) || [k, k])[1];
    const ml = (T.measures.find(m => m[0] === sp.measure) || [sp.measure, sp.measure])[1];
    const nRow = rowsF.length;
    const val = v => (v === null || v === undefined || v === "(blank)") ? "(not given)" : String(v);
    // leaf key = row fields joined; column = time period or the across field
    const cur = {}, prev = {}, per = {}, colTot = {};
    const add = (x, store) => { const gs = (x.groups || []).map(val); const k = gs.slice(0, nRow).join("\u0001"); store[k] = (store[k] || 0) + Number(x.value || 0); return [k, gs]; };
    (r.rows || []).forEach(x => { const [k, gs] = add(x, cur); if (across) { const c = colField ? gs[nRow] : String(x.period);
      (per[k] = per[k] || {})[c] = (per[k][c] || 0) + Number(x.value || 0); colTot[c] = (colTot[c] || 0) + Number(x.value || 0); } });
    if (rp) (rp.rows || []).forEach(x => add(x, prev));
    const nz = k => Math.abs(cur[k] || 0) > 0.004 || Math.abs(prev[k] || 0) > 0.004;
    const keys = [...new Set([...Object.keys(cur), ...Object.keys(prev)])].filter(nz);
    // columns across: time in order; a field by size (largest 12, the rest as Others)
    let P = Object.keys(colTot);
    let otherCols = [];
    if (timeBy) P.sort(); else if (colField) { P.sort((a, b) => Math.abs(colTot[b]) - Math.abs(colTot[a])); if (P.length > 12) { otherCols = P.slice(12); P = P.slice(0, 12); } }
    const colsOf = k => { const o = {}; P.forEach(c => o["p_" + c] = (per[k] || {})[c] || 0);
      if (otherCols.length) o.p__others = otherCols.reduce((s, c) => s + ((per[k] || {})[c] || 0), 0); return o; };
    const pLab = p => /^\d{4}-\d{2}$/.test(String(p)) ? new Date(p + "-01T00:00:00").toLocaleDateString("en-GB",{month:"short",year:"numeric"}) : String(p);
    const cols = [{ key:"line", type:"text", label: rowsF.map(label).join(" / ") }];
    P.forEach(p => cols.push({ key:"p_" + p, type:"money", label: pLab(p) }));
    if (otherCols.length) cols.push({ key:"p__others", type:"money", label:`Others (${otherCols.length})` });
    cols.push({ key:"current", type:"money", label: across ? "Total" : (noP ? ml : `${ml}, ${fmtDate(f)} to ${fmtDate(t)}`) });
    if (compare) cols.push({ key:"compare", type:"money", label:"Same period last year" }, { key:"change", type:"money", label:"Increase / (decrease)" }, { key:"change_pct", type:"pct", label:"Change %" });
    const line = (txt, ks, style, indent) => { const c = ks.reduce((s, k) => s + (cur[k] || 0), 0), p = ks.reduce((s, k) => s + (prev[k] || 0), 0);
      const o = { line: txt, current: c, _style: style, _indent: indent };
      if (compare) { o.compare = p; o.change = c - p; o.change_pct = p ? (c - p) / Math.abs(p) : null; }
      if (across) { P.forEach(q => o["p_" + q] = ks.reduce((s, k) => s + ((per[k] || {})[q] || 0), 0));
        if (otherCols.length) o.p__others = ks.reduce((s, k) => s + (colsOf(k).p__others || 0), 0); }
      return o; };
    const limit = +sp.limit || 25; const rows = [];
    const big = (a, b) => Math.abs(cur[b] || 0) - Math.abs(cur[a] || 0);
    if (nRow === 1) {
      keys.sort(big); const shown = keys.slice(0, limit), rest = keys.slice(limit);
      shown.forEach(k => rows.push(line(k, [k], undefined, 1)));
      if (rest.length) rows.push(line(`Others (${rest.length})`, rest, undefined, 1));
    } else {
      // main groups (first choice) with their sub-rows and a sub-total each
      const byTop = {}; keys.forEach(k => { const top = k.split("\u0001")[0]; (byTop[top] = byTop[top] || []).push(k); });
      const tops = Object.keys(byTop).sort((a, b) => Math.abs(byTop[b].reduce((s, k) => s + (cur[k] || 0), 0)) - Math.abs(byTop[a].reduce((s, k) => s + (cur[k] || 0), 0)));
      tops.forEach(top => {
        const ks = byTop[top].sort(big); const shown = ks.slice(0, limit), rest = ks.slice(limit);
        rows.push({ line: top, _style:"subsection" });
        shown.forEach(k => rows.push(line(k.split("\u0001").slice(1).join(" / "), [k], undefined, 1)));
        if (rest.length) rows.push(line(`Others (${rest.length})`, rest, undefined, 1));
        rows.push(line(`Total ${top}`, ks, "total"));
      });
    }
    rows.push(line("Grand total", keys, "grand"));
    const notes = [];
    if (topNotes.length) notes.push("Filtered by the top bar: " + topNotes.join("; ") + ".");
    if (sp.only) notes.push(`Only rows whose ${label(rowsF[rowsF.length - 1]).toLowerCase()} contains "${sp.only}".`);
    if (r.truncated) notes.push("The engine returned the largest groups only; narrow the choice to see everything.");
    if (["exp","inc","pay","rec"].includes(T.id)) notes.push("Source: general ledger (cashbook entries with their account heads).");
    const d = { title: savedName || `${ml} by ${rowsF.map(label).join(" and ")}${colField ? `, ${label(colField)} across the page` : ""}`,
      subtitle: noP ? (T.fyCol && !byYear ? "Financial year " + S.fy + " (the year chosen at the top)" : "All financial years, year by year") : periodLabel(sp.period, f, t), columns: cols, rows, notes, spec: sp };
    rmRenderSheet(d); $("rmOut").scrollIntoView({ behavior:"smooth", block:"start" });
  } catch(e){ rmRenderSheet({ title:"The report could not be made", subtitle:e.message, columns:[], rows:[] }); }
  finally { loading(false); }
}
$("rmRun").addEventListener("click", () => rmRun());

/* government formats = every report in the library; formats kept as layouts come first */
function rmFmtPeriodFill(){
  $("rmFmtPeriod").innerHTML = RM_PERIODS.map(p => `<option value="${p[0]}" ${p[0] === "top" ? "selected" : ""}>${esc(p[1])}</option>`).join("");
}
$("rmFmtPeriod").addEventListener("change", () => { const c = $("rmFmtPeriod").value === "custom";
  $("rmFmtFromL").classList.toggle("hidden", !c); $("rmFmtToL").classList.toggle("hidden", !c);
  if (c && !$("rmFmtFrom").value) { $("rmFmtFrom").value = S.from; $("rmFmtTo").value = S.to; } });
function rmDrawFormats(){
  const q = $("rmFmtSearch").value.trim().toLowerCase();
  const list = RM.formats.filter(r => !q || `${r.title} ${r.description} ${r.section}`.toLowerCase().includes(q));
  const isOff = r => r.official || String(r.id).startsWith("layout:") || r.section === "Government formats";
  const official = list.filter(isOff), other = list.filter(r => !isOff(r));
  const card = r => `<div class="rm-item">${isOff(r) ? `<span class="rm-badge">Format</span>` : `<span class="rm-badge" style="color:var(--muted);background:var(--surface2)">${esc(r.section || "Report")}</span>`}
      <h4>${esc(r.title)}</h4><p>${esc(r.description || "")}</p><div class="acts"><button class="btn" type="button" data-fmt="${esc(r.id)}">Run</button>
      <button class="btn ghost" type="button" data-fmtsave="${esc(r.id)}">Save with period</button></div></div>`;
  $("rmFmtList").innerHTML =
    (official.length ? `<div class="rl-sec">Government formats</div><div class="rm-list">${official.map(card).join("")}</div>` :
      `<p class="note">No government formats yet. They appear here once the format tables are set up in Supabase (27_report_maker.sql).</p>`) +
    (other.length ? `<div class="rl-sec">Standard statements and analyses</div><div class="rm-list">${other.map(card).join("")}</div>` : "");
}
$("rmFmtSearch").addEventListener("input", rmDrawFormats);
async function rmRunFormat(id, period, from, to, savedName){
  const r = RM.formats.find(x => x.id === id) || { id, title:id };
  const [f, t] = rmDates(period || "top", from, to);
  loading(true, "Running " + r.title);
  try {
    const d = await rpc("rpt_run_report", { p_id:id, p_params:{ from:f, to:t, fy:S.fy, ...topFilters() } });
    rmRenderSheet({ ...d, title: savedName || d.title || r.title, subtitle: d.subtitle || periodLabel(period || "top", f, t),
      spec:{ type:"format", id, period: period || "top", from, to } });
    $("rmOut").scrollIntoView({ behavior:"smooth", block:"start" });
  } catch(e){ rmRenderSheet({ title:r.title, subtitle:"Could not run: " + e.message, columns:[], rows:[] }); }
  finally { loading(false); }
}
$("rmFmtList").addEventListener("click", e => {
  const b = e.target.closest("[data-fmt]"), s = e.target.closest("[data-fmtsave]");
  const per = $("rmFmtPeriod").value, f = $("rmFmtFrom").value, t = $("rmFmtTo").value;
  if (b) rmRunFormat(b.dataset.fmt, per, f, t);
  if (s) { const r = RM.formats.find(x => x.id === s.dataset.fmtsave) || {};
    rmSaveSpec({ type:"format", id:s.dataset.fmtsave, period:per, from:f, to:t }, `${r.title || "Report"} (${(RM_PERIODS.find(p => p[0] === per) || [])[1] || ""})`); }
});

/* saved reports: shared through Supabase; kept in this browser until the Supabase part is set up */
function localSaved(){ try { return JSON.parse(localStorage.getItem("kofha.maker") || "[]"); } catch(e){ return []; } }
async function rmLoadSaved(){
  try { RM.saved = await rpc("rpt_saved_list"); RM.savedRemote = true; }
  catch(e){ RM.saved = localSaved(); RM.savedRemote = false; }
  $("rmSavedNote").textContent = RM.savedRemote ? "Reports saved by anyone in the finance office. Each one runs with fresh figures for its saved period choice."
    : "Saved in this browser only. Once the Supabase update (27_report_maker.sql) is applied, saved reports are shared with the whole office.";
  const desc = sp => sp.type === "format" ? `Format, ${((RM_PERIODS.find(p => p[0] === sp.period) || [])[1] || "").toLowerCase()}`
    : (() => { const T = RM_TOPICS.find(t => t.id === sp.topic) || {}; return `${T.label || ""}, ${((RM_PERIODS.find(p => p[0] === sp.period) || [])[1] || "").toLowerCase()}`; })();
  $("rmSavedList").innerHTML = RM.saved.length ? RM.saved.map((x, i) => `<div class="rm-item"><h4>${esc(x.name)}</h4>
      <p>${esc(desc(x.spec || {}))}${x.created_by ? `<br><small class="mini">by ${esc(x.created_by)}</small>` : ""}</p>
      <div class="acts"><button class="btn" type="button" data-run="${i}">Run</button>${(x.spec || {}).type === "maker" ? `<button class="btn ghost" type="button" data-edit="${i}">Change</button>` : ""}<button class="btn ghost" type="button" data-del="${i}">Delete</button></div></div>`).join("")
    : `<p class="note">Nothing saved yet. Make a report and press "Save this report".</p>`;
}
$("rmSavedList").addEventListener("click", async e => {
  const b = e.target.closest("[data-run],[data-edit],[data-del]"); if (!b) return;
  const act = b.dataset.run !== undefined ? "run" : b.dataset.edit !== undefined ? "edit" : "del";
  const x = RM.saved[+b.dataset[act]]; if (!x) return; const sp = x.spec || {};
  if (act === "run") { if (sp.type === "format") rmRunFormat(sp.id, sp.period, sp.from, sp.to, x.name); else rmRun(sp, x.name); }
  if (act === "edit") { rmApply(sp); rmMode("make"); }
  if (act === "del") { if (!confirm(`Delete the saved report "${x.name}"?`)) return;
    if (RM.savedRemote && x.id != null) { try { await rpc("rpt_saved_delete", { p_id:x.id }); } catch(err){ alert(err.message); } }
    else { const l = localSaved().filter(y => y.name !== x.name); try { localStorage.setItem("kofha.maker", JSON.stringify(l)); } catch(err){} }
    rmLoadSaved(); }
});
async function rmSaveSpec(spec, suggested){
  const name = prompt("Name for this report (others in the office will see it):", suggested || ""); if (!name) return;
  try { await rpc("rpt_saved_save", { p_name:name, p_kind: spec.type, p_spec: spec }); }
  catch(e){ const l = localSaved().filter(y => y.name !== name); l.push({ name, kind:spec.type, spec }); try { localStorage.setItem("kofha.maker", JSON.stringify(l)); } catch(err){} }
  rmMode("saved");
}
$("rmSave").addEventListener("click", () => { if (RM.last && RM.last.spec) rmSaveSpec(RM.last.spec, RM.last.title); });

function initMaker(d){
  RM.formats = (d && d.list) || [];
  if (!$("rmTopics").children.length) { rmFmtPeriodFill(); rmDraw(); }
  rmDrawFormats();
}

async function loadModule(t){
  const mod = MODULES[t]; const k = mod.key();
  if (M[t] && MKEY[t] === k) { mod.render(M[t]); return; }
  loading(true, "Loading " + (TITLES[t] || "").toLowerCase());
  try { M[t] = await mod.load(); MKEY[t] = k; if (S.tab === t) mod.render(M[t]); }
  catch(e){ if (e.message !== "signed out") alert("Could not load " + (TITLES[t] || t) + ".\n\n" + e.message); }
  finally { loading(false); }
}
document.addEventListener("click", e => { const b = e.target.closest("[data-mexport]"); if (!b) return; const k = b.dataset.mexport;
  if (EXPORTS[k]) downloadCsv(EXPORTS[k], "KoFHA_" + k); });
$("prSearch").addEventListener("input", () => M.payroll && MODULES.payroll.render(M.payroll));
$("prGrade").addEventListener("change", () => M.payroll && MODULES.payroll.render(M.payroll));
