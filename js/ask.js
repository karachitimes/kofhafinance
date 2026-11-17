/* ---------- Ask KoFHA (plain-language questions) ---------- */
const askHist = [];
function md(text){
  const lines = esc(text).split(/\r?\n/); let out = "", list = false, tbl = [];
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>").replace(/`(.+?)`/g, "<code>$1</code>");
  const flushT = () => { if (!tbl.length) return;
    const rows = tbl.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r)).map(r => r.replace(/^\s*\||\|\s*$/g, "").split("|").map(c => inline(c.trim())));
    out += `<div class="tscroll" style="box-shadow:none"><table><thead><tr>${rows[0].map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
      rows.slice(1).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("") + "</tbody></table></div>"; tbl = []; };
  const flushL = () => { if (list) { out += "</ul>"; list = false; } };
  for (const ln of lines){
    if (/^\s*\|.*\|\s*$/.test(ln)) { flushL(); tbl.push(ln); continue; }
    flushT();
    const b = ln.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (b) { if (!list) { out += "<ul>"; list = true; } out += `<li>${inline(b[1])}</li>`; continue; }
    flushL();
    if (/^\s*#{1,4}\s+/.test(ln)) { out += `<p><strong>${inline(ln.replace(/^\s*#{1,4}\s+/, ""))}</strong></p>`; continue; }
    if (ln.trim()) out += `<p>${inline(ln)}</p>`;
  }
  flushT(); flushL(); return out;
}
function bubble(cls, html){ const d = document.createElement("div"); d.className = "msg " + cls; d.innerHTML = html; $("thread").appendChild(d); d.scrollIntoView({ block:"end", behavior:"smooth" }); return d; }
function sourceNote(used, model){
  const parts = (used || []).map(u => { const a = u.args || {};
    const what = u.tool === "find_transactions" ? "entries " : u.tool === "get_statement" ? (String(a.kind) === "sfp" ? "balance sheet " : "income & expenditure ")
               : u.tool === "run_report" && a.report_id ? `report ${a.report_id} ` : u.tool === "get_payroll" ? "payroll " : "report ";
    return what + (a.from_date ? `${fmtDate(a.from_date)} to ${fmtDate(a.to_date)}` : a.to_date ? `at ${fmtDate(a.to_date)}` : a.fy ? `FY ${a.fy}` : ""); });
  return `<div class="src">Figures from: ${esc([...new Set(parts)].join("; ") || "no report data")}${model ? " · " + esc(model) : ""}</div>`;
}
let askSeq = 0;
// Ask KoFHA: idle / waiting / answered / failed / stopped (only the newest question moves it)
const ASK = machine("ask", { initial:"idle", states:{
  idle:     { on:{ ASK:"waiting" } },
  waiting:  { on:{ ASK:"waiting", ANSWER:"answered", FAIL:"failed", STOP:"stopped", RESET:"idle" } },
  answered: { on:{ ASK:"waiting", RESET:"idle" } },
  failed:   { on:{ ASK:"waiting", RESET:"idle" } },
  stopped:  { on:{ ASK:"waiting", RESET:"idle" } }
} });
async function ask(q){
  q = (q || "").trim(); if (!q) return;
  $("suggest").classList.add("hidden");
  bubble("user", esc(q));
  const my = ++askSeq, t0 = Date.now(); ASK.send("ASK");
  const wait = bubble("bot", `<span class="typing" aria-label="Working"><i></i><i></i><i></i></span> <small class="mini" data-el></small> <button class="btn ghost hidden" type="button" data-stop style="margin-left:8px;padding:2px 10px">Stop waiting</button>`);
  const elT = wait.querySelector("[data-el]"), stopB = wait.querySelector("[data-stop]");
  let stopped = false;
  const tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000);
    elT.textContent = s < 8 ? "" : s < 25 ? `Working on it… ${s}s` : `Still working (the reports are being read)… ${s}s`;
    if (s >= 15) stopB.classList.remove("hidden"); }, 1000);
  $("askSend").disabled = true; $("askInput").value = "";
  const LIMIT_MS = 120000;
  try {
    const call = sb.functions.invoke("ask-kofha", { body:{ question:q, history:askHist.slice(-6), today:iso(new Date()),
      view: S.from ? { from:S.from, to:S.to, fy:S.fy, bank:S.bank || null, recoup:S.recoup || null } : null } });
    const stop = new Promise(res => stopB.addEventListener("click", () => { stopped = true; res({ stopped:true }); }));
    const late = new Promise(res => setTimeout(() => res({ late:true }), LIMIT_MS));
    const r = await Promise.race([call, stop, late]);
    if (r.stopped) throw new Error("Stopped. Ask again, or ask about one topic or one period at a time for a quicker answer.");
    if (r.late) throw new Error("No answer after 2 minutes. Google's Gemini service may be slow right now; please try again in a minute, or ask a narrower question.");
    const { data, error } = r;
    if (error) {
      let msg = error.message || "The question service did not answer.";
      try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch(e){}
      if (/not found|404/i.test(msg)) msg = "The question service is not set up yet. The finance office needs to deploy the ask-kofha Edge Function.";
      else if (/546|504|WORKER|timed? ?out|non-2xx/i.test(msg)) msg = "The question took too long and was stopped. Please try again, or ask about one topic or one period at a time.";
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    const fu = (data.followups || []).filter(Boolean);
    const took = data.cached ? "answered from a recent identical question" : (data.seconds ? `${data.seconds}s` : "");
    wait.innerHTML = md(data.answer || "") + sourceNote(data.used, [data.model, took].filter(Boolean).join(" · ")) +
      `<div class="tools" style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">` +
      fu.map(x => `<button class="chip" type="button" data-fu>${esc(x)}</button>`).join("") +
      `<button class="btn ghost" type="button" data-copy style="padding:2px 10px">Copy</button></div>` +
      ((data.open || []).length ? `<div class="tools" style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">` +
        data.open.map((o, i) => `<button class="btn ghost" type="button" data-open="${i}" style="padding:2px 10px">Open report: ${esc(((RL.list || []).find(x => x.id === o.report_id) || {}).title || o.report_id)}</button>`).join("") + `</div>` : "") +
      (data.log_id ? `<div class="rate" style="margin-top:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap"><small class="mini">Was this right?</small>
        <button class="btn ghost" type="button" data-rate="1" style="padding:2px 10px">Good</button>
        <button class="btn ghost" type="button" data-rate="-1" style="padding:2px 10px">Wrong</button>
        <input type="text" data-ratec placeholder="What was wrong? (optional)" class="hidden" style="flex:1;min-width:160px">
        <button class="btn ghost hidden" type="button" data-ratesend style="padding:2px 10px">Send</button></div>` : "");
    wait.querySelectorAll("[data-fu]").forEach(b => b.addEventListener("click", () => ask(b.textContent)));
    wait.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", () => openReportFromAsk(data.open[Number(b.dataset.open)])));
    const rate = wait.querySelector(".rate");
    if (rate) {
      const send = async (v, c) => { try { await rpc("rpt_ask_feedback", { p_id: data.log_id, p_rating: v, p_comment: c || null });
        rate.innerHTML = `<small class="mini">${v > 0 ? "Thank you." : "Thank you. The finance office will look at this answer (Report library > Ask KoFHA questions)."}</small>`; } catch(e){ rate.innerHTML = `<small class="mini">${esc(e.message)}</small>`; } };
      rate.querySelector('[data-rate="1"]').addEventListener("click", () => send(1));
      rate.querySelector('[data-rate="-1"]').addEventListener("click", () => {
        rate.querySelector("[data-ratec]").classList.remove("hidden"); rate.querySelector("[data-ratesend]").classList.remove("hidden"); rate.querySelector("[data-ratec]").focus(); });
      rate.querySelector("[data-ratesend]").addEventListener("click", () => send(-1, rate.querySelector("[data-ratec]").value.trim()));
      rate.querySelector("[data-ratec]").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); send(-1, e.target.value.trim()); } });
    }
    const cp = wait.querySelector("[data-copy]");
    cp.addEventListener("click", () => { try { navigator.clipboard.writeText(data.answer || ""); cp.textContent = "Copied"; setTimeout(() => cp.textContent = "Copy", 1500); } catch(e){} });
    askHist.push({ role:"user", text:q }, { role:"model", text:data.answer || "" });
    if (my === askSeq) ASK.send("ANSWER");
  } catch(e){ wait.classList.add("err"); wait.innerHTML = esc(e.message); if (my === askSeq) ASK.send(stopped ? "STOP" : "FAIL"); }
  finally { clearInterval(tick); if (my === askSeq) { $("askSend").disabled = false; $("askInput").focus(); } }
}
$("askForm").addEventListener("submit", e => { e.preventDefault(); ask($("askInput").value); });
$("askInput").addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask($("askInput").value); } });
$("askInput").addEventListener("input", e => { e.target.style.height = "auto"; e.target.style.height = Math.min(160, e.target.scrollHeight) + "px"; });
$("suggest").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) ask(b.textContent); });
$("askNew").addEventListener("click", () => { askHist.length = 0; if (ASK.can("RESET")) ASK.send("RESET"); $("thread").innerHTML = ""; $("suggest").classList.remove("hidden"); });
