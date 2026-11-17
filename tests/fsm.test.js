// Run: node --test tests/fsm.test.js   (no install needed)
const test = require("node:test"), assert = require("node:assert");
const { machine, latest, KOFHA } = require("../js/fsm.js");

test("allowed event moves the state and notifies", () => {
  const m = machine("t1", { initial:"a", states:{ a:{ on:{ GO:"b" } }, b:{} } });
  const seen = []; m.subscribe((to, from, ev) => seen.push([from, ev, to]));
  assert.strictEqual(m.send("GO"), true);
  assert.strictEqual(m.state, "b");
  assert.deepStrictEqual(seen, [["a", "GO", "b"]]);
});
test("unknown event is ignored, logged, never thrown", () => {
  const m = machine("t2", { initial:"a", states:{ a:{ on:{} } } });
  assert.strictEqual(m.send("NOPE"), false);
  assert.strictEqual(m.state, "a");
  assert.deepStrictEqual(KOFHA.log.at(-1).to, null);
});
test("can() reports allowed events", () => {
  const m = machine("t3", { initial:"a", states:{ a:{ on:{ GO:"a" } } } });
  assert.ok(m.can("GO")); assert.ok(!m.can("STOP"));
});
test("latest request wins", () => {
  const a = latest.begin("x"), b = latest.begin("x");
  assert.ok(!latest.is("x", a)); assert.ok(latest.is("x", b));
});
test("notice machine: online never hides a new-version offer", () => {
  const n = machine("t4", { initial:"hidden", states:{
    hidden:{ on:{ OFFLINE:"offline", UPDATE:"update" } }, offline:{ on:{ ONLINE:"hidden", UPDATE:"update" } }, update:{ on:{ UPDATE:"update" } } } });
  n.send("OFFLINE"); n.send("UPDATE"); n.send("ONLINE");
  assert.strictEqual(n.state, "update");
});
