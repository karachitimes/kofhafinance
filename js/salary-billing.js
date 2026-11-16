// ---------- Salary history: follows the top bar period; filters run on the server ----------
const SAL = { f:{}, q:"", view:"month", cols:"all", emp:null, empData:null };
const SAL_CLS = [["Pay","Pay"],["Allowance","Allowances"],["Deduction","Deductions"],["CPF","CPF"],["Contribution","Contribution"]];
const SAL_TOT = [["tp","Total pay"],["ta","Total allowances"],["tpa","Pay & allowances"],["td","Total deductions"],["net","Net pay"]];
function salCols(d, every){
  // [{key,label,cls,g}] in display order: heads by class, then the totals
  const out = [];
  if (every || SAL.cols === "all") SAL_CLS.forEach(([c, g]) => (d.heads || []).filter(h => h.cls === c).forEach(h => out.push({ key:h.key, label:h.label, g })));
  SAL_TOT.forEach(([k, l]) => out.push({ key:k, label:l, g:"Totals", tot:true }));
  return out;
}
function salHead(first, cols, extra){
  const groups = []; cols.forEach(c => { const l = groups[groups.length - 1]; if (l && l.g === c.g) l.n++; else groups.push({ g:c.g, n:1 }); });
  const ex = extra || [];
  return `<thead><tr class="grp"><th rowspan="2">${esc(first)}</th>${ex.map(x => `<th rowspan="2">${esc(x)}</th>`).join("")}${groups.map(g => `<th colspan="${g.n}" class="g-start">${esc(g.g)}</th>`).join("")}</tr>` +
         `<tr class="cols">${cols.map((c, i) => `<th class="${(i === 0 || cols[i-1].g !== c.g) ? "g-start" : ""}${c.tot ? " tot" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>`;
}
const salCells = (x, cols) => cols.map((c, i) => `<td class="${(i === 0 || cols[i-1].g !== c.g) ? "g-start" : ""}${c.tot ? " tot" : ""}">${Number(x[c.key] || 0) ? money(x[c.key], {full:true}) : "–"}</td>`).join("");
function salFill(id, list, cur, all){
  const el = $(id); const v = (list || []);
  const html = `<option value="">${all}</option>` + v.map(x => `<option${x === cur ? " selected" : ""}>${esc(x)}</option>`).join("");
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  el.value = cur || "";
}
function renderSalary(d){
  if (d.note) { $("salNote").textContent = d.note; ["salFigures","salTable"].forEach(i => $(i).innerHTML = ""); return; }
  const o = d.options || {}, F = SAL.f;
  salFill("salGrade", o.grades, F.grade, "All grades"); salFill("salDes", o.designations, F.designation, "All designations");
  salFill("salBps", o.bps, F.bps, "All"); salFill("salType", o.emp_types, F.emp_type, "All types");
  salFill("salPost", o.posts, F.post, "Fill and vacant"); salFill("salDept", o.departments, F.department, "All departments");
  const fg = d.figures || {}, t = d.totals || {}, BM = d.by_month || [], E = d.employees || [];
  const rng = d.range || {};
  const filtered = Object.keys(F).length || SAL.q;
  $("salNote").textContent = BM.length
    ? `${fmtDate(S.from)} to ${fmtDate(S.to)}: ${BM.length} month${BM.length > 1 ? "s" : ""} in the salary register${filtered ? " (filtered)" : ""}. Change the period with Year and Period at the top.`
    : `No salary rows from ${fmtDate(S.from)} to ${fmtDate(S.to)}${filtered ? " with these filters" : ""}. The register holds ${rng.first ? fmtDate(rng.first) + " to " + fmtDate(rng.last) : "no months yet"}.`;
  $("salFigures").innerHTML =
    figure("bal", "Employees paid", fg.employees, `${fg.months || 0} month${fg.months === 1 ? "" : "s"}; last month ${fg.last_month_headcount ?? 0} paid${fg.last_month_vacant ? `, ${fg.last_month_vacant} posts vacant` : ""}`, "shield", null, "count") +
    figure("spend", "Pay and allowances", t.tpa, `pay ${money(t.tp)}, allowances ${money(t.ta)}`, "wallet") +
    figure("spend", "Deductions", t.td, fg.income_tax != null ? `income tax ${money(fg.income_tax)}` : "tax, CPF, loans and others", "scale") +
    figure("income", "Net pay", t.net, "paid to employees' accounts", "coins") +
    figure("bal", "CPF", fg.employer_cpf, "CPF column (KoFHA & employee)", "bank") +
    figure("spend", "Average a month", BM.length ? (t.tpa || 0) / BM.length : 0, "pay and allowances ÷ months", "up");
  countUp("#salFigures");
  drawChart("chSalTrend", { type:"bar", data:{ labels: BM.map(x => x.label), datasets:[
    { label:"Pay and allowances", data: BM.map(x => x.tpa), backgroundColor: css("--income") },
    { label:"Deductions", data: BM.map(x => x.td), backgroundColor: css("--spend") },
    { label:"Net pay", data: BM.map(x => x.net), backgroundColor: css("--accent") } ] }, options: baseOpts({ money:true }) });
  document.querySelectorAll("#salView button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === SAL.view)));
  document.querySelectorAll("#salCols button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === SAL.cols)));
  const cols = salCols(d);
  const un = (d.unclassified || []).length ? ` ${d.unclassified.length} column(s) with no class are left out (${d.unclassified.slice(0, 4).join(", ")}${d.unclassified.length > 4 ? "…" : ""}); give them a class in More > Columns.` : "";
  if (SAL.view === "month") {
    $("salTableNote").textContent = `${BM.length} months. Every pay head with an amount in this selection is shown.${un}`;
    $("salTable").innerHTML = salHead("Month", cols, ["Paid", "Vacant"]) + `<tbody>` +
      BM.map(x => `<tr><td>${esc(x.label)}</td><td>${x.employees}</td><td>${x.vacant || "–"}</td>${salCells(x, cols)}</tr>`).join("") +
      `</tbody><tfoot><tr class="grand"><td>Total ${BM.length} months</td><td></td><td></td>${salCells(t, cols)}</tr></tfoot>`;
  } else {
    $("salTableNote").textContent = `${E.length} employees, totals for the period. Select an employee to see each month.${un}`;
    $("salTable").innerHTML = salHead("Employee", cols, ["BPS", "Months"]) + `<tbody>` +
      E.map(e => `<tr class="click${SAL.emp === e.name ? " cur" : ""}" data-semp="${esc(e.name)}" tabindex="0"><td><strong>${esc(e.name)}</strong><br><small class="mini">${esc([e.designation, e.grade, e.emp_type].filter(Boolean).join(", "))}${e.months ? ` · ${e.first_m}${e.first_m !== e.last_m ? "–" + e.last_m : ""}` : ""}</small></td><td>${esc(e.bps || "")}</td><td>${e.months || 0}</td>${salCells(e, cols)}</tr>`).join("") +
      `</tbody><tfoot><tr class="grand"><td>${E.length} employees</td><td></td><td></td>${salCells(t, cols)}</tr></tfoot>`;
  }
  // download: whatever is on screen, with every head
  const all = salCols(d, true);
  if (SAL.view === "month") EXPORTS.salary = [["Month", "Employees paid", "Vacant", ...all.map(c => c.label)]].concat(BM.map(x => [x.label, x.employees, x.vacant, ...all.map(c => Number(x[c.key] || 0))]));
  else EXPORTS.salary = [["Employee", "Designation", "BPS", "Grade", "Employee type", "Months", ...all.map(c => c.label)]].concat(E.map(e => [e.name, e.designation, e.bps, e.grade, e.emp_type, e.months, ...all.map(c => Number(e[c.key] || 0))]));
  if (SAL.emp) salEmpRender(); else $("salEmpCard").classList.add("hidden");
}
async function salEmpOpen(name){
  SAL.emp = name; $("salEmpCard").classList.remove("hidden");
  $("salEmpTitle").textContent = name; $("salEmpNote").textContent = "Loading…"; $("salEmpTable").innerHTML = "";
  try { SAL.empData = await rpc("rpt_salary_history_full", { p: { from:S.from, to:S.to, employee:name } }); salEmpRender(); }
  catch(e){ $("salEmpNote").textContent = "Could not load: " + e.message; }
  document.querySelectorAll("#salTable tr[data-semp]").forEach(r => r.classList.toggle("cur", r.dataset.semp === name));
  $("salEmpCard").scrollIntoView({ behavior:"smooth", block:"start" });
}
function salEmpRender(){
  const d = SAL.empData; if (!d) return;
  const R = d.detail || [];
  // heads of this employee only
  const tot = {}; R.forEach(x => Object.keys(x).forEach(k => { if (/^h\d+$|^(tp|ta|tpa|td|net)$/.test(k)) tot[k] = (tot[k] || 0) + Number(x[k] || 0); }));
  const cols = salCols({ heads:(d.heads || []).filter(h => tot[h.key]) });
  const every = salCols({ heads:(d.heads || []).filter(h => tot[h.key]) }, true);
  $("salEmpTitle").textContent = d.employee;
  $("salEmpNote").textContent = R.length ? `${R.length} month${R.length > 1 ? "s" : ""} from ${fmtDate(S.from)} to ${fmtDate(S.to)}. Every pay head of this employee.` : "No salary rows for this employee in the period.";
  $("salEmpTable").innerHTML = salHead("Month", cols, ["Designation", "BPS"]) + `<tbody>` +
    R.map(x => `<tr><td>${esc(x.label)}</td><td style="text-align:left">${esc(x.designation || "")}</td><td>${esc(x.bps || "")}</td>${salCells(x, cols)}</tr>`).join("") +
    `</tbody><tfoot><tr class="grand"><td>Total</td><td></td><td></td>${salCells(tot, cols)}</tr></tfoot>`;
  EXPORTS.salary_emp = [["Month", "Designation", "BPS", ...every.map(c => c.label)]].concat(R.map(x => [x.label, x.designation, x.bps, ...every.map(c => Number(x[c.key] || 0))]));
}
let salT = null;
$("salSearch").addEventListener("input", () => { clearTimeout(salT); salT = setTimeout(() => { SAL.q = $("salSearch").value.trim(); loadModule("salary"); }, 400); });
document.querySelectorAll("#p-salary [data-sf]").forEach(el => el.addEventListener("change", () => {
  if (el.value) SAL.f[el.dataset.sf] = el.value; else delete SAL.f[el.dataset.sf]; loadModule("salary"); }));
$("salClear").addEventListener("click", () => { SAL.f = {}; SAL.q = ""; $("salSearch").value = ""; loadModule("salary"); });
$("salView").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; SAL.view = b.dataset.v; M.salary && renderSalary(M.salary); });
$("salCols").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; SAL.cols = b.dataset.v; M.salary && renderSalary(M.salary); if (SAL.emp) salEmpRender(); });
$("salTable").addEventListener("click", e => { const r = e.target.closest("tr[data-semp]"); if (r) salEmpOpen(r.dataset.semp); });
$("salTable").addEventListener("keydown", e => { if (e.key === "Enter") { const r = e.target.closest("tr[data-semp]"); if (r) salEmpOpen(r.dataset.semp); } });
$("salEmpClose").addEventListener("click", () => { SAL.emp = null; SAL.empData = null; $("salEmpCard").classList.add("hidden");
  document.querySelectorAll("#salTable tr.cur").forEach(r => r.classList.remove("cur")); });
// Billing tab: own date ranges (unticks "follow"), customer and bill-type filters, account drill-down
function billOwnDates() {
  S.bill.follow = false; $("billFollow").checked = false;
  S.bill.bFrom = monthStart($("billFrom").value); S.bill.bTo = monthEnd($("billTo").value);
  S.bill.pFrom = $("payFrom").value || null; S.bill.pTo = $("payTo").value || null;
  loadModule("billing");
}
["billFrom","billTo","payFrom","payTo"].forEach(id => $(id).addEventListener("change", billOwnDates));
$("billFollow").addEventListener("change", () => { S.bill.follow = $("billFollow").checked; if (!S.bill.follow) billOwnDates(); else loadModule("billing"); });
$("billCust").addEventListener("change", () => { S.bill.cust = $("billCust").value; $("billAcct").classList.add("hidden"); renderBilling(); });
$("billType").addEventListener("change", () => { S.bill.type = $("billType").value; renderBilling(); });
$("billGlSearch").addEventListener("input", renderBillGl);
$("billGlCat").addEventListener("change", renderBillGl);
$("billGlTable").addEventListener("click", e => { const r = e.target.closest("tr[data-acct]"); if (r) openBillAccount(r.dataset.acct); });
$("billGlTable").addEventListener("keydown", e => { if (e.key !== "Enter") return; const r = e.target.closest("tr[data-acct]"); if (r) openBillAccount(r.dataset.acct); });
$("prTable").addEventListener("click", async e => {
  const tr = e.target.closest("tr[data-emp]"); if (!tr) return;
  loading(true, "Loading pay details");
  try {
    const r = await rpc("rpt_payroll", { p_employee: tr.dataset.emp }); const x = (r.employees || [])[0]; if (!x) return;
    const list = (arr) => (arr || []).map(h => `<tr><td>${esc(h.head)}</td><td>${money(h.amount, {full:true})}</td></tr>`).join("");
    $("prDetail").innerHTML = `<h3>${esc(x.name)}</h3><p class="note">${esc(x.designation || "")}, BPS ${esc(x.bps || "")}, ${esc(x.grade || "")}, ${esc(x.employment || "")}. ${esc(r.register_month || "")} register.</p>
      <div class="grid2 even" style="margin-top:0">
        <div class="tscroll" style="box-shadow:none"><table>${tableHtml(["Pay and allowances","Amount"], [list(x.pay_heads), `<tr class="total"><td>Total pay</td><td>${money(x.total_pay, {full:true})}</td></tr>`, list(x.allowance_heads)],
          `<tr class="total"><td>Total allowances</td><td>${money(x.total_allowances, {full:true})}</td></tr><tr class="grand"><td>Total pay and allowances</td><td>${money(x.total_pay_and_allowances, {full:true})}</td></tr>`)}</table></div>
        <div class="tscroll" style="box-shadow:none"><table>${tableHtml(["Deductions","Amount"], [list(x.deduction_heads)],
          `<tr class="total"><td>Total deductions</td><td>${money(x.total_deductions, {full:true})}</td></tr><tr class="grand"><td>Net pay</td><td>${money(x.net_pay, {full:true})}</td></tr>` +
          (x.employer_contribution || []).map(h => `<tr><td>Employer: ${esc(h.head)}</td><td>${money(h.amount, {full:true})}</td></tr>`).join(""))}</table></div>
      </div>`;
    $("prDetail").classList.remove("hidden"); $("prDetail").scrollIntoView({ block:"nearest", behavior:"smooth" });
  } catch(e){ alert(e.message); } finally { loading(false); }
});
async function browse(){
  const tbl = $("exTable").value; if (!tbl) return;
  loading(true, "Loading " + tbl);
  try {
    const flt = FB.exFb ? FB.exFb.get() : [];
    const r = await rpc("rpt_browse", { p_table:tbl, p_search: $("exSearch").value.trim() || null,
      p_from: $("exPeriod").checked ? S.from : null, p_to: $("exPeriod").checked ? S.to : null, p_limit:S.ex.limit, p_offset:S.ex.offset,
      p_filters: flt.length ? flt : null });
    S.ex.last = r;
    const rows = r.rows || []; const cols = rows.length ? (r.columns || Object.keys(rows[0])) : [];
    const fmt = v => (typeof v === "number") ? nfM.format(v).replace(/\.00$/, "") : esc(v === null || v === undefined ? "" : v);
    $("exGrid").innerHTML = rows.length ? `<thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
      rows.map(x => `<tr>${cols.map(c => `<td${typeof x[c] === "string" ? ' class="txt"' : ""}>${fmt(x[c])}</td>`).join("")}</tr>`).join("") +
      (r.sums && Object.values(r.sums).some(v => v !== null) ? `<tr class="grand">${cols.map((c, i) => `<td>${i === 0 ? "Total of all matching rows" : (r.sums[c] !== undefined && r.sums[c] !== null ? fmt(Number(r.sums[c])) : "")}</td>`).join("")}</tr>` : "") + "</tbody>"
      : `<tbody><tr><td class="empty">No rows match.${$("exPeriod").checked && !r.date_column ? " This table has no date column, so the period filter does not apply." : ""}</td></tr></tbody>`;
    const from = r.total ? S.ex.offset + 1 : 0, to = Math.min(S.ex.offset + S.ex.limit, r.total || 0);
    $("exInfo").textContent = `Showing ${nfR.format(from)} to ${nfR.format(to)} of ${nfR.format(r.total || 0)}${r.date_column && $("exPeriod").checked ? ` (by ${r.date_column})` : ""}`;
    $("exPrev").disabled = S.ex.offset === 0; $("exNext").disabled = to >= (r.total || 0);
  } catch(e){ $("exGrid").innerHTML = `<tbody><tr><td class="empty">${esc(e.message)}</td></tr></tbody>`; }
  finally { loading(false); }
}
$("exTable").addEventListener("change", () => { S.ex.offset = 0; if (FB.exFb) FB.exFb.reset(); browse(); });
$("exApply").addEventListener("click", () => { S.ex.offset = 0; browse(); });
$("exSearch").addEventListener("keydown", e => { if (e.key === "Enter") { S.ex.offset = 0; browse(); } });
$("exPeriod").addEventListener("change", () => { S.ex.offset = 0; browse(); });
$("exPrev").addEventListener("click", () => { S.ex.offset = Math.max(0, S.ex.offset - S.ex.limit); browse(); });
$("exNext").addEventListener("click", () => { S.ex.offset += S.ex.limit; browse(); });
$("exExport").addEventListener("click", async () => {
  const tbl = $("exTable").value; if (!tbl) return; loading(true, "Preparing download");
  try { const r = await rpc("rpt_browse", { p_table:tbl, p_search: $("exSearch").value.trim() || null, p_from: $("exPeriod").checked ? S.from : null, p_to: $("exPeriod").checked ? S.to : null, p_limit:2000, p_offset:0 });
    const rows = r.rows || []; const cols = rows.length ? (r.columns || Object.keys(rows[0])) : [];
    downloadCsv([cols].concat(rows.map(x => cols.map(c => x[c]))), "KoFHA_" + tbl);
    if (r.total > 2000) alert(`The download holds the first 2,000 of ${nfR.format(r.total)} rows. Search or use the period to narrow it.`);
  } catch(e){ alert(e.message); } finally { loading(false); }
});
