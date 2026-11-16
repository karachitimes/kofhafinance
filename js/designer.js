/* ----- Report designer ----- */
const DZ = { meta:null, id:null, spec:null, last:null };
const DZ_AGG = [["","No total (group)"],["sum","Sum"],["avg","Average"],["min","Smallest"],["max","Largest"],["count","Count"],["distinct","Count different"]];
const DZ_FMT = [["","Auto"],["money","Money"],["number","Number"],["count","Whole number"],["pct","Percent"],["date","Date"],["text","Text"]];
const DZ_OPS = [["eq","is"],["ne","is not"],["contains","contains"],["not_contains","does not contain"],["starts","starts with"],["in","is one of (a, b, c)"],
  ["gt","greater than"],["gte","at least"],["lt","less than"],["lte","at most"],["empty","is empty"],["not_empty","is filled"],["yes","is Yes"],["no","is No"]];
const dzNoValue = op => ["empty","not_empty","yes","no"].includes(op);
function dzSrc(){ return ((DZ.meta || {}).sources || []).find(s => s.rel === DZ.spec.source) || null; }
// every field the design may use: f.col from the source, j1.col ... from the linked tables
function dzFields(){
  const src = dzSrc(); if (!src) return [];
  const out = src.columns.map(c => ({ ref:"f." + c.col, label:c.label, type:c.type, group:src.label }));
  (DZ.spec.joins || []).forEach((j, i) => { const jn = (src.joins || []).find(x => x.rel === j.rel); if (!jn) return;
    jn.columns.forEach(c => out.push({ ref:`j${i + 1}.` + c.col, label:c.label, type:c.type, group:jn.to_label })); });
  return out;
}
const dzField = ref => dzFields().find(f => f.ref === ref);
function dzFieldOpts(sel, filterFn){
  const groups = {}; dzFields().filter(f => !filterFn || filterFn(f)).forEach(f => (groups[f.group] = groups[f.group] || []).push(f));
  return `<option value="">— choose —</option>` + Object.entries(groups).map(([g, fs]) => `<optgroup label="${esc(g)}">${fs.map(f => `<option value="${esc(f.ref)}"${f.ref === sel ? " selected" : ""}>${esc(f.label)}</option>`).join("")}</optgroup>`).join("");
}
const dzOpts = (list, v) => list.map(([k, l]) => `<option value="${k}"${k === (v || "") ? " selected" : ""}>${esc(l)}</option>`).join("");
function dzColLabels(onlyNumbers){ return (DZ.spec.columns || []).filter(c => !onlyNumbers || c.expr || c.agg || (dzField(c.ref) || {}).type === "n" || c.ref === "*").map(c => c.label).filter(Boolean); }
function dzBlank(){ return { title:"", section:"My reports", description:"", published:false,
  spec:{ source:(((DZ.meta || {}).sources || [])[0] || {}).rel || "", joins:[], columns:[], filters:[], sort:[], totals:true, subtotals:false } }; }
function dzLoad(d){
  DZ.id = d.id || null; DZ.spec = JSON.parse(JSON.stringify(d.spec || {}));
  ["joins","columns","filters","sort"].forEach(k => DZ.spec[k] = DZ.spec[k] || []);
  $("dzTitle").value = d.title || ""; $("dzSection").value = d.section || "My reports"; $("dzDesc").value = d.description || "";
  $("dzPublished").checked = !!d.published; $("dzLimit").value = DZ.spec.limit || "";
  $("dzSubtot").checked = !!DZ.spec.subtotals; $("dzTotals").checked = DZ.spec.totals !== false; $("dzChart").checked = !!DZ.spec.chart;
  $("dzNotes").value = (Array.isArray(DZ.spec.notes) ? DZ.spec.notes : DZ.spec.notes ? [DZ.spec.notes] : []).join("\n");
  $("dzSheet").innerHTML = `<p class="mini">Press Preview to see the report.</p>`; DZ.last = null;
  dzDraw();
}
function dzDraw(){
  const m = DZ.meta, sp = DZ.spec; if (!m || !sp) return;
  $("dzSource").innerHTML = ["dataset","table"].map(k => `<optgroup label="${k === "dataset" ? "Ready-made datasets" : "Tables sent from Excel"}">` +
    m.sources.filter(s => s.kind === k).map(s => `<option value="${esc(s.rel)}"${s.rel === sp.source ? " selected" : ""}>${esc(s.label)}</option>`).join("") + `</optgroup>`).join("");
  const src = dzSrc();
  $("dzSourceNote").textContent = src ? (src.note || (src.kind === "table" ? `Excel table ${src.label}, ${src.columns.length} columns.` : "")) : "Choose a table.";
  const js = (src && src.joins) || [];
  $("dzJoins").innerHTML = js.length ? `<div class="dz-joins"><div class="mini" style="margin:6px 0 2px;font-weight:700">Also bring columns from (linked tables)</div>` +
    js.map(j => `<label class="inline"><input type="checkbox" data-join="${esc(j.rel)}"${sp.joins.some(x => x.rel === j.rel) ? " checked" : ""}> ${esc(j.to_label)} <span class="mini">— ${esc(j.purpose || "")}</span></label>`).join("") + `</div>` : "";
  // columns
  $("dzCols").innerHTML = sp.columns.map((c, i) => {
    const kind = c.expr !== undefined ? "formula" : c.ref === "*" ? "count" : "col";
    const nums = dzColLabels(true).filter(l => l !== c.label);
    const head = kind === "formula" ? `<label class="s6"><span class="tag">Formula</span><input type="text" data-c="${i}" data-f="expr" value="${esc(c.expr || "")}" placeholder="[Received] - [Total LPS]">
        <div class="chips">${nums.map(l => `<button type="button" class="chip" data-ins="${i}" data-l="${esc(l)}">${esc(l)}</button>`).join("")}</div></label>`
      : kind === "count" ? `<label class="s6"><span class="tag">Number of records</span><input type="text" value="Counts the rows in each group" disabled></label>`
      : `<label class="s6">Field<select data-c="${i}" data-f="ref">${dzFieldOpts(c.ref)}</select></label>`;
    return `<div class="dz-item">${head}<div class="tools"><button type="button" data-mv="${i}" data-d="-1" title="Move up">↑</button><button type="button" data-mv="${i}" data-d="1" title="Move down">↓</button><button type="button" data-rm="columns" data-i="${i}" title="Remove">✕</button></div>
      <label class="s2">Heading<input type="text" data-c="${i}" data-f="label" value="${esc(c.label || "")}"></label>
      ${kind === "col" ? `<label class="s2">Total<select data-c="${i}" data-f="agg">${dzOpts(DZ_AGG, c.agg)}</select></label>` : `<span class="s2"></span>`}
      <label class="s2">Format<select data-c="${i}" data-f="fmt">${dzOpts(DZ_FMT, c.fmt)}</select></label></div>`; }).join("") || `<p class="mini">No columns yet.</p>`;
  // filters
  const outCols = sp.columns.map(c => c.label).filter(Boolean);
  $("dzFilters").innerHTML = sp.filters.map((f, i) => {
    const target = f.col ? "col:" + f.col : (f.ref || "");
    const opts = dzFieldOpts(f.ref) + (outCols.length ? `<optgroup label="Columns of this report">${outCols.map(l => `<option value="col:${esc(l)}"${("col:" + l) === target ? " selected" : ""}>${esc(l)}</option>`).join("")}</optgroup>` : "");
    return `<div class="dz-item"><label class="s4">Field<select data-flt="${i}" data-f="target">${opts}</select></label>
      <label class="s2">Condition<select data-flt="${i}" data-f="op">${dzOpts(DZ_OPS, f.op || "eq")}</select></label>
      <div class="tools"><button type="button" data-rm="filters" data-i="${i}" title="Remove">✕</button></div>
      ${dzNoValue(f.op) ? `<span class="s2"></span>` : `<label class="s2">${f.ask ? "Default (optional)" : "Value"}<input type="text" data-flt="${i}" data-f="value" value="${esc(f.value || "")}"></label>`}
      <label class="s2" style="flex-direction:row;align-items:center;gap:6px;padding-bottom:8px"><input type="checkbox" data-flt="${i}" data-f="ask"${f.ask ? " checked" : ""}> Ask when run</label>
      ${f.ask ? `<label class="s2">Box label<input type="text" data-flt="${i}" data-f="label" value="${esc(f.label || "")}" placeholder="e.g. Utility"></label>
        ${f.ref ? `<label class="s6" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-flt="${i}" data-f="options"${f.options ? " checked" : ""}> Offer a drop-down of the values in this column</label>` : ""}` : `<span class="s2"></span>`}
    </div>`; }).join("") || `<p class="mini">No filters: every record is used.</p>`;
  // period and sort
  $("dzPeriod").innerHTML = `<option value="">Not by period (all dates)</option>` + dzFields().filter(f => f.type === "d").map(f => `<option value="${esc(f.ref)}"${f.ref === ((sp.period || {}).ref || "") ? " selected" : ""}>${esc(f.group)} › ${esc(f.label)}</option>`).join("");
  $("dzSort").innerHTML = sp.sort.map((o, i) => `<div class="dz-item"><label class="s4">Sort by<select data-srt="${i}" data-f="col"><option value="">— choose —</option>${outCols.map(l => `<option${l === o.col ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <label class="s2">Order<select data-srt="${i}" data-f="dir">${dzOpts([["asc","A to Z / smallest first"],["desc","Z to A / largest first"]], o.dir || "asc")}</select></label>
      <div class="tools"><button type="button" data-rm="sort" data-i="${i}" title="Remove">✕</button></div></div>`).join("");
  const can = !!m.can_edit;
  document.querySelectorAll("#p-designer .dz-build input, #p-designer .dz-build select, #p-designer .dz-build textarea, #p-designer .dz-build button").forEach(el => {
    if (!["dzPreview","dzPrint","dzExcel"].includes(el.id)) el.disabled = !can; });
  $("dzState").innerHTML = DZ.id ? `<span class="pill${$("dzPublished").checked ? "" : " warn"}">${$("dzPublished").checked ? "Published" : "Draft"}</span> saved as <code>design:${esc(DZ.id)}</code>` : `<span class="pill warn">New, not saved</span>`;
}
function dzCollect(){
  const sp = DZ.spec;
  sp.limit = /^\d+$/.test($("dzLimit").value.trim()) ? Number($("dzLimit").value.trim()) : undefined;
  sp.subtotals = $("dzSubtot").checked; sp.totals = $("dzTotals").checked;
  const notes = $("dzNotes").value.split("\n").map(x => x.trim()).filter(Boolean); sp.notes = notes.length ? notes : undefined;
  const keys = sp.columns.filter(c => c.ref && c.ref !== "*" && !c.agg && c.expr === undefined), tot = sp.columns.filter(c => c.agg || c.expr !== undefined);
  sp.chart = $("dzChart").checked && keys.length && tot.length ? { type:"bar", label:keys[0].label, series:[tot[0].label] } : undefined;
  sp.title = $("dzTitle").value.trim() || undefined;
  return { id:DZ.id, title:$("dzTitle").value.trim(), section:$("dzSection").value.trim() || "My reports", description:$("dzDesc").value.trim(), published:$("dzPublished").checked, spec:JSON.parse(JSON.stringify(sp)) };
}
function dzRename(oldL, newL){
  if (!oldL || oldL === newL) return; const sp = DZ.spec, esc2 = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  sp.columns.forEach(c => { if (c.expr) c.expr = c.expr.replace(new RegExp("\\[\\s*" + esc2(oldL) + "\\s*\\]", "gi"), "[" + newL + "]"); });
  sp.filters.forEach(f => { if (f.col === oldL) f.col = newL; }); sp.sort.forEach(o => { if (o.col === oldL) o.col = newL; });
  if (sp.chart) { if (sp.chart.label === oldL) sp.chart.label = newL; sp.chart.series = (sp.chart.series || []).map(x => x === oldL ? newL : x); }
}
$("p-designer").addEventListener("change", e => {
  const el = e.target, sp = DZ.spec; if (!sp) return;
  if (el.id === "dzSource") { if (sp.columns.length && !confirm("Start from another table? The columns, filters and sort chosen so far are cleared.")) { dzDraw(); return; }
    Object.assign(sp, { source:el.value, joins:[], columns:[], filters:[], sort:[], period:undefined }); dzDraw(); return; }
  if (el.dataset.join) { if (el.checked) { if (sp.joins.length >= 3) { alert("At most 3 linked tables."); el.checked = false; return; } sp.joins.push({ rel:el.dataset.join }); }
    else { const k = sp.joins.findIndex(j => j.rel === el.dataset.join), alias = "j" + (k + 1);
      if (sp.columns.some(c => (c.ref || "").startsWith(alias + ".")) || sp.filters.some(f => (f.ref || "").startsWith(alias + "."))) { alert("Remove the columns and filters that use this table first."); el.checked = true; return; }
      sp.joins.splice(k, 1); }
    dzDraw(); return; }
  if (el.dataset.c !== undefined) { const c = sp.columns[+el.dataset.c], f = el.dataset.f;
    if (f === "label") { dzRename(c.label, el.value.trim()); c.label = el.value.trim(); }
    else if (f === "ref") { const fd = dzField(el.value); const auto = !c.label || (dzField(c.ref) || {}).label === c.label; c.ref = el.value; if (fd && auto) { dzRename(c.label, fd.label); c.label = fd.label; } }
    else if (el.value) c[f] = el.value; else delete c[f];
    dzDraw(); return; }
  if (el.dataset.flt !== undefined) { const fl = sp.filters[+el.dataset.flt], f = el.dataset.f;
    if (f === "target") { delete fl.ref; delete fl.col; if (el.value.startsWith("col:")) fl.col = el.value.slice(4); else if (el.value) fl.ref = el.value; delete fl.options; }
    else if (f === "ask" || f === "options") fl[f] = el.checked || undefined;
    else fl[f] = el.value.trim() || undefined;
    dzDraw(); return; }
  if (el.dataset.srt !== undefined) { sp.sort[+el.dataset.srt][el.dataset.f] = el.value; return; }
  if (el.id === "dzPeriod") { sp.period = el.value ? { ref:el.value } : undefined; return; }
  if (el.id === "dzPublished") dzDraw();
});
$("p-designer").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || !DZ.spec) return; const sp = DZ.spec;
  if (b.dataset.add) {
    if (b.dataset.add === "col") sp.columns.push({ ref:"", label:"" });
    if (b.dataset.add === "formula") sp.columns.push({ expr:"", label:"Formula " + (sp.columns.filter(c => c.expr !== undefined).length + 1), fmt:"money" });
    if (b.dataset.add === "count") sp.columns.push({ ref:"*", agg:"count", label:"Number of records", fmt:"count" });
    if (b.dataset.add === "filter") sp.filters.push({ op:"eq" });
    if (b.dataset.add === "sort") sp.sort.push({ col:"", dir:"asc" });
    dzDraw(); return; }
  if (b.dataset.rm) { sp[b.dataset.rm].splice(+b.dataset.i, 1); dzDraw(); return; }
  if (b.dataset.mv) { const i = +b.dataset.mv, j = i + Number(b.dataset.d); if (j < 0 || j >= sp.columns.length) return;
    [sp.columns[i], sp.columns[j]] = [sp.columns[j], sp.columns[i]]; dzDraw(); return; }
  if (b.dataset.ins !== undefined) { const c = sp.columns[+b.dataset.ins]; c.expr = ((c.expr || "").trim() + " [" + b.dataset.l + "]").trim(); dzDraw(); return; }
});
async function dzPreview(){
  const d = dzCollect(); if (!d.spec.columns.length) { alert("Add at least one column."); return; }
  loading(true, "Making the preview");
  try { const r = await rpc("rpt_design_preview", { p_spec:d.spec, p_params:{ from:S.from, to:S.to, fy:S.fy, ...topFilters() } });
    DZ.last = { ...r, title: d.title || r.title };
    $("dzSheet").innerHTML = sheetHtml(DZ.last); $("dzPrevNote").textContent = `Preview for ${fmtDate(S.from)} to ${fmtDate(S.to)} (top bar). Inputs marked "Ask" use their default here.`;
  } catch(e){ $("dzSheet").innerHTML = `<p class="mini" style="color:var(--bad,#b42318)">${esc(e.message.replace(/^DESIGN:\s*/, ""))}</p>`; }
  finally { loading(false); }
}
async function dzSave(){
  const d = dzCollect(); if (!d.title) { alert("Give the report a title first."); $("dzTitle").focus(); return; }
  loading(true, "Saving");
  try { const r = await rpc("rpt_design_save", { p:d }); DZ.id = r.design_id;
    M.designer = null; MKEY.designer = null; M.reports = null; MKEY.reports = null;
    DZ.meta = await rpc("rpt_design_meta"); dzFillOpen(); dzDraw();
    $("dzState").insertAdjacentHTML("beforeend", d.published ? " — it is now in the Report library under " + esc(d.section) + "." : " — saved as a draft (only designers see it).");
  } catch(e){ alert("Could not save.\n\n" + e.message.replace(/^DESIGN:\s*/, "")); }
  finally { loading(false); }
}
function dzFillOpen(){
  const ds = (DZ.meta || {}).designs || [];
  $("dzOpen").innerHTML = `<option value="">— choose a saved report —</option>` + Object.entries(ds.reduce((a, d) => ((a[d.section] = a[d.section] || []).push(d), a), {}))
    .map(([sec, list]) => `<optgroup label="${esc(sec)}">${list.map(d => `<option value="${esc(d.id)}"${d.id === DZ.id ? " selected" : ""}>${esc(d.title)}${d.published ? "" : " (draft)"}</option>`).join("")}</optgroup>`).join("");
  $("dzSections").innerHTML = ((DZ.meta || {}).sections || []).map(x => `<option value="${esc(x)}">`).join("");
}
$("dzOpen").addEventListener("change", () => { const d = ((DZ.meta || {}).designs || []).find(x => x.id === $("dzOpen").value); if (d) dzLoad(d); });
$("dzNew").addEventListener("click", () => { dzLoad(dzBlank()); $("dzOpen").value = ""; });
$("dzPreview").addEventListener("click", dzPreview);
$("dzSave").addEventListener("click", dzSave);
$("dzPrint").addEventListener("click", () => DZ.last ? printOfficial({ ...DZ.last, subtitle: DZ.last.subtitle || `${fmtDate(S.from)} to ${fmtDate(S.to)}` }) : alert("Press Preview first."));
$("dzExcel").addEventListener("click", () => { const d = DZ.last; if (!d) { alert("Press Preview first."); return; }
  const cols = d.columns || []; downloadCsv([cols.map(c => c.label)].concat((d.rows || []).map(r => cols.map(c => r[c.key] ?? ""))), "KoFHA_" + (d.title || "report").replace(/\W+/g, "_")); });
$("dzDelete").addEventListener("click", async () => {
  if (!DZ.id) { dzLoad(dzBlank()); return; }
  if (!confirm("Delete the report \"" + $("dzTitle").value + "\"? It is removed from the Report library too.")) return;
  try { await rpc("rpt_design_delete", { p_id:DZ.id }); M.reports = null; MKEY.reports = null; DZ.meta = await rpc("rpt_design_meta"); dzLoad(dzBlank()); dzFillOpen(); }
  catch(e){ alert("Could not delete.\n\n" + e.message); } });
function renderDesigner(m){
  DZ.meta = m; dzFillOpen();
  $("dzReadOnly").style.display = m.can_edit ? "none" : "";
  $("dzReadOnly").textContent = m.can_edit ? "" : "This login can open and preview designs but cannot change them: only logins that may push from Excel can design reports. Published designs run from the Report library.";
  if (!DZ.spec) { const first = (m.designs || [])[0]; dzLoad(first || dzBlank()); } else dzDraw();
}
/* ----- Report lines (I&E / balance-sheet line mapping) ----- */
const LN = { kind:"ie", data:null };
function lnLabel(l){ return (l.section || "(no section)") + "  ›  " + l.line; }
function renderLines(d){
  LN.data = d; const q = $("lnFind").value.trim().toLowerCase(), open = $("lnOpen").checked, ed = d.can_edit;
  const lines = d.lines || [], accts = d.accounts || [];
  const opts = (cur) => `<option value="">Move to line…</option>` + Object.entries(lines.reduce((a, l) => ((a[l.section || ""] = a[l.section || ""] || []).push(l), a), {}))
      .map(([sec, ls]) => `<optgroup label="${esc(sec || "(no section)")}">${ls.map(l => `<option value="${esc(JSON.stringify([l.section, l.line]))}"${cur && cur.line === l.line && cur.section === l.section ? " disabled" : ""}>${esc(l.line)}</option>`).join("")}<option value="${esc(JSON.stringify([sec, "__new__"]))}">+ New line in this section…</option></optgroup>`).join("");
  const acctRows = list => `<div class="tscroll" style="box-shadow:none;border-radius:0 0 var(--r-m) var(--r-m);border-left:0;border-right:0;border-bottom:0"><table><thead><tr><th class="txt" style="text-align:left">Account head</th><th class="txt" style="text-align:left">COA parent group</th><th class="txt" style="text-align:left">Revenue head / sub heads</th><th class="txt" style="text-align:left">Function</th><th>Net (Dr − Cr)</th><th class="txt" style="text-align:left">Placed by</th>${ed ? `<th class="txt" style="text-align:left">Move</th>` : ""}</tr></thead><tbody>` +
    list.map(a => `<tr data-acc="${esc(a.account)}"><td class="txt"><b>${esc(a.account)}</b></td><td class="txt">${esc(a.parent_group || "")}</td>
      <td class="txt">${esc([a.revenue_heads, a.sub_head1, a.sub_head2].filter(Boolean).join(" / "))}</td><td class="txt">${esc(a.function_code || "")}${a.group ? `<br><small class="mini">${esc(a.group)}</small>` : ""}</td>
      <td>${money(a.amount, { full:true })}</td>
      <td class="txt">${!a.line && a.utility_role ? `Utility fund: ${esc(a.utility_role)}<br>` : ""}${d.from_coa ? (a.roles ? `COA · Report Role: ${esc(a.roles)}` : "COA (no Report Role)") : a.source === "override" ? `Own setting${ed ? ` <button type="button" class="ln-reset" data-reset="1">Back to its group</button>` : ""}` : a.source === "unmapped" ? "Not placed" : "COA group rule"}</td>
      ${ed ? `<td class="txt"><div class="ln-move"><select data-to="1">${opts(a)}</select><select data-scope="1"><option value="move_account">this head only</option>${a.source && a.source.startsWith("rule") ? `<option value="move_group">its whole COA group</option>` : ""}</select><button type="button" data-move="1">Move</button></div></td>` : ""}</tr>`).join("") + `</tbody></table></div>`;
  const match = (l, list) => !q || (l.line || "").toLowerCase().includes(q) || (l.section || "").toLowerCase().includes(q) || list.some(a => (a.account + " " + (a.function_code || "") + " " + (a.parent_group || "")).toLowerCase().includes(q));
  let html = "";
  const un = accts.filter(a => !a.line);
  if (un.length && (!q || un.some(a => a.account.toLowerCase().includes(q))))
    html += `<details class="ln-line ln-unmapped"${open ? " open" : ""}><summary><span class="pill warn">${un.length}</span><b>Account heads not on any line</b><span class="meta">${un.every(a => a.utility_role) ? "utility pass-through: shown in the utility fund" : "utility pass-through or not placed yet"}</span><span class="amt">${money(un.reduce((s, a) => s + Number(a.amount || 0), 0), { full:true })}</span></summary>${acctRows(un)}</details>`;
  let lastSec = null;
  lines.forEach(l => {
    const list = accts.filter(a => a.line === l.line && (a.section || null) === (l.section || null));
    if (!match(l, list)) return;
    if (l.section !== lastSec) { html += `<h3 class="ln-sec">${esc(l.section || "(no section)")}</h3>`; lastSec = l.section; }
    html += `<details class="ln-line" data-sec="${esc(l.section || "")}" data-line="${esc(l.line)}"${open || q ? " open" : ""}><summary>
      <input type="text" inputmode="decimal" data-order="1" value="${esc(l.order ?? "")}" title="Order"${ed ? "" : " disabled"}>
      <input type="text" data-name="1" value="${esc(l.line)}" title="Line name"${ed ? "" : " disabled"}>
      <span class="meta">${l.accounts} head${l.accounts === 1 ? "" : "s"}</span><span class="amt">${money(l.amount, { full:true })}</span></summary>${acctRows(list)}</details>`;
  });
  $("lnBody").innerHTML = html || `<p class="mini">Nothing matches.</p>`;
  $("lnNote").textContent = (d.from_coa ? "Every line is a Chart of Accounts heading (I&E: ACCNTTYPE › Parent Group; balance sheet: Account Head › Parent Group). To rename a line or move an account, change the COA in Excel (headings or the Report Role column) and push it. "
      : ed ? "Type in the order or the name and press Enter to change it. " : "This login can look but not change: only logins that may push from Excel can change report lines. ") +
    `Period: ${fmtDate(S.from)} to ${fmtDate(S.to)}.`;
}
async function lnSave(body, msg){
  loading(true, msg || "Saving");
  try { await rpc("rpt_map_save", { p: { kind: LN.kind, ...body } }); M.lines = null; MKEY.lines = null; S.data = null;
    const keep = [...document.querySelectorAll("#lnBody details[open]")].map(x => x.dataset.line);
    await loadModule("lines");
    keep.forEach(l => { const el = [...document.querySelectorAll("#lnBody details")].find(x => x.dataset.line === l); if (el) el.open = true; });
    load();   // the other tabs follow the new lines
  } catch(e){ alert("Could not change it.\n\n" + e.message.replace(/^MAP:\s*/, "")); }
  finally { loading(false); }
}
$("lnBody").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("summary input")) { e.preventDefault(); e.target.blur(); } });
$("lnBody").addEventListener("click", e => { if (e.target.matches("summary input")) e.preventDefault(); });
$("lnBody").addEventListener("change", e => {
  const el = e.target, det = el.closest("details"); if (!det || !el.matches("summary input")) return;
  const sec = det.dataset.sec || null, line = det.dataset.line;
  if (el.dataset.name) { const nv = el.value.trim(); if (!nv || nv === line) { el.value = line; return; }
    if (!confirm(`Rename the line "${line}" to "${nv}"?`)) { el.value = line; return; }
    lnSave({ action:"rename", section:sec, line, new_line:nv }, "Renaming"); }
  if (el.dataset.order) { const v = el.value.trim(); if (!/^-?\d+(\.\d+)?$/.test(v)) { alert("Order must be a number."); return; } lnSave({ action:"order", section:sec, line, order:Number(v) }, "Saving the order"); }
});
$("lnBody").addEventListener("click", e => {
  const tr = e.target.closest("tr[data-acc]"); if (!tr) return; const acc = tr.dataset.acc;
  if (e.target.closest("[data-reset]")) { if (confirm(`Put "${acc}" back on the line of its COA group?`)) lnSave({ action:"reset_account", account:acc }, "Resetting"); return; }
  if (!e.target.closest("[data-move]")) return;
  const to = tr.querySelector("[data-to]").value, scope = tr.querySelector("[data-scope]").value;
  if (!to) { alert("Choose the line to move to."); return; }
  let [sec, line] = JSON.parse(to);
  if (line === "__new__") { line = (prompt(`Name of the new line in "${sec || "(no section)"}":`) || "").trim(); if (!line) return; }
  const what = scope === "move_group" ? `every account head of the COA group of "${acc}"` : `"${acc}"`;
  if (!confirm(`Move ${what} to the line "${line}"?`)) return;
  lnSave({ action:scope, account:acc, section:sec, line }, "Moving");
});
$("lnKind").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; LN.kind = b.dataset.k;
  document.querySelectorAll("#lnKind button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); loadModule("lines"); });
$("lnFind").addEventListener("input", () => LN.data && renderLines(LN.data));
$("lnOpen").addEventListener("change", () => LN.data && renderLines(LN.data));
$("lnPrint").addEventListener("click", async () => { S.tab = "reports"; showTab("reports"); await loadModule("reports"); openReport("report_map"); });
/* ----- Columns screen ----- */
const COLS = { table:null, cls:"", data:null };
const COL_CLASS_HELP = { Pay:"Pay (basic, personal, qualification ...)", Allowance:"Allowance", Deduction:"Deduction from pay",
  CPF:"CPF (deducted; KoFHA pays the same as its share)", Contribution:"KoFHA contribution (not paid to the employee)", Info:"Not a money head (name, grade, totals ...)" };
const colFmt = t => ({ n:"money", d:"date", b:"text", t:"text" })[t] || "text";
const colTypeWord = t => ({ n:"Number", d:"Date", b:"Yes / No", t:"Text" })[t] || t;
function colSnippet(c){ const lbl = (c.report_label || c.excel_col || "").replace(/'/g, "''"); return `kofha.col('${c.pg_col}', '${lbl}', '${colFmt(c.col_type)}')`; }
function renderColumns(d){
  COLS.data = d; COLS.table = d.table;
  $("colTable").innerHTML = (d.tables || []).map(t => `<option value="${esc(t.table)}">${esc(t.table)} — ${t.active} columns${t.retired ? `, ${t.retired} retired` : ""}${t.unclassified ? ` — ${t.unclassified} without pay type` : ""}</option>`).join("");
  $("colTable").value = d.table;
  const cols = d.columns || [];
  const unset = cols.filter(c => d.is_salary && c.active && c.col_type === "n" && !c.pay_class).length;
  $("colClass").style.display = d.is_salary ? "" : "none";
  if (d.is_salary) {
    const counts = {}; cols.filter(c => c.active).forEach(c => { const k = c.pay_class || "(not set)"; counts[k] = (counts[k] || 0) + 1; });
    const keys = ["", "(not set)"].concat(d.classes);
    $("colClass").innerHTML = keys.filter(k => k === "" || counts[k]).map(k => `<button type="button" class="chip" data-cls="${esc(k)}" aria-pressed="${COLS.cls === k}">${k === "" ? "All" : esc(k)}${k ? ` (${counts[k]})` : ""}</button>`).join("");
  }
  $("colInfo").innerHTML =
    `<p><b>${esc(d.table)}</b> is stored in Supabase as <code>kofha.${esc(d.pg_table)}</code> (${nfR.format(d.rows || 0)} rows). Excel reads it back through the view <code>public.${esc(d.view || "")}</code>.</p>` +
    (d.is_salary ? `<p class="mini">Pay types are read by: ${(d.by_type_users || []).map(esc).join("; ")}. A column used this way is not listed under "Used in" because the code reads it by its type, not by its name.</p>` : "") +
    (unset ? `<p><span class="pill warn">${unset} number column${unset === 1 ? "" : "s"} without a pay type</span> These count as an Allowance until you choose a type below.</p>` : "") +
    (d.can_edit ? "" : `<p class="mini">This login can look but not change: only logins that may push from Excel can edit headings and pay types.</p>`) +
    `<p class="mini">"Used in" lists report code that names the column. Before you delete or retire a column in Excel, check that list. To use a column in a report, copy its <code>kofha.col(...)</code> and follow the steps in 43_welfare_add_column_example.sql.</p>`;
  drawColumns();
  $("colIgnored").textContent = (d.ignored || []).length ? "Columns in Excel that are never sent (chosen at push time, or formula columns): " + d.ignored.join(", ") : "";
}
function drawColumns(){
  const d = COLS.data; if (!d) return;
  const q = $("colSearch").value.trim().toLowerCase(), showRet = $("colRetired").checked, ed = d.can_edit ? "" : " disabled";
  const rows = (d.columns || []).filter(c => (showRet || c.active)
    && (!COLS.cls || (COLS.cls === "(not set)" ? !c.pay_class : c.pay_class === COLS.cls))
    && (!q || [c.excel_col, c.pg_col, c.report_label, c.note, c.pay_class].some(v => String(v || "").toLowerCase().includes(q))));
  const sal = d.is_salary;
  const head = `<thead><tr><th>#</th><th class="txt">Excel column</th><th class="txt">Supabase column</th><th class="txt">Type</th><th class="num">Rows filled</th>${sal ? `<th class="txt">Pay type</th>` : ""}<th class="txt">Report heading</th>${sal ? `<th class="txt">Loan account ending</th>` : ""}<th class="txt">Note</th><th class="txt">Used in</th><th class="txt">For report code</th></tr></thead>`;
  const body = rows.map(c => {
    const unset = sal && c.active && c.col_type === "n" && !c.pay_class;
    const opts = `<option value="">${unset ? "— choose —" : "(not set)"}</option>` + d.classes.map(k => `<option value="${k}" title="${esc(COL_CLASS_HELP[k] || k)}"${c.pay_class === k ? " selected" : ""}>${k}</option>`).join("");
    return `<tr data-col="${esc(c.pg_col)}" class="${c.active ? "" : "retired"}${unset ? " unset" : ""}">
      <td>${c.ord ?? ""}</td>
      <td class="txt"><b>${esc(c.excel_col)}</b>${c.active ? "" : ` <span class="pill">retired</span>`}</td>
      <td class="txt"><code>${esc(c.pg_col)}</code></td>
      <td class="txt">${colTypeWord(c.col_type)}</td>
      <td>${c.filled === null || c.filled === undefined ? "" : nfR.format(c.filled)}</td>
      ${sal ? `<td class="txt cls"><select data-f="pay_class"${ed}>${opts}</select></td>` : ""}
      <td class="txt"><input type="text" data-f="report_label" value="${esc(c.report_label || "")}" placeholder="${esc(c.excel_col)}"${ed}></td>
      ${sal ? `<td class="txt">${c.pay_class === "Deduction" || c.loan_suffix ? `<input type="text" data-f="loan_suffix" value="${esc(c.loan_suffix || "")}" placeholder="e.g. :Welfare Loan"${ed}>` : ""}</td>` : ""}
      <td class="txt"><input type="text" data-f="note" value="${esc(c.note || "")}" placeholder="What this column holds"${ed}><span class="saved"></span></td>
      <td class="txt"><div class="used" title="${esc((c.used_in || []).join(", "))}">${(c.used_in || []).slice(0, 4).map(u => `<span>${esc(u)}</span>`).join("") || `<span>—</span>`}${(c.used_in || []).length > 4 ? `<span>+${c.used_in.length - 4} more</span>` : ""}</div></td>
      <td class="txt"><code>${esc(colSnippet(c))}</code><button type="button" class="copy" data-copy="${esc(colSnippet(c))}">Copy</button></td>
    </tr>`; }).join("");
  $("colGrid").innerHTML = head + `<tbody>${body || `<tr><td class="empty" colspan="12">No column matches.</td></tr>`}</tbody>`;
  EXPORTS.columns = [["Order", "Excel column", "Supabase column", "Type", "Active", "Rows filled", "Pay type", "Report heading", "Loan account ending", "Note", "Used in", "For report code"]]
    .concat((d.columns || []).map(c => [c.ord, c.excel_col, c.pg_col, colTypeWord(c.col_type), c.active ? "Yes" : "Retired", c.filled, c.pay_class || "", c.report_label || "", c.loan_suffix || "", c.note || "", (c.used_in || []).join(", "), colSnippet(c)]));
}
async function saveColumn(tr, field, value){
  const pg = tr.dataset.col, mark = tr.querySelector(".saved");
  mark.textContent = " saving…";
  try {
    const r = await rpc("rpt_column_save", { p: { table: COLS.table, pg_col: pg, [field]: value } });
    const c = (COLS.data.columns || []).find(x => x.pg_col === pg); if (c && r && r.saved) Object.assign(c, { report_label: r.saved.report_label, pay_class: r.saved.pay_class, loan_suffix: r.saved.loan_suffix, note: r.saved.note });
    M.columns = null; MKEY.columns = null;   // counts in the table list may change
    if (field === "pay_class") renderColumns(COLS.data);
    const m2 = document.querySelector(`#colGrid tr[data-col="${CSS.escape(pg)}"] .saved`);
    if (m2) m2.textContent = " saved" + (r && r.also_set_in_other_salary_table ? " (also in the other salary table)" : "");
  } catch(e){ mark.textContent = ""; alert("Could not save.\n\n" + e.message); }
}
$("colGrid").addEventListener("change", e => { const el = e.target.closest("[data-f]"); if (!el) return; saveColumn(el.closest("tr"), el.dataset.f, el.value); });
$("colGrid").addEventListener("click", async e => { const b = e.target.closest("[data-copy]"); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; } catch(_) { b.textContent = "Select it"; }
  setTimeout(() => { b.textContent = "Copy"; }, 1500); });
$("colTable").addEventListener("change", () => { COLS.table = $("colTable").value; COLS.cls = ""; $("colSearch").value = ""; loadModule("columns"); });
$("colSearch").addEventListener("input", drawColumns);
$("colRetired").addEventListener("change", drawColumns);
$("colClass").addEventListener("click", e => { const b = e.target.closest("[data-cls]"); if (!b) return; COLS.cls = b.dataset.cls;
  document.querySelectorAll("#colClass .chip").forEach(x => x.setAttribute("aria-pressed", String(x === b))); drawColumns(); });
$("colExport").addEventListener("click", () => EXPORTS.columns && downloadCsv(EXPORTS.columns, "KoFHA_columns_" + (COLS.table || "")));
/* ----- filter builder (used by Transactions, Data explorer and Analysis) ----- */
const FB = {};
const OPS = [["contains","contains"],["equals","is"],["not_equals","is not"],["not_contains","does not contain"],["starts","starts with"],
             ["gte","≥"],["lte","≤"],["gt",">"],["lt","<"],["not_empty","is filled"],["empty","is empty"]];
function fb(id, getCols, onApply){
  const box = $(id); const state = { rows: [] };
  const draw = () => {
    const cols = getCols() || [];
    box.innerHTML = state.rows.map((r, i) => `<div class="fb-row" data-i="${i}">
      <select data-k="col" aria-label="Column">${cols.map(c => `<option ${c.name === r.col ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select>
      <select data-k="op" aria-label="Condition">${OPS.map(([v, l]) => `<option value="${v}" ${v === r.op ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input data-k="value" aria-label="Value" value="${esc(r.value || "")}" ${r.op === "empty" || r.op === "not_empty" ? "disabled" : ""} placeholder="value (dates as 2025-07-31)">
      <button type="button" class="x" data-del="${i}" title="Remove">✕</button></div>`).join("") +
      `<div class="fb-row"><button type="button" class="linkish" data-add>+ Add a condition</button>${state.rows.length ? `<button type="button" class="btn" data-apply style="min-height:34px">Apply filters</button>` : ""}</div>`;
  };
  box.addEventListener("click", e => {
    if (e.target.closest("[data-add]")) { const c = (getCols() || [])[0]; state.rows.push({ col: c ? c.name : "", op:"contains", value:"" }); draw(); }
    const del = e.target.closest("[data-del]"); if (del) { state.rows.splice(+del.dataset.del, 1); draw(); onApply && onApply(); }
    if (e.target.closest("[data-apply]")) onApply && onApply();
  });
  box.addEventListener("change", e => { const row = e.target.closest("[data-i]"); if (!row) return; const r = state.rows[+row.dataset.i]; r[e.target.dataset.k] = e.target.value; if (e.target.dataset.k === "op") draw(); });
  box.addEventListener("input", e => { const row = e.target.closest("[data-i]"); if (!row || e.target.dataset.k !== "value") return; state.rows[+row.dataset.i].value = e.target.value; });
  box.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.dataset.k === "value") { e.preventDefault(); onApply && onApply(); } });
  FB[id] = { get: () => state.rows.filter(r => r.col && (r.op === "empty" || r.op === "not_empty" || String(r.value).trim() !== "")).map(r => ({ col:r.col, op:r.op, value:r.value })),
             set: (rows) => { state.rows = (rows || []).map(r => ({ ...r })); draw(); }, reset: () => { state.rows = []; draw(); } };
  draw();
}

/* ----- analysis builder ----- */
const PRESETS = [
  { name:"Expenditure by report line", ds:"Ledger", g1:"Report line", time:"", measure:"Expenditure", agg:"sum", limit:"15", filters:[{col:"Expenditure",op:"gt",value:"0"}] },
  { name:"Expenditure by line, month by month", ds:"Ledger", g1:"Report line", time:"month", measure:"Expenditure", agg:"sum", limit:"15", filters:[{col:"Expenditure",op:"gt",value:"0"}] },
  { name:"Top payees", ds:"Ledger", g1:"Pay to", time:"", measure:"Payments", agg:"sum", limit:"15", filters:[{col:"Pay to",op:"not_empty",value:""}] },
  { name:"Spending by function group and quarter", ds:"Ledger", g1:"Function group", time:"quarter", measure:"Expenditure", agg:"sum", limit:"50", filters:[{col:"Statement",op:"equals",value:"Income Statement"}] },
  { name:"Income by section, month by month", ds:"Ledger", g1:"Report section", time:"month", measure:"Income", agg:"sum", limit:"15", filters:[{col:"Income",op:"gt",value:"0"}] },
  { name:"Payments by bank and tag", ds:"Ledger", g1:"Bank", g2:"Tag (Bill No. Engg.)", time:"", measure:"Payments", agg:"sum", limit:"50", filters:[] },
  { name:"Salary bill by grade", ds:"payroll_txn", g1:"Grade", time:"", measure:"Total Pay & Allow.", agg:"sum", limit:"50", filters:[{col:"Name of Employee",op:"not_empty",value:""}], period:false },
  { name:"Budget by type and year", ds:"budget_txn", g1:"BudgetType", time:"fy", measure:"Amount", agg:"sum", limit:"50", filters:[], period:false },
];
let DS = [];
function dsCols(){ return ((DS.find(d => d.dataset === $("anDs").value) || {}).columns) || []; }
function fillAnalysisSelects(){
  const cols = dsCols(), nums = cols.filter(c => c.type === "n"), dims = cols.filter(c => c.type !== "n" || /id$|code|no$/i.test(c.name));
  const opt = (list, blank) => (blank ? `<option value="">${blank}</option>` : "") + list.map(c => `<option>${esc(c.name)}</option>`).join("");
  $("anG1").innerHTML = opt(cols, "Nothing (one total)"); $("anG2").innerHTML = opt(cols, "Nothing");
  $("anMeasure").innerHTML = `<option value="">Number of rows</option>` + opt(nums);
  const ds = DS.find(d => d.dataset === $("anDs").value) || {};
  $("anTime").disabled = !ds.date_column; if (!ds.date_column) $("anTime").value = "";
  if (FB.anFb) FB.anFb.reset();
}
const LESSONS = [
  { t:"1. One total. Leave Group by empty: you get one number, the total expenditure for the period.", v:{ ds:"Ledger", g1:"", time:"", measure:"Expenditure", agg:"sum", limit:"15", filters:[] } },
  { t:"2. Rows. Group by Report line: the same total, split into lines (like dragging a field into Rows).", v:{ ds:"Ledger", g1:"Report line", time:"", measure:"Expenditure", agg:"sum", limit:"15", filters:[{col:"Expenditure",op:"gt",value:"0"}] } },
  { t:"3. Columns. Set Across to Month: each line now has one column per month (like Columns in a pivot).", v:{ ds:"Ledger", g1:"Report line", time:"month", measure:"Expenditure", agg:"sum", limit:"15", filters:[{col:"Expenditure",op:"gt",value:"0"}] } },
  { t:"4. A slicer. Add the filter 'Function group is ERE': only ERE spending remains.", v:{ ds:"Ledger", g1:"Report line", time:"quarter", measure:"Expenditure", agg:"sum", limit:"15", filters:[{col:"Function group",op:"equals",value:"ERE"}] } },
  { t:"5. Another measure. Top payees: Group by Pay to, measure Payments, top 15.", v:{ ds:"Ledger", g1:"Pay to", time:"", measure:"Payments", agg:"sum", limit:"15", filters:[{col:"Pay to",op:"not_empty",value:""}] } },
  { t:"6. Count and average. Payments by bank: As = Number of rows, then try Average.", v:{ ds:"Ledger", g1:"Bank", time:"", measure:"Payments", agg:"count", limit:"15", filters:[{col:"Payments",op:"gt",value:"0"}] } },
  { t:"7. Another table. Data = payroll_txn, Group by Grade, measure Total Pay & Allow.: the salary bill by grade.", v:{ ds:"payroll_txn", g1:"Grade", time:"", measure:"Total Pay & Allow.", agg:"sum", limit:"50", filters:[{col:"Name of Employee",op:"not_empty",value:""}], period:false } },
  { t:"8. Save it. Press 'Save this view'; it appears in 'My saved views' next time.", v:null },
];
function initAnalysis(d){
  DS = d || [];
  $("anDs").innerHTML = DS.map(x => `<option value="${esc(x.dataset)}">${esc(x.dataset === "Ledger" ? "Ledger (all accounts)" : x.dataset)}</option>`).join("");
  fb("anFb", dsCols, () => runAnalysis());
  fillAnalysisSelects();
  $("anPresets").innerHTML = PRESETS.filter(p => DS.some(x => x.dataset === p.ds)).map((p, i) => `<button class="chip" type="button" data-p="${i}">${esc(p.name)}</button>`).join("");
  loadSaved(); applyView(PRESETS[0]);
  $("anLessons").innerHTML = LESSONS.map((l, i) => `<li>${esc(l.t)} ${l.v ? `<button class="linkish" type="button" data-lesson="${i}">Try it</button>` : ""}</li>`).join("");
}
function currentView(){ return { ds:$("anDs").value, g1:$("anG1").value, g2:$("anG2").value, time:$("anTime").value, measure:$("anMeasure").value,
  agg:$("anAgg").value, limit:$("anLimit").value, filters: FB.anFb ? FB.anFb.get() : [], period:$("anPeriod").checked }; }
function applyView(v){
  $("anDs").value = v.ds; fillAnalysisSelects();
  $("anG1").value = v.g1 || ""; $("anG2").value = v.g2 || ""; $("anTime").value = v.time || ""; $("anMeasure").value = v.measure || "";
  $("anAgg").value = v.agg || "sum"; $("anLimit").value = v.limit || "15"; $("anPeriod").checked = v.period !== false;
  FB.anFb.set(v.filters || []); runAnalysis(v.name);
}
$("anDs").addEventListener("change", fillAnalysisSelects);
$("anPresets").addEventListener("click", e => { const b = e.target.closest("[data-p]"); if (b) applyView(PRESETS[+b.dataset.p]); });
$("anLessons") && document.addEventListener("click", e => { const b = e.target.closest("[data-lesson]"); if (!b) return; const l = LESSONS[+b.dataset.lesson]; if (l && l.v) applyView({ ...l.v, name: l.t.split(".")[0] + ". " + l.t.split(". ")[1] }); });
$("anRun").addEventListener("click", () => runAnalysis());
let anLast = null;
async function runAnalysis(title){
  const v = currentView(); const group = [v.g1, v.g2].filter(Boolean);
  loading(true, "Working out the analysis");
  try {
    const r = await rpc("rpt_analyze", { p_dataset:v.ds, p_group: group.length ? group : null, p_time: v.time || null,
      p_measure: v.measure || null, p_agg: v.measure ? v.agg : "count", p_from: v.period ? S.from : null, p_to: v.period ? S.to : null,
      p_filters: v.filters.length ? v.filters : null, p_limit: v.time ? 5000 : +v.limit, p_order: v.time ? "name" : "value_desc" });
    anLast = { r, v, group };
    const isMoney = v.measure && !/count|days|stage|bps|increment|rows/i.test(v.measure) && v.agg !== "count";
    const f = (x) => x === null || x === undefined ? "" : (isMoney ? money(x, {full: S.unit !== "M"}) : nfR.format(x));
    const measureName = v.measure ? ({sum:"Total", avg:"Average", max:"Largest", min:"Smallest", count:"Number of rows"}[v.agg] + " " + v.measure) : "Number of rows";
    $("anTitle").textContent = title || `${measureName}${group.length ? " by " + group.join(" and ") : ""}${v.time ? ", by " + ({month:"month",quarter:"quarter",fy:"financial year"}[v.time]) : ""}`;
    $("anInfo").textContent = `${v.ds === "Ledger" ? "Ledger" : v.ds}${v.period ? `, ${fmtDate(S.from)} to ${fmtDate(S.to)}` : ", all dates"}${v.filters.length ? ", " + v.filters.length + " filter(s)" : ""}. Total of everything matching: ${f(r.total)}.${r.truncated ? " Showing the largest groups only." : ""}`;
    const rows = r.rows || [];
    // pivot
    const keyOf = x => (x.groups || []).join(" · ") || "Total";
    const periods = [...new Set(rows.map(x => x.period).filter(Boolean))].sort();
    const keys = []; const map = {};
    rows.forEach(x => { const k = keyOf(x); if (!(k in map)) { map[k] = {}; keys.push(k); } map[k][x.period || "_"] = (map[k][x.period || "_"] || 0) + Number(x.value || 0); });
    let order = keys;
    if (periods.length) { const tot = k => Object.values(map[k]).reduce((a, b) => a + b, 0); order = keys.sort((a, b) => tot(b) - tot(a)).slice(0, +v.limit); }
    const head = [group.join(" · ") || "Total", ...(periods.length ? periods : [measureName]), ...(periods.length ? ["Total"] : [])];
    const body = order.map(k => { const vals = periods.length ? periods.map(p => map[k][p] || 0) : [map[k]["_"]];
      return `<tr><td>${esc(k)}</td>${vals.map(x => `<td>${f(x)}</td>`).join("")}${periods.length ? `<td><strong>${f(vals.reduce((a, b) => a + b, 0))}</strong></td>` : ""}</tr>`; });
    $("anTable").innerHTML = tableHtml(head.map(esc), body);
    EXPORTS.analysis = [head].concat(order.map(k => { const vals = periods.length ? periods.map(p => map[k][p] || 0) : [map[k]["_"]]; return [k, ...vals, ...(periods.length ? [vals.reduce((a, b) => a + b, 0)] : [])]; }));
    // chart
    const pal = [css("--accent"), css("--spend"), css("--bal"), css("--income"), css("--bad"), css("--muted")];
    if (periods.length) drawChart("chAnalysis", { type: periods.length > 4 ? "line" : "bar", data:{ labels: periods,
        datasets: order.slice(0, 6).map((k, i) => ({ label:k, data: periods.map(p => map[k][p] || 0), borderColor:pal[i], backgroundColor:pal[i], tension:.25, pointRadius:2, borderRadius:5 })) },
        options: baseOpts({ money:isMoney }) });
    else drawChart("chAnalysis", { type:"bar", data:{ labels: order.slice(0, 15).map(k => k.length > 38 ? k.slice(0, 36) + "…" : k),
        datasets:[{ label: measureName, data: order.slice(0, 15).map(k => map[k]["_"]), backgroundColor: css("--accent"), borderRadius:6, maxBarThickness:22 }] },
        options:{ ...baseOpts({ money:isMoney }), indexAxis:"y", plugins:{ legend:{ display:false } } } });
  } catch(e){ $("anTable").innerHTML = `<tbody><tr><td class="empty">${esc(e.message)}</td></tr></tbody>`; }
  finally { loading(false); }
}
$("anExport").addEventListener("click", () => { if (EXPORTS.analysis) downloadCsv(EXPORTS.analysis, "KoFHA_analysis"); });
function savedViews(){ try { return JSON.parse(localStorage.getItem("kofha.views") || "[]"); } catch(e){ return []; } }
function loadSaved(){ $("anSaved").innerHTML = `<option value="">My saved views</option>` + savedViews().map((v, i) => `<option value="${i}">${esc(v.name)}</option>`).join(""); }
$("anSave").addEventListener("click", () => { const name = prompt("Name this view (it is saved in this browser):", $("anTitle").textContent); if (!name) return;
  const list = savedViews(); list.push({ ...currentView(), name }); try { localStorage.setItem("kofha.views", JSON.stringify(list)); } catch(e){} loadSaved(); });
$("anSaved").addEventListener("change", () => { const v = savedViews()[+$("anSaved").value]; if (v) applyView(v); });
$("anDelete").addEventListener("click", () => { const i = $("anSaved").value; if (i === "") return; const list = savedViews(); list.splice(+i, 1);
  try { localStorage.setItem("kofha.views", JSON.stringify(list)); } catch(e){} loadSaved(); });
$("fcAsOf").addEventListener("change", () => loadModule("forecast"));
