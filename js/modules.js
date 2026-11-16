/* ---------- billing <-> ledger bridge (account heads) ---------- */
const LINK_LABEL = { crosswalk: "billing_crosswalk", crosswalk_loose: "close match", chart_direct: "chart name",
                     same_bill_ref: "same bill ref", unlinked: "not linked" };
const LINK_HINT = { crosswalk_loose: "Matched to a billing_crosswalk row that differs only in punctuation",
                    chart_direct: "No billing_crosswalk row; the account head is itself a chart-of-accounts name",
                    same_bill_ref: "Customer name differs from other months; linked through the same Bill Ref" };
function billHeadCell(b) {
  if (!b.account_head) return `<span class="pill bad" title="Add ${esc(b.account_key || "")} to billing_crosswalk">not linked</span>`;
  const m = b.link_method;
  return esc(b.account_head) + (m && m !== "crosswalk" ? ` <span class="pill warn" title="${esc(LINK_HINT[m] || "")}">${esc(LINK_LABEL[m] || m)}</span>` : "");
}
const monthStart = v => v ? v.slice(0, 8) + "01" : v;
const monthEnd = v => { if (!v) return v; const d = new Date(v.slice(0, 8) + "01T00:00:00"); return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
// the dates actually used: the top filter when "follow" is ticked, otherwise the tab's own choices
function billDates() {
  const B = S.bill;
  if (B.follow || !B.bFrom) return { bf: S.from, bt: S.to, pf: B.follow || !B.pFrom ? S.from : B.pFrom, pt: B.follow || !B.pTo ? S.to : B.pTo };
  return { bf: B.bFrom, bt: B.bTo, pf: B.pFrom || B.bFrom, pt: B.pTo || B.bTo };
}
function billPeriodText(a, b) { return `${fmtDate(a)} to ${fmtDate(b)}`; }
// bills, accounts and overdue rows narrowed by the customer / bill type filters
// one name per customer: names written differently ("Ali Ice Factory A-37" / "Ali Ice Factory-A-37") or tied to the same
// account head (a billing name and the ledger name of the same account) are the same customer
function billCustomerGroups(d) {
  const par = {}, find = x => (par[x] === undefined ? (par[x] = x) : par[x] === x ? x : (par[x] = find(par[x])));
  const join = (a, b) => { a = find(a); b = find(b); if (a !== b) par[b] = a; };
  const key = n => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const byKey = {}, byAcct = {};
  (d.customers || []).forEach(c => { const n = c.customer; if (!n) return; find(n);
    const k = key(n); if (byKey[k]) join(byKey[k], n); else byKey[k] = n;
    (c.accounts || []).forEach(a => { if (byAcct[a]) join(byAcct[a], n); else byAcct[a] = n; }); });
  const billing = new Set([...(d.bills || []), ...(d.overdue || [])].filter(b => b.link_method !== "ledger" && b.bill_ref !== b.account_head).map(b => b.customer));
  const members = {};
  Object.keys(par).forEach(n => { const r = find(n); (members[r] = members[r] || []).push(n); });
  const show = {};
  Object.values(members).forEach(ns => {
    const pick = ns.filter(n => billing.has(n)).sort()[0] || ns.slice().sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
    ns.forEach(n => show[n] = pick); });
  return show;
}
function billCust(name) { const m = (S.billData && S.billData._cust) || {}; return m[name] || name; }
function billFiltered() {
  const d = S.billData || {}, c = S.bill.cust, t = S.bill.type;
  const okRow = r => (!c || billCust(r.customer) === c) && (!t || r.bill_type === t);
  const bills = (d.bills || []).filter(okRow);
  const overdue = (d.overdue || []).filter(okRow);
  const accounts = (d.accounts || []).filter(a => (!c || (a.customer_list || []).some(x => billCust(x) === c)) && (!t || String(a.bill_types || "").split(", ").includes(t)));
  return { bills, overdue, accounts };
}
function renderBilling() {
  const d = S.billData; if (!d) return;
  const F = billFiltered(), sum = (arr, f) => arr.reduce((s, x) => s + Number(f(x) || 0), 0);
  const who = [S.bill.cust, S.bill.type].filter(Boolean).join(", ");
  $("billNote").textContent = `Bills with a billing month from ${billPeriodText(d.bill_from, d.bill_to)}; money received from ${billPeriodText(d.pay_from, d.pay_to)}${who ? ` · ${who}` : ""}.`;
  const glEnd = d.gl_last_date ? fmtDate(d.gl_last_date) : "–";
  const onBills = sum(F.accounts, a => a.recorded_on_bills);
  const warn = $("billGlWarn"), chk = d.cashbook_check || {};
  const msgs = [];
  if (Number(chk.shifted_in_period) > 0) {
    const ex = chk.example || {};
    msgs.push(`<strong>${chk.shifted_in_period} cashbook rows in the payment period cannot be read</strong> (rows ${esc(chk.first_row)}–${esc(chk.last_row)} in Supabase, dated ${esc(fmtDate(chk.first_date))} to ${esc(fmtDate(chk.last_date))}): from <em>Voucher No</em> onwards their values sit one column to the left, so the bank is in <em>Pay to</em>, the amount in <em>Payment</em> and the date in <em>Deposit</em>` +
      (ex.description ? ` (e.g. “${esc(ex.description)}”: Pay to = ${esc(ex.pay_to)}, Payment = ${money(ex.payment, {full:true})}, Deposit = ${esc(ex.deposit)})` : "") +
      `. Receipts on these rows are not counted. Fix them in the Excel cashbook table and push it again.`);
  }
  if (!d.gl_covers_payment_period) msgs.push(`The general ledger has entries up to <strong>${esc(glEnd)}</strong>; receipts after that date are not in it yet.`);
  if (msgs.length && onBills) msgs.push(`For comparison, the bills themselves record <strong>${money(onBills, {full:true})}</strong> received in the payment period.`);
  if (msgs.length) { warn.innerHTML = msgs.join(" "); warn.classList.remove("hidden"); } else warn.classList.add("hidden");

  // figures follow every filter on this tab
  const outRows = F.overdue.filter(o => Number(o.balance) > 0);
  const od = F.overdue.filter(o => o.band === "notice" || o.band === "final");
  $("billFigures").innerHTML =
    figure("income", "Billed", sum(F.bills, b => Number(b.amount || 0) + Number(b.surcharge || 0)), `${F.bills.length} bills in the billing period`, "wallet") +
    figure("income", "Received (general ledger)", sum(F.accounts, a => a.gl_received), `${sum(F.accounts, a => a.gl_receipts)} receipts in the payment period`, "up") +
    figure("bal", "Recorded on the bills", onBills, "payments entered on the bills, payment period", "wallet") +
    figure("bal", "Outstanding on bills", sum(outRows, o => o.balance), `${outRows.length} connections, latest bill as at ${fmtDate(d.bill_to)}`, "scale") +
    figure("spend", "Overdue 60+ days", sum(od, o => o.balance), `${od.length} connections`, "up") +
    figure("bal", "Ledger balance", sum(F.accounts, a => a.gl_balance), `account heads, as at ${fmtDate(d.pay_to)}`, "shield");
  countUp("#billFigures");

  const types = {};
  F.bills.forEach(b => { const x = types[b.bill_type] || (types[b.bill_type] = { n:0, amount:0, surcharge:0, tp:0 });
    x.n++; x.amount += Number(b.amount || 0); x.surcharge += Number(b.surcharge || 0); x.tp += Number(b.total_payable || 0); });
  $("billTypeTable").innerHTML = tableHtml(["Bill type","Bills","Amount","Surcharge","Total payable"],
    Object.keys(types).sort().map(k => `<tr><td>${esc(k)}</td><td>${types[k].n}</td><td>${money(types[k].amount)}</td><td>${money(types[k].surcharge)}</td><td>${money(types[k].tp)}</td></tr>`));
  $("billBillsTable").innerHTML = tableHtml(["Customer","Month","Bill type","Account head","Amount","Total payable","Paid on bill","Last payment"],
    F.bills.map(b => `<tr><td class="txt"><strong>${esc(b.customer)}</strong><br><small class="mini">${esc(b.bill_ref || "")}</small></td><td>${esc((b.billing_month || "").slice(0, 7))}</td><td>${esc(b.bill_type)}</td><td class="txt">${billHeadCell(b)}</td><td>${money(b.amount, {full:true})}</td><td>${money(b.total_payable, {full:true})}</td><td>${money(b.paid_on_bill, {full:true})}</td><td>${fmtDate(b.last_payment)}</td></tr>`));
  const odList = F.overdue.filter(o => ["notice","final","nopay"].includes(o.band));
  $("billOverdueNote").textContent = `Latest bill of each connection as at ${fmtDate(d.bill_to)}. Notice at 60 days, disconnect recommended (electricity, water) or refer for recovery (rents) at 90 days since the last payment.`;
  $("billOverdueTable").innerHTML = tableHtml(["Stage","Customer","Bill type","Account head","Days since payment","Balance"],
    odList.map(o => `<tr><td><span class="pill">${esc(o.stage)}</span></td><td class="txt"><strong>${esc(o.customer)}</strong><br><small class="mini">${esc(o.bill_ref || "")}</small></td><td>${esc(o.bill_type)}</td><td class="txt">${o.account_head ? esc(o.account_head) : `<span class="pill bad">not linked</span>`}</td><td>${o.days_since ?? "–"}</td><td>${money(o.balance, {full:true})}</td></tr>`),
    `<tr class="grand"><td colspan="5">Total overdue 60+ days</td><td>${money(sum(od, o => o.balance))}</td></tr>`);
  renderBillGl();
  renderBillBridge(d);

  EXPORTS.billing = [["Stage","Customer","Bill type","Bill ref","Account head","Billing month","Last payment","Days since payment","Balance"]]
    .concat(odList.map(o => [o.stage, o.customer, o.bill_type, o.bill_ref, o.account_head, o.billing_month, o.last_payment, o.days_since, o.balance]));
  EXPORTS.billing_bills = [["Customer","Billing month","Bill type","Bill ref","Account head key","Account head (GL)","How linked","Amount","Surcharge","Total payable","Paid on bill","Last payment"]]
    .concat(F.bills.map(b => [b.customer, b.billing_month, b.bill_type, b.bill_ref, b.account_key, b.account_head, LINK_LABEL[b.link_method] || b.link_method, b.amount, b.surcharge, b.total_payable, b.paid_on_bill, b.last_payment]));
}
function billGlRows() {
  const q = $("billGlSearch").value.trim().toLowerCase(), cat = $("billGlCat").value;
  return billFiltered().accounts.filter(a => (!cat || a.category === cat) &&
    (!q || `${a.gl_account} ${a.customers} ${a.bill_types}`.toLowerCase().includes(q)));
}
function renderBillGl() {
  const d = S.billData; if (!d) return;
  const rows = billGlRows();
  const sum = k => rows.reduce((s, a) => s + Number(a[k] || 0), 0);
  // bills with no account head are counted in "Billed" at the top, so show them here too (unless a search/category narrows the table)
  const narrowed = $("billGlSearch").value.trim() || $("billGlCat").value;
  const unl = narrowed ? [] : billFiltered().bills.filter(b => !b.account_head);
  const unlBilled = unl.reduce((s, b) => s + Number(b.amount || 0) + Number(b.surcharge || 0), 0);
  $("billGlNote").innerHTML = `Each receivable account head in the chart of accounts with the bills linked to it. <b>Billed</b>: bills in the billing period. <b>Received (GL)</b>: credits posted through a bank to the account head in the general ledger during the payment period. <b>Outstanding</b>: latest bill of each connection as at ${esc(fmtDate(d.bill_to))} (Total Payable, which already includes arrears). <b>Ledger balance</b>: opening trial balance plus every posting to ${esc(fmtDate(d.pay_to))}. Click an account head to see its ledger entries and bills.`;
  $("billGlTable").innerHTML = tableHtml(["Account head (GL)","Billing customer(s)","Billed","Received (GL)","Recorded on bills","Outstanding (bills)","Ledger balance","Difference","Last GL receipt"],
    rows.map(a => `<tr class="click" data-acct="${esc(a.gl_account)}" tabindex="0"><td class="txt"><strong>${esc(a.gl_account)}</strong><br><small class="mini">${esc(a.category || "")}</small></td>
      <td class="txt">${esc(a.customers || "")}<br><small class="mini">${esc(a.bill_types || "")}${a.connections > 1 ? `, ${a.connections} connections` : ""}</small></td>
      <td>${money(a.register_billed, {full:true})}<br><small class="mini">${a.bills || 0} bills</small></td>
      <td>${money(a.gl_received, {full:true})}<br><small class="mini">${a.gl_receipts || 0} receipts</small></td>
      <td>${money(a.recorded_on_bills, {full:true})}</td>
      <td>${money(a.register_outstanding, {full:true})}</td>
      <td${Number(a.gl_balance) < 0 ? ' class="neg"' : ""}>${money(a.gl_balance, {full:true})}</td>
      <td>${money(a.difference, {full:true})}</td>
      <td>${fmtDate(a.gl_last_receipt)}${a.gl_last_receipt_amount ? `<br><small class="mini">${money(a.gl_last_receipt_amount, {full:true})}</small>` : ""}</td></tr>`),
    (unl.length ? `<tr><td class="txt" colspan="2"><span class="pill bad">not linked</span> ${unl.length} bill${unl.length > 1 ? "s" : ""} with no account head (see Bridge check)</td><td>${money(unlBilled, {full:true})}</td><td colspan="6"></td></tr>` : "") +
    (rows.length ? `<tr class="grand"><td colspan="2">Total, ${rows.length} account heads${unl.length ? " + not linked" : ""}</td><td>${money(sum("register_billed") + unlBilled)}</td><td>${money(sum("gl_received"))}</td><td>${money(sum("recorded_on_bills"))}</td><td>${money(sum("register_outstanding"))}</td><td>${money(sum("gl_balance"))}</td><td>${money(sum("difference"))}</td><td></td></tr>` : ""));
  EXPORTS.billing_gl = [["Account head (GL)","Category","Billing customer(s)","Bill type","Connections","Bills","Billed","Received (GL)","GL receipts","Recorded on bills","Outstanding (bills)","Ledger balance","Difference","Last GL receipt","Last GL receipt amount","Bills booked in GL","Other GL debits through bank"]]
    .concat(rows.map(a => [a.gl_account, a.category, a.customers, a.bill_types, a.connections, a.bills, a.register_billed, a.gl_received, a.gl_receipts, a.recorded_on_bills, a.register_outstanding, a.gl_balance, a.difference, a.gl_last_receipt, a.gl_last_receipt_amount, a.gl_bills_booked, a.gl_other_debits]));
}
async function openBillAccount(acct) {
  const d = S.billData; if (!d || !acct) return;
  const box = $("billAcct"); box.classList.remove("hidden");
  box.innerHTML = `<p class="note">Loading ${esc(acct)}…</p>`;
  try {
    const x = await rpc("rpt_billing_account", { p_account: acct, p_bill_from: d.bill_from, p_bill_to: d.bill_to, p_pay_from: d.pay_from, p_pay_to: d.pay_to });
    let run = Number(x.opening_balance || 0);
    const gl = (x.gl || []).map(g => { run += Number(g.debit || 0) - Number(g.credit || 0);
      return `<tr><td>${fmtDate(g.date)}</td><td><span class="pill${g.kind === "Receipt" ? "" : " warn"}">${esc(g.kind)}</span></td><td class="txt">${esc(g.description || "")}<br><small class="mini">${esc([g.ref, g.voucher_no, g.bank].filter(Boolean).join(" · "))}</small></td><td>${money(g.debit, {full:true})}</td><td>${money(g.credit, {full:true})}</td><td${run < 0 ? ' class="neg"' : ""}>${money(run, {full:true})}</td></tr>`; });
    const rec = (x.gl || []).filter(g => g.kind === "Receipt").reduce((s, g) => s + Number(g.credit || 0), 0);
    box.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><h4>${esc(acct)}</h4>
        <p class="note">General ledger ${billPeriodText(x.pay_from, x.pay_to)}: opening ${money(x.opening_balance, {full:true})}, received ${money(rec, {full:true})}. Bills ${billPeriodText(x.bill_from, x.bill_to)}.</p></div>
        <button class="btn ghost" type="button" id="billAcctClose">Close</button></div>
      <h4 style="margin-top:8px">General ledger entries</h4><div class="tscroll" style="box-shadow:none;max-height:420px"><table>${tableHtml(["Date","Kind","Description","Debit","Credit","Balance"], gl)}</table></div>
      <h4 style="margin-top:14px">Bills in the billing period</h4><div class="tscroll" style="box-shadow:none;max-height:420px"><table>${tableHtml(["Month","Customer","Bill type","Amount","Total payable","Last payment"],
        (x.bills || []).map(b => `<tr><td>${esc((b.billing_month || "").slice(0, 7))}</td><td class="txt">${esc(b.customer)}<br><small class="mini">${esc(b.bill_ref || "")}</small></td><td>${esc(b.bill_type)}</td><td>${money(b.amount, {full:true})}</td><td>${money(b.total_payable, {full:true})}</td><td>${fmtDate(b.last_payment)}</td></tr>`))}</table></div>`;
    $("billAcctClose").addEventListener("click", () => box.classList.add("hidden"));
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) { box.innerHTML = `<p class="note">Could not load ${esc(acct)}: ${esc(e.message)}</p>`; }
}
function renderBillBridge(d) {
  const b = d.bridge || {};
  if (!b.has_crosswalk) { $("billBridge").innerHTML = `<p class="note">billing_crosswalk is not in Supabase yet. In Excel run SB_AddTable, enter billing_crosswalk, then push it.</p>`; return; }
  const bm = b.by_method || {};
  const parts = Object.keys(LINK_LABEL).filter(k => k !== "unlinked" && bm[k]).map(k => `${bm[k]} by ${LINK_LABEL[k]}`);
  let h = `<p><strong>${b.linked || 0} of ${b.keys || 0}</strong> account heads in the billing register are linked to the chart of accounts${parts.length ? ` (${parts.join(", ")})` : ""}.</p>`;
  if ((b.unlinked || []).length) h += `<p class="note" style="margin-top:10px"><span class="pill bad">Not linked</span> Add a row to billing_crosswalk with this customer_name and its chart-of-accounts NAME as gl_account_name:</p><ul class="bridge-list">` +
    b.unlinked.map(u => `<li><code>${esc(u.add_key)}</code> <small class="mini">${esc(u.bill_ref || "")}, ${esc(u.reason)}</small></li>`).join("") + `</ul>`;
  if ((b.suffix_mismatch || []).length) h += `<p class="note" style="margin-top:10px"><span class="pill bad">Wrong suffix</span> The bill type and the account's suffix disagree (e.g. a power bill pointed at a :WAR account):</p><ul class="bridge-list">` +
    b.suffix_mismatch.map(u => `<li><code>${esc(u.account_key)}</code> → ${esc(u.gl_account)}</li>`).join("") + `</ul>`;
  if ((b.shared_accounts || []).length) h += `<p class="note" style="margin-top:10px"><span class="pill warn">Shared account</span> Different billing customers post to one account head. Fine if intended (a renamed customer); check it if they are different connections:</p><ul class="bridge-list">` +
    b.shared_accounts.map(s => `<li>${esc(s.gl_account)} ← ${(s.keys || []).map(k => `<code>${esc(k)}</code>`).join(" ")}</li>`).join("") + `</ul>`;
  if (!(b.unlinked || []).length && !(b.suffix_mismatch || []).length) h += `<p class="note" style="margin-top:8px">Every bill is linked and every suffix agrees with its bill type.</p>`;
  $("billBridge").innerHTML = h;
}
// fill the tab's own controls (month lists, dates, customers) from the loaded data
function syncBillControls(d) {
  const avail = d.available_months || [];
  const opts = avail.map(m => `<option value="${esc(m.value)}">${esc(m.label)}</option>`).join("");
  if ($("billFrom").dataset.n !== String(avail.length)) { $("billFrom").innerHTML = opts; $("billTo").innerHTML = opts; $("billFrom").dataset.n = String(avail.length); }
  const inRange = avail.filter(m => m.value >= d.bill_from && m.value <= d.bill_to);
  const ym = v => (v || "").slice(0, 7);
  const pick = (target, first) => { const hit = avail.find(m => ym(m.value) === ym(target)); return hit ? hit.value : (first ? (inRange[0] || avail[0] || {}).value : (inRange[inRange.length - 1] || avail[avail.length - 1] || {}).value); };
  $("billFrom").value = pick(d.bill_from, true) || "";
  $("billTo").value = pick(d.bill_to, false) || "";
  $("payFrom").value = d.pay_from || ""; $("payTo").value = d.pay_to || "";
  $("billFollow").checked = !!S.bill.follow;
  d._cust = billCustomerGroups(d);
  const cs = [...new Set((d.customers || []).map(c => d._cust[c.customer] || c.customer).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  if ($("billCust").dataset.n !== String(cs.length)) {
    $("billCust").innerHTML = `<option value="">All customers</option>` + cs.map(c => `<option>${esc(c)}</option>`).join("");
    $("billCust").dataset.n = String(cs.length);
  }
  $("billCust").value = S.bill.cust;
  const ts = [...new Set([...(d.bills || []), ...(d.overdue || [])].map(b => b.bill_type).filter(Boolean))].sort();
  $("billType").innerHTML = `<option value="">All bill types</option>` + ts.map(t => `<option>${esc(t)}</option>`).join("");
  $("billType").value = S.bill.type;
  const cats = [...new Set((d.accounts || []).map(a => a.category).filter(Boolean))].sort();
  const keep = $("billGlCat").value;
  $("billGlCat").innerHTML = `<option value="">All categories</option>` + cats.map(c => `<option${c === keep ? " selected" : ""}>${esc(c)}</option>`).join("");
}

const MODULES = {
  budgetm: {
    key: () => [S.fy, S.bank, S.recoup].join("|"), load: () => rpc("rpt_budget_mgmt", { p_fy:S.fy, p_banks: S.bank ? [S.bank] : null, p_recoup: S.recoup || null }),
    render: (d) => {
      const t = d.totals || {};
      $("bmNote").textContent = `${d.fy}: ${fmtDate(d.fy_start)} to ${fmtDate(d.fy_end)}. Actual spending is for the whole financial year` + ((S.bank || S.recoup) ? `, limited to ${[S.bank, S.recoup].filter(Boolean).join(" / ")}. Budget, releases and commitments are not split by bank, so Available is a guide only while a filter is on.` : ".");
      $("bmFigures").innerHTML =
        figure("bal", "Original budget", t.original, "as approved at the start of the year", "target") +
        figure("bal", "Revised budget", t.revised, `supplementary ${money(t.supplementary)}, re-appropriation ${money(Number(t.reapp_in||0) + Number(t.reapp_out||0))}, surrender ${money(t.surrender)}`, "scale") +
        figure("income", "Released", t.released, t.revised ? `${pct(t.released / t.revised)} of the revised budget` : "", "up") +
        figure("spend", "Actual spending", t.actual, t.used_pct !== null && t.used_pct !== undefined ? `${Number(t.used_pct).toFixed(1)}% of the revised budget` : "", "wallet") +
        figure("spend", "Open commitments", t.open_commitments, "remaining on open POs and contracts", "coins") +
        figure(Number(t.available_after_commitments) < 0 ? "spend" : "bal", "Available after commitments", t.available_after_commitments, "revised budget − actual − open commitments", "shield");
      countUp("#bmFigures");
      const F = d.functions || [];
      const fname = x => `<strong>${esc(x.function_id)}</strong> ${esc(x.func_name)} <span class="pill">${esc(x.func_group || "")}</span>`;
      $("bmBuild").innerHTML = tableHtml(["Function","Original","Supplementary","Re-app. in","Re-app. out","Surrender","Revised"],
        F.map(x => `<tr><td>${fname(x)}</td><td>${money(x.original)}</td><td>${money(x.supplementary)}</td><td>${money(x.reapp_in)}</td><td>${money(x.reapp_out)}</td><td>${money(x.surrender)}</td><td><strong>${money(x.revised)}</strong></td></tr>`),
        `<tr class="grand"><td>Total</td><td>${money(t.original)}</td><td>${money(t.supplementary)}</td><td>${money(t.reapp_in)}</td><td>${money(t.reapp_out)}</td><td>${money(t.surrender)}</td><td>${money(t.revised)}</td></tr>`);
      const qc = (q) => { if (!q) return "<td>–</td>"; const off = Number(q.released) - Number(q.policy_amount);
        return `<td class="qcell"><b>${money(q.released)}</b><small>policy ${money(q.policy_amount)}${q.policy_pct != null ? " (" + pct(q.policy_pct) + ")" : ""}${Math.abs(off) > 1 ? `, <span class="${off > 0 ? "down" : "up"}">${off > 0 ? "+" : ""}${money(off)}</span>` : ""}</small></td>`; };
      $("bmRel").innerHTML = tableHtml(["Function","Q1","Q2","Q3","Q4","Released","Not released"],
        F.map(x => `<tr><td>${fname(x)}</td>${["Q1","Q2","Q3","Q4"].map(q => qc((x.by_quarter || {})[q])).join("")}<td><strong>${money(x.released)}</strong><br><small class="mini">${x.released_pct != null ? x.released_pct + "%" : ""}</small></td><td>${money(x.unreleased)}</td></tr>`),
        `<tr class="grand"><td>Total</td><td colspan="4"></td><td>${money(t.released)}</td><td>${money(Number(t.revised) - Number(t.released))}</td></tr>`);
      const C = d.commitments || [];
      $("bmCommit").innerHTML = tableHtml(["Commitment","Vendor","Status","Amount","Remaining"],
        C.map(c => `<tr><td><strong>${esc(c.po_no || c.commitment_id)}</strong><br><small class="mini">${esc(c.type || "")}, ${fmtDate(c.date)}, ${esc((c.functions || []).join(", "))}</small></td><td class="txt">${esc(c.vendor || "")}</td><td><span class="pill">${esc(c.status || "")}</span></td><td>${money(c.amount)}</td><td>${money(c.remaining)}</td></tr>`));
      const MV = d.movements || [];
      $("bmMoves").innerHTML = tableHtml(["Date","Function","Type","Amount","Authority"],
        MV.map(m => `<tr><td>${fmtDate(m.date)}</td><td>${esc(m.function_id)}</td><td>${esc(m.type)}</td><td class="${m.amount < 0 ? "neg" : ""}">${money(m.amount)}</td><td class="txt">${esc(m.authority || "")}<br><small class="mini">${esc([m.sanction, m.reference].filter(Boolean).join(", "))}</small></td></tr>`));
      EXPORTS.bm = [["Function","Name","Group","Original","Supplementary","Re-app in","Re-app out","Surrender","Revised","Q1 released","Q2 released","Q3 released","Q4 released","Released","Actual","Open commitments","Available after commitments"]]
        .concat(F.map(x => [x.function_id, x.func_name, x.func_group, x.original, x.supplementary, x.reapp_in, x.reapp_out, x.surrender, x.revised,
          ...["Q1","Q2","Q3","Q4"].map(q => ((x.by_quarter || {})[q] || {}).released), x.released, x.actual, x.open_commitments, x.available_after_commitments]));
    } },
  payroll: {
    key: () => "register", load: async () => { const [list, sum] = await Promise.all([rpc("rpt_payroll_list"), rpc("rpt_payroll", {})]); return { list, sum }; },
    render: (d) => {
      const s = d.sum || {}, t = s.totals || {}, E = (d.list && d.list.employees) || [];
      $("prNote").textContent = `Salary register for ${d.list.register_month || "the latest month"}. Select an employee to see every pay head.`;
      $("prFigures").innerHTML =
        figure("bal", "Employees on the register", s.headcount, (s.by_grade || []).map(g => `${g.grade} ${g.headcount}`).join(", "), "shield", null, "count") +
        figure("spend", "Monthly pay and allowances", t.total_pay_and_allowances, `pay ${money(t.total_pay)}, allowances ${money(t.total_allowances)}`, "wallet") +
        figure("spend", "Deductions", t.total_deductions, "tax, CPF, loans and others", "scale") +
        figure("income", "Net pay", t.net_pay, "paid to employees' accounts", "coins") +
        figure("bal", "Employer CPF", t.employer_cpf, "KoFHA's contribution", "bank") +
        figure("spend", "Annual estimate", t.annual_pay_and_allowances_estimate, "this month × 12", "up");
      countUp("#prFigures");
      const grades = [...new Set(E.map(e => e.grade).filter(Boolean))].sort();
      if ($("prGrade").options.length !== grades.length + 1) $("prGrade").innerHTML = `<option value="">All grades</option>` + grades.map(g => `<option>${esc(g)}</option>`).join("");
      const q = $("prSearch").value.trim().toLowerCase(), g = $("prGrade").value;
      const rows = E.filter(e => (!g || e.grade === g) && (!q || (e.name + " " + (e.designation || "")).toLowerCase().includes(q)));
      const sum = k => rows.reduce((a, e) => a + Number(e[k] || 0), 0);
      $("prTable").innerHTML = tableHtml(["Employee","BPS","Pay","Allowances","Pay and allowances","Deductions","Net pay"],
        rows.map(e => `<tr class="click" data-emp="${esc(e.name)}" tabindex="0"><td><strong>${esc(e.name)}</strong><br><small class="mini">${esc(e.designation || "")}, ${esc(e.grade || "")}</small></td><td>${esc(e.bps || "")}</td><td>${money(e.total_pay, {full:true})}</td><td>${money(e.total_allowances, {full:true})}</td><td>${money(e.total_pay_and_allowances, {full:true})}</td><td>${money(e.total_deductions, {full:true})}</td><td><strong>${money(e.net_pay, {full:true})}</strong></td></tr>`),
        `<tr class="grand"><td>${rows.length} employees</td><td></td><td>${money(sum("total_pay"), {full:true})}</td><td>${money(sum("total_allowances"), {full:true})}</td><td>${money(sum("total_pay_and_allowances"), {full:true})}</td><td>${money(sum("total_deductions"), {full:true})}</td><td>${money(sum("net_pay"), {full:true})}</td></tr>`);
      EXPORTS.payroll = [["Employee","Designation","BPS","Grade","Pay","Allowances","Pay and allowances","Deductions","Net pay","Employer CPF","Income tax"]]
        .concat(rows.map(e => [e.name, e.designation, e.bps, e.grade, e.total_pay, e.total_allowances, e.total_pay_and_allowances, e.total_deductions, e.net_pay, e.employer_cpf, e.income_tax]));
    } },
  salary: {
    key: () => JSON.stringify([S.from, S.to, SAL.f, SAL.q]),
    load: () => rpc("rpt_salary_history_full", { p: { from:S.from, to:S.to, q:SAL.q, ...SAL.f } }),
    render: (d) => renderSalary(d) },
  billing: {
    key: () => JSON.stringify(billDates()),
    load: async () => { const x = billDates();
      const [d, chk] = await Promise.all([
        rpc("rpt_billing_periods", { p_bill_from: x.bf, p_bill_to: x.bt, p_pay_from: x.pf, p_pay_to: x.pt }),
        rpc("rpt_cashbook_check", { p_from: x.pf, p_to: x.pt }).catch(() => null)]);
      if (d) d.cashbook_check = chk; return d; },
    render: (d) => {
      if (!d.bills) { $("billNote").textContent = d.note || "No billing data yet."; ["billFigures","billTypeTable","billBillsTable","billOverdueTable","billGlTable","billBridge"].forEach(id => $(id).innerHTML = ""); return; }
      S.billData = d;
      syncBillControls(d);
      renderBilling();
    } },
  payables: {
    key: () => S.from + S.to, load: () => rpc("rpt_payables", { p_from:S.from, p_to:S.to }),
    render: (d) => {
      const t = d.invoice_totals || {}, a = d.advance_totals || {};
      $("pyNote").textContent = `Invoices and advances dated ${fmtDate(S.from)} to ${fmtDate(S.to)}.`;
      $("pyFigures").innerHTML =
        figure("spend", "Invoices (gross)", t.gross, `${t.count || 0} invoices`, "wallet") +
        figure("bal", "Tax withheld", Number(t.wht || 0) + Number(t.gst_withheld || 0) + Number(t.sst_withheld || 0), `WHT ${money(t.wht)}, GST ${money(t.gst_withheld)}, SST ${money(t.sst_withheld)}`, "scale") +
        figure("income", "Net payable to vendors", t.net_payable, `${t.fbr_not_submitted || 0} not yet filed with FBR / SRB`, "coins") +
        figure(Number(t.not_yet_recouped) > 0 ? "spend" : "bal", "Not yet recouped", t.not_yet_recouped, `recoupable ${money(t.recoupable)}, recouped ${money(t.amount_recouped)}`, "up") +
        figure(Number(a.outstanding_amount) > 0 ? "spend" : "bal", "Advances outstanding", a.outstanding_amount || 0, `${a.outstanding_count || 0} of ${a.count || 0} advances, ${a.overdue_count || 0} overdue (${money(a.overdue_amount || 0)})`, "shield");
      countUp("#pyFigures");
      const I = d.invoices || [];
      $("pyInv").innerHTML = tableHtml(["Invoice","Vendor","Gross","WHT","GST / SST","Other","Net payable","Status"],
        I.map(i => `<tr><td><strong>${esc(i.invoice_no || i.invoice_id)}</strong><br><small class="mini">${fmtDate(i.date)}, ${esc(i.function_id || "")}, ${esc(i.category || "")}</small></td><td class="txt">${esc(i.vendor || "")}<br><small class="mini">${esc(i.wht_section || "")} at ${pct(i.wht_rate, 1)}</small></td><td>${money(i.gross, {full:true})}</td><td>${money(i.wht, {full:true})}</td><td>${money(Number(i.gst_withheld) + Number(i.sst_withheld), {full:true})}</td><td>${money(Number(i.total_deductions) - Number(i.wht) - Number(i.gst_withheld) - Number(i.sst_withheld), {full:true})}</td><td><strong>${money(i.net_payable, {full:true})}</strong></td><td><span class="pill">${esc(i.status || "")}</span><br><small class="mini">FBR/SRB: ${esc(i.fbr_status || "–")}</small></td></tr>`),
        `<tr class="grand"><td colspan="2">Total</td><td>${money(t.gross, {full:true})}</td><td>${money(t.wht, {full:true})}</td><td>${money(Number(t.gst_withheld || 0) + Number(t.sst_withheld || 0), {full:true})}</td><td></td><td>${money(t.net_payable, {full:true})}</td><td></td></tr>`);
      $("pyVendor").innerHTML = tableHtml(["Vendor","Invoices","Gross","WHT","Net payable"],
        (d.by_vendor || []).map(v => `<tr><td>${esc(v.vendor)}<br><small class="mini">${esc(v.filer_status || "filer status not found")}</small></td><td>${v.invoices}</td><td>${money(v.gross)}</td><td>${money(v.wht)}</td><td>${money(v.net_payable)}</td></tr>`));
      $("pyWht").innerHTML = tableHtml(["Section","Invoices","Gross","WHT"],
        (d.by_wht_section || []).map(w => `<tr><td>${esc(w.section)}</td><td>${w.invoices}</td><td>${money(w.gross)}</td><td>${money(w.wht)}</td></tr>`));
      const A = d.advances || [];
      $("pyAdv").innerHTML = tableHtml(["Advance","Employee","Purpose","Amount","Due","Status"],
        A.map(x => `<tr><td><strong>${esc(x.voucher)}</strong><br><small class="mini">${fmtDate(x.date)}, ${esc(x.function_id || "")}</small></td><td class="txt">${esc(x.employee || x.employee_no || "")}</td><td class="txt">${esc(x.purpose || "")}</td><td>${money(x.amount, {full:true})}</td><td>${fmtDate(x.due_date)}</td><td><span class="pill" style="${x.status === "Overdue" ? "background:color-mix(in srgb, var(--bad) 18%, transparent)" : ""}">${esc(x.status)}</span>${x.days_outstanding ? `<br><small class="mini">${x.days_outstanding} days</small>` : ""}</td></tr>`));
      EXPORTS.invoices = [["Invoice ID","Invoice no","Date","Vendor","Function","Category","Invoice amount","Gross","WHT section","WHT rate","WHT","GST withheld","SST withheld","Total deductions","Net payable","Recoupable","Recouped","FBR/SRB status","Status"]]
        .concat(I.map(i => [i.invoice_id, i.invoice_no, i.date, i.vendor, i.function_id, i.category, i.invoice_amount, i.gross, i.wht_section, i.wht_rate, i.wht, i.gst_withheld, i.sst_withheld, i.total_deductions, i.net_payable, i.recoupable, i.recouped, i.fbr_status, i.status]));
      EXPORTS.advances = [["Voucher","Date","Employee no","Employee","Function","Purpose","Amount","Due date","Bills submitted","UC submitted","Status","Days outstanding"]]
        .concat(A.map(x => [x.voucher, x.date, x.employee_no, x.employee, x.function_id, x.purpose, x.amount, x.due_date, x.bills_submitted, x.uc_submitted, x.status, x.days_outstanding]));
    } },
  maker: {
    key: () => "list", load: async () => ({ list: await rpc("rpt_report_list") }),
    render: (d) => initMaker(d) },
  reports: {
    key: () => "list", load: () => rpc("rpt_report_list"),
    render: (d) => { RL.list = d || []; if (!RL.current) drawReportList(); } },
  forecast: {
    key: () => [S.fy, $("fcAsOf").value || "", S.bank, S.recoup].join("|"),
    load: () => rpc("rpt_forecast", { p_fy:S.fy, p_as_of: $("fcAsOf").value || null, p_banks: S.bank ? [S.bank] : null, p_recoup: S.recoup || null }),
    render: (d) => {
      if (!$("fcAsOf").value) $("fcAsOf").value = d.as_of;
      $("fcAsOf").min = d.fy_start; $("fcAsOf").max = d.fy_end;
      const t = d.totals || {}; const done = d.as_of === d.fy_end;
      const fcFlt = (S.bank || S.recoup) ? ` Limited to ${[S.bank, S.recoup].filter(Boolean).join(" / ")}. The budget is not split by bank, so the comparisons with budget are a guide only while a filter is on.` : "";
      $("fcNote").textContent = (done ? `${d.fy} is complete: these are the final figures.` :
        `${d.fy}, as at ${fmtDate(d.as_of)} (${d.share_of_year_elapsed}% of the year gone, ${d.months_remaining} months left). ${d.method_note}`) + fcFlt;
      const over = Number(t.budget_projected) - Number(t.budget);
      $("fcFigures").innerHTML =
        figure("bal", "Revised budget", t.budget, "budget functions", "target") +
        figure("spend", "Spent so far", t.budget_actual_to_date, t.budget ? `${pct(t.budget_actual_to_date / t.budget)} of budget` : "", "wallet") +
        figure(over > 0 ? "spend" : "income", done ? "Year-end spending" : "Projected year-end spending", t.budget_projected, t.budget ? `${pct(t.budget_projected / t.budget)} of budget` : "", "up") +
        figure(over > 0 ? "spend" : "income", over > 0 ? "Projected overspend" : "Projected saving", Math.abs(over), "against the revised budget", "scale") +
        figure("income", done ? "Year-end income" : "Projected income", t.income_projected, `so far ${money(t.income_to_date)}`, "coins") +
        figure(Number(t.income_projected) - Number(t.expenditure_projected) >= 0 ? "income" : "spend", done ? "Year-end surplus" : "Projected surplus", Number(t.income_projected) - Number(t.expenditure_projected), `projected expenditure ${money(t.expenditure_projected)}`, "shield");
      countUp("#fcFigures");
      const F = d.functions || [];
      $("fcFn").innerHTML = tableHtml(["Function","Budget","Spent so far","Projected year end","Range","Over / (under)","To stay within budget"],
        F.map(x => `<tr><td><strong>${esc(x.function_id)}</strong> ${esc(x.name)}<br><small class="mini">${esc(x.method)}</small></td><td>${money(x.budget)}</td><td>${money(x.actual_to_date)}</td><td><strong>${money(x.projected_year_end)}</strong>${x.projected_used_pct != null ? `<br><small class="mini">${x.projected_used_pct}% of budget</small>` : ""}</td><td class="range">${done ? "–" : money(x.range_low) + " to " + money(x.range_high)}</td><td class="${Number(x.projected_over_budget) > 0 ? "neg" : ""}">${money(x.projected_over_budget)}</td><td>${done ? "–" : (Number(x.budget_left) <= 0 ? `<span class="down">budget already used</span>` : money(x.monthly_spend_to_stay_within_budget) + " a month")}</td></tr>`),
        `<tr class="grand"><td>Total</td><td>${money(t.budget)}</td><td>${money(t.budget_actual_to_date)}</td><td>${money(t.budget_projected)}</td><td></td><td class="${over > 0 ? "neg" : ""}">${money(over)}</td><td></td></tr>`);
      const Sx = d.sections || [];
      $("fcSec").innerHTML = tableHtml(["Section","So far","Same period last year","Change","Projected year end","Last year (full)"],
        Sx.map(x => `<tr><td>${esc(x.section)}<br><small class="mini">${esc(x.type)}, ${esc(x.method)}</small></td><td>${money(x.actual_to_date)}</td><td>${money(x.last_year_same_period)}</td><td>${x.change_vs_last_year_pct != null ? pct(x.change_vs_last_year_pct / 100) : "–"}</td><td><strong>${money(x.projected_year_end)}</strong></td><td>${money(x.last_year_full)}</td></tr>`));
      const sp = d.spikes || [];
      $("fcSpikes").innerHTML = sp.length ? sp.map(x => `<li><span class="dot warn"></span><span><strong>${esc(x.line)}</strong>, ${esc(x.month)}: ${money(x.amount, {rs:true})} against a usual month of ${money(x.usual_month, {rs:true})}.</span></li>`).join("")
        : `<li><span class="dot"></span><span>No unusual months so far.</span></li>`;
      // cumulative chart (budget functions ~ total expenditure lines is shown for all expenditure)
      const mon = d.monthly || []; let cum = 0; const labels = [], act = [], proj = [], bud = [];
      const start = new Date(d.fy_start + "T00:00:00");
      for (let i = 0; i < 12; i++) { const m = new Date(start.getFullYear(), start.getMonth() + i, 1); labels.push(m.toLocaleDateString("en-GB",{month:"short",year:"2-digit"})); }
      const byM = {}; mon.forEach(x => byM[x.month] = Number(x.expenditure));
      const lastIdx = mon.length - 1; const projTot = Number(t.expenditure_projected || 0);
      for (let i = 0; i < 12; i++) {
        const m = new Date(start.getFullYear(), start.getMonth() + i, 1), key = m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0");
        if (i <= lastIdx) { cum += byM[key] || 0; act.push(cum); proj.push(i === lastIdx ? cum : null); }
        else { act.push(null); proj.push(cum + (projTot - cum) * (i - lastIdx) / (11 - lastIdx || 1)); }
      }
      drawChart("chForecast", { type:"line", data:{ labels, datasets:[
        { label:"Spent so far (all expenditure)", data:act, borderColor:css("--spend"), backgroundColor:css("--spend"), tension:.25, pointRadius:2 },
        { label:"Projected", data:proj, borderColor:css("--spend"), borderDash:[6,5], pointRadius:0, tension:.25 } ] }, options: baseOpts({ money:true }) });
      EXPORTS.forecast = [["Function","Name","Budget","Spent so far","Projected year end","Method","Range low","Range high","Projected over budget","Monthly spend to stay within budget"]]
        .concat(F.map(x => [x.function_id, x.name, x.budget, x.actual_to_date, x.projected_year_end, x.method, x.range_low, x.range_high, x.projected_over_budget, x.monthly_spend_to_stay_within_budget]));
    } },
  analysis: {
    key: () => "datasets", load: () => rpc("rpt_datasets"),
    render: (d) => { if (!$("anDs").options.length) initAnalysis(d); } },
  lines: {
    key: () => "lines:" + LN.kind + S.from + S.to, load: () => rpc("rpt_map_lines", { p_kind: LN.kind, p_from: S.from, p_to: S.to }),
    render: (d) => renderLines(d) },
  designer: {
    key: () => "designer", load: () => rpc("rpt_design_meta"),
    render: (d) => renderDesigner(d) },
  columns: {
    key: () => "columns:" + (COLS.table || ""), load: () => rpc("rpt_columns", { p_table: COLS.table || null }),
    render: (d) => renderColumns(d) },
  explorer: {
    key: () => "tables", load: () => rpc("rpt_tables"),
    render: (d) => {
      if (!$("exTable").options.length) {
        $("exTable").innerHTML = (d || []).map(t => `<option value="${esc(t.table)}">${esc(t.table)} (${nfR.format(t.rows || 0)} rows)</option>`).join("");
        S.ex = { offset:0, limit:100 };
        fb("exFb", () => ((d || []).find(t => t.table === $("exTable").value) || {}).columns || [], () => { S.ex.offset = 0; browse(); });
        browse();
      }
    } },
};
