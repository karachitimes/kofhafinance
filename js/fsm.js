/* =================================================================
   Small finite state machines: one place that says which states a part of the page can be in and which events move it.
   Pattern taken from robot (thisrobot.life), @xstate/fsm and zag-js: a plain transition table, guards are not needed here,
   the current state is written to <html data-NAME="state"> so CSS, tests and AI agents can read it without our code.
   See docs/STATE_MACHINES.md for the list of machines.

   const m = machine("screen", { initial:"boot", states:{ boot:{ on:{ PUBLIC:"public" } }, public:{} } });
   m.send("PUBLIC"); m.state; m.can("PUBLIC"); m.subscribe((state, prev, event, data) => ...);
   An event the current state does not list is ignored and logged (console + KOFHA.log), never thrown.
   ================================================================= */
const KOFHA = (typeof window !== "undefined" ? (window.KOFHA = window.KOFHA || {}) : {});
KOFHA.machines = KOFHA.machines || {};
KOFHA.log = KOFHA.log || [];                     // last 100 transitions: { t, machine, from, event, to } (to null = ignored)
function machine(name, def){
  const subs = [];
  const m = {
    name, state: def.initial, def,
    can(ev){ const s = def.states[m.state]; return !!(s && s.on && Object.prototype.hasOwnProperty.call(s.on, ev)); },
    send(ev, data){
      const from = m.state, s = def.states[from], to = s && s.on ? s.on[ev] : undefined;
      KOFHA.log.push({ t: Date.now(), machine: name, from, event: ev, to: to === undefined ? null : to });
      if (KOFHA.log.length > 100) KOFHA.log.shift();
      if (to === undefined) { if (typeof console !== "undefined") console.warn(`[${name}] ${ev} ignored in state ${from}`); return false; }
      m.state = to; m.data = data;
      if (typeof document !== "undefined") document.documentElement.dataset[name] = to;
      subs.slice().forEach(fn => { try { fn(to, from, ev, data); } catch (e) { if (typeof console !== "undefined") console.error(e); } });
      return true;
    },
    subscribe(fn){ subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }
  };
  if (typeof document !== "undefined") document.documentElement.dataset[name] = def.initial;
  KOFHA.machines[name] = m;
  return m;
}

/* Latest request wins: a slower old answer must not overwrite the answer to a newer question.
   const tok = latest.begin("txn"); const r = await rpc(...); if (!latest.is("txn", tok)) return; */
const latest = { n: {}, begin(k){ return (this.n[k] = (this.n[k] || 0) + 1); }, is(k, tok){ return this.n[k] === tok; } };

/* What the page is doing right now, in one object: for support, tests and AI agents (window.KOFHA.snapshot()). */
KOFHA.snapshot = function(){
  const out = {};
  Object.keys(KOFHA.machines).forEach(k => out[k] = KOFHA.machines[k].state);
  if (typeof S !== "undefined") Object.assign(out, { tab: S.tab, fy: S.fy, from: S.from, to: S.to, bank: S.bank || null, recoup: S.recoup || null,
    report: (typeof RL !== "undefined" && RL.current) ? RL.current.id : null, txnOffset: S.txn ? S.txn.offset : null });
  return out;
};

if (typeof module !== "undefined") module.exports = { machine, latest, KOFHA };
