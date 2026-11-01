import test from "node:test";
import assert from "node:assert/strict";
import { prepareEvidenceModel } from "../src/evidence-similarity.js";
import { CURATED_BRIDGE_VERSION, findCuratedBridge } from "../src/evidence-bridge.js";

const source = "fixture:curated-receipt";
function game(id, { platforms = ["windows"], coop = true } = {}) {
  return { id, tags: null,
    metadata: platforms === null ? {} : { platforms: { value: platforms, source } },
    coop, ...(coop === null ? {} : { coopSource: source }) };
}
const ids = ["demo:a", "demo:b", "demo:c", "demo:d", "demo:e"];
const edge = (from, to, strength = 1, type = "similar") =>
  ({ from, to, strength, type, source });
function model(relations, overrides = {}) {
  return prepareEvidenceModel({
    games: ids.map(id => game(id, overrides[id])),
    relations,
  });
}
const route = (m, options = {}) =>
  findCuratedBridge(m, { from: "demo:a", to: "demo:d", ...options });

test("direct authored edge wins and preserves its direction on reverse traversal", () => {
  const m = model([edge("demo:d", "demo:a", 0.8, "inspired-by")]);
  const forward = route(m);
  assert.equal(forward.method, CURATED_BRIDGE_VERSION);
  assert.equal(forward.status, "route");
  assert.deepEqual(forward.nodes, ["demo:a", "demo:d"]);
  assert.equal(forward.evidenceStrength, 0.8);
  assert.deepEqual(forward.hops, [{
    travelFrom: "demo:a", travelTo: "demo:d",
    authoredFrom: "demo:d", authoredTo: "demo:a",
    type: "inspired-by", strength: 0.8, source,
  }]);
  const reverse = findCuratedBridge(m, { from: "demo:d", to: "demo:a" });
  assert.equal(reverse.hops[0].authoredFrom, "demo:d");
  assert.equal(reverse.hops[0].authoredTo, "demo:a");
  assert.equal(reverse.hops[0].travelFrom, "demo:d");
});

test("two-hop route is attenuated, tie-broken deterministically, and never marked direct", () => {
  const connections = [
    edge("demo:a", "demo:b", .8),
    edge("demo:b", "demo:d", .5, "references"),
    edge("demo:c", "demo:a", .4, "inspired-by"),
    edge("demo:d", "demo:c", 1),
  ];
  const one = route(model(connections));
  const two = route(model([...connections].reverse()));
  assert.deepEqual(one, two);
  assert.equal(one.status, "route");
  assert.equal(one.hops.length, 2);
  assert.deepEqual(one.nodes, ["demo:a", "demo:b", "demo:d"]);
  assert.ok(Math.abs(one.evidenceStrength - .2) < 1e-12);
  assert.equal(one.hops[1].type, "references");
  assert.deepEqual(one.hops.map(x => x.source), [source, source]);
});

test("hard exclusions block intermediary routes; eligible alternatives remain available", () => {
  const m = model([edge("demo:a", "demo:b"), edge("demo:b", "demo:d"),
    edge("demo:a", "demo:c", .6), edge("demo:c", "demo:d", .6)]);
  assert.deepEqual(route(m, { excluded: ["demo:b"] }).nodes,
    ["demo:a", "demo:c", "demo:d"]);
  assert.deepEqual(route(m, { excluded: ["demo:b", "demo:c"] }).status, "no-route");
  const blocked = route(m, { excluded: ["demo:a"] });
  assert.equal(blocked.status, "excluded");
  assert.equal(blocked.evidenceStrength, null);
  assert.deepEqual(blocked.hops, []);
});

test("missing mandatory intermediary facts abstain; failed facts cannot pass", () => {
  const relations = [edge("demo:a", "demo:b"), edge("demo:b", "demo:d")];
  const missingPlatform = route(model(relations, {
    "demo:b": { platforms: null },
  }), { platform: "windows" });
  assert.equal(missingPlatform.status, "uncertain");
  assert.equal(missingPlatform.reason, "intermediate-required-metadata-unknown");
  assert.deepEqual(missingPlatform.unknownIntermediates, ["demo:b"]);
  assert.equal(missingPlatform.evidenceStrength, null);
  assert.equal(route(model(relations, {
    "demo:b": { platforms: ["linux"] },
  }), { platform: "windows" }).status, "no-route");
  assert.equal(route(model(relations, {
    "demo:b": { coop: null },
  }), { coopOnly: true }).status, "uncertain");
  assert.equal(route(model(relations, {
    "demo:b": { coop: false },
  }), { coopOnly: true }).status, "no-route");
});

test("endpoint unknowns and failures never fabricate a usable Bridge", () => {
  const m = model([edge("demo:a", "demo:d")], {
    "demo:a": { platforms: null },
  });
  assert.equal(route(m, { platform: "windows" }).reason,
    "endpoint-required-metadata-unknown");
  assert.equal(route(m, { platform: "windows" }).status, "uncertain");
  assert.equal(route(m, { platform: "linux" }).status, "excluded");
  assert.equal(route(model([edge("demo:a", "demo:d")], {
    "demo:d": { coop: false },
  }), { coopOnly: true }).status, "excluded");
});

test("three-hop paths and tag-only similarity are not curated Bridge routes", () => {
  const m = model([edge("demo:a", "demo:b"), edge("demo:b", "demo:c"),
    edge("demo:c", "demo:d")]);
  const result = route(m);
  assert.equal(result.status, "no-route");
  assert.equal(result.reason, "no-eligible-curated-path");
  assert.deepEqual(result.nodes, []);
  assert.equal(result.evidenceStrength, null);
  assert.equal(route(model([])).status, "no-route");
});

test("invalid endpoints and constraints fail visibly", () => {
  const m = model([]);
  assert.throws(() => route(m, { to: "demo:a" }), /distinct catalog IDs/);
  assert.throws(() => route(m, { to: "demo:missing" }), /distinct catalog IDs/);
  assert.throws(() => route(m, { excluded: ["demo:missing"] }), /invalid Bridge/);
  assert.throws(() => route(m, { excluded: ["demo:b", "demo:b"] }), /invalid Bridge/);
  assert.throws(() => route(m, { platform: "" }), /invalid Bridge/);
  assert.throws(() => route(m, { coopOnly: "yes" }), /invalid Bridge/);
});
