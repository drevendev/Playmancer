import assert from "node:assert/strict";
import test from "node:test";
import { CATALOG, BY_ID, initialState, validateState, encodeState, decodeState, constraintState, pairEvidence, recommend } from "../src/demo.js";
const ids = (result) => result.ranked.map((item) => item.id);

test("fixture has twelve unique fictional canonical profiles and no remote assets", () => {
  assert.equal(CATALOG.length, 12);
  assert.equal(BY_ID.size, 12);
  assert.ok(CATALOG.every((game) => game.id.startsWith("demo:") && !game.image && !game.url));
});
test("default basket is deterministic, excludes seeds, and keeps missing evidence separate", () => {
  const a = recommend(initialState());
  assert.deepEqual(a, recommend(initialState()));
  assert.ok(a.ranked.length > 0);
  assert.ok(a.ranked.every((item) => !initialState().seeds.some((seed) => seed.id === item.id)));
  assert.ok(a.uncertain.some((item) => item.id === "demo:lantern"));
  assert.ok(a.uncertain.some((item) => item.id === "demo:silent"));
});
test("share round trip preserves ordered seeds, raw weights, constraints, exclusions, and versions", () => {
  const state = { ...initialState(), seeds: [{ id: "demo:harvest", weight: 7 }, { id: "demo:ember", weight: 2 }], mode: "blend", lambda: 0.7, platform: "linux", coopOnly: true, excluded: ["demo:grove"] };
  assert.deepEqual(decodeState(encodeState(state)), state);
  assert.deepEqual(recommend(decodeState(encodeState(state))), recommend(state));
});
test("empty basket gives empty results, not a default fallback", () => {
  assert.deepEqual(recommend({ ...initialState(), seeds: [] }).ranked, []);
});
test("one-seed Blend preserves ordinary average ordering", () => {
  const state = { ...initialState(), seeds: [{ id: "demo:ember", weight: 3 }] };
  assert.deepEqual(ids(recommend({ ...state, mode: "blend" })), ids(recommend({ ...state, mode: "arithmetic" })));
});
test("a platform filter is evaluated per request rather than cached on the candidate", () => {
  const game = BY_ID.get("demo:harvest");
  assert.equal(constraintState(game, { ...initialState(), platform: "windows" }), "pass");
  assert.equal(constraintState(game, { ...initialState(), platform: "linux" }), "fail");
  const unknown = BY_ID.get("demo:echo");
  assert.equal(constraintState(unknown, initialState()), "pass");
  assert.equal(constraintState(unknown, { ...initialState(), platform: "windows" }), "unknown");
});
test("hard-constraint unknown never enters ranked results", () => {
  const result = recommend({ ...initialState(), platform: "linux", coopOnly: true });
  assert.ok(result.ranked.every((item) => BY_ID.get(item.id).platforms?.includes("linux") && BY_ID.get(item.id).coop === true));
  assert.ok(result.uncertain.some((item) => item.id === "demo:echo"));
});
test("known failure dominates missing evidence in combined constraints", () => {
  assert.equal(constraintState({ platforms: null, coop: false }, { ...initialState(), platform: "linux", coopOnly: true }), "fail");
});
test("exclude every candidate yields empty results without relaxing filters", () => {
  const state = { ...initialState(), excluded: CATALOG.map((game) => game.id) };
  assert.deepEqual(ids(recommend(state)), []);
  assert.equal(recommend(state).excluded.length, 12);
});
test("missing mechanics is uncertainty, not zero similarity or high-confidence theme-only fit", () => {
  const pair = pairEvidence(BY_ID.get("demo:lantern"), BY_ID.get("demo:ember"));
  assert.equal(pair.affinity, null);
  assert.equal(pair.coverage, 0.3);
});
test("observed mismatches remain zero affinity instead of missing evidence", () => {
  const pair = pairEvidence({ mechanics: ["a"], themes: ["x"] }, { mechanics: ["b"], themes: ["y"] });
  assert.equal(pair.affinity, 0);
  assert.equal(pair.coverage, 1);
});
test("no map or popularity fields influence ranking", () => {
  const changed = CATALOG.map((game, index) => ({ ...game, x: 5000 - index, y: index * 800, popularity: index * 100000 }));
  assert.deepEqual(recommend(initialState(), changed), recommend(initialState()));
});
test("catalog order does not change the ranked output", () => {
  for (const mode of ["intersection", "blend", "arithmetic"]) {
    const state = { ...initialState(), mode };
    assert.deepEqual(recommend(state, [...CATALOG].reverse()), recommend(state));
  }
});
test("unequal weights can change real fixture ordering", () => {
  const state = { ...initialState(), mode: "arithmetic" };
  const a = recommend({ ...state, seeds: [{ id: "demo:ember", weight: 10 }, { id: "demo:harvest", weight: 1 }] });
  const b = recommend({ ...state, seeds: [{ id: "demo:ember", weight: 1 }, { id: "demo:harvest", weight: 10 }] });
  assert.notDeepEqual(ids(a), ids(b));
});
test("unavailable versions and unsupported Bridge fail closed", () => {
  for (const patch of [{ v: 2 }, { catalog: "old" }, { method: "unknown" }, { mode: "bridge" }]) assert.throws(() => validateState({ ...initialState(), ...patch }));
});
test("unknown IDs, duplicate IDs, and more than five seeds are rejected", () => {
  assert.throws(() => validateState({ ...initialState(), seeds: [{ id: "<script>", weight: 1 }] }));
  assert.throws(() => validateState({ ...initialState(), seeds: [initialState().seeds[0], initialState().seeds[0]] }));
  assert.throws(() => validateState({ ...initialState(), seeds: CATALOG.slice(0, 6).map((game) => ({ id: game.id, weight: 1 })) }));
});
test("nonfinite/out-of-range weights and constraints are rejected rather than coerced", () => {
  for (const weight of [0, 11, -1, 0.5, Infinity, NaN, "2"]) assert.throws(() => validateState({ ...initialState(), seeds: [{ id: "demo:ember", weight }] }));
  for (const patch of [{ platform: "unsupported" }, { coopOnly: "yes" }, { lambda: -0.1 }, { lambda: Infinity }, { excluded: ["unknown"] }]) assert.throws(() => validateState({ ...initialState(), ...patch }));
});
test("malformed and oversized links never silently become the default basket", () => {
  for (const hash of ["#unknown", "#basket=%FF", "#basket=null", "#basket=" + "x".repeat(6000)]) assert.throws(() => decodeState(hash));
});
