import test from "node:test";
import assert from "node:assert/strict";
import { prepareEvidenceModel, compareEvidenceGames, rankEvidenceBasket,
  EVIDENCE_METHOD_VERSION } from "../src/evidence-similarity.js";
const tag = (id, weight, source = "authored-fixture") => ({ id, weight, source });
const field = value => ({ value, source: "authored-fixture" });
const a = { id: "demo:a", tags: [tag("genre:rpg", 0.7), tag("mood:cozy", 0.3)],
  metadata: { creator: field("A"), platforms: field(["windows"]) }, coop: true, coopSource: "authored-fixture" };
const b = { id: "demo:b", tags: [tag("genre:rpg", 0.3), tag("mood:cozy", 0.7)],
  metadata: { creator: field("A"), platforms: field(["windows", "linux"]) }, coop: null };
const c = { id: "demo:c", tags: [tag("genre:puzzle", 1)],
  metadata: { creator: field("B"), platforms: field(["linux"]) }, coop: false, coopSource: "authored-fixture" };
const d = { id: "demo:d", tags: [tag("genre:puzzle", 1)], metadata: {}, coop: null };
const model = (games = [a, b, c, d], relations = []) => prepareEvidenceModel({ games, relations });
const relation = (from, to, strength = 1, type = "similar") =>
  ({ from, to, strength, type, source: "https://example.org/receipt" });
// Evidence lane arithmetic is floating point (0.27 + 0.08 != 0.35 exactly).
// Verify the lane names exactly and each value within a tight numeric tolerance.
function assertCoverageLanes(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const [lane, value] of Object.entries(expected)) {
    assert.ok(Math.abs(actual[lane] - value) < 1e-12,
      `unexpected coverage for ${lane}: ${actual[lane]} vs ${value}`);
  }
}

test("weighted tags allocate exactly one unit per game", () => {
  assert.throws(() => model([{ ...a, tags: [tag("genre:rpg", .4)] }]), /sum to 1/);
  assert.throws(() => model([{ ...a, tags: [tag("genre:rpg", 1), tag("genre:rpg", .1)] }]), /duplicate tag/);
  assert.throws(() => model([{ ...a, tags: [tag("genre:rpg", NaN)] }]), /finite/);
  assert.throws(() => model([{ ...a, tags: [tag("genre:rpg", 1, "")] }]), /source/);
  assert.equal(model().version, EVIDENCE_METHOD_VERSION);
});
test("weighted mass intersection respects unequal tag weights, not set size", () => {
  const ab = compareEvidenceGames(model(), a.id, b.id);
  assert.equal(ab.status, "rankable");
  assert.ok(Math.abs(ab.tags.similarity - 0.6) < 1e-10);
  assert.equal(ab.metadata.matches.length, 2);
  assert.ok(Math.abs(ab.metadata.coverage - 0.35) < 1e-10);
  assert.ok(ab.affinity > 0 && ab.affinity < 1);
  assert.deepEqual(ab.tags.shared.map(e => e.id), ["genre:rpg", "mood:cozy"]);
  assert.equal(compareEvidenceGames(model(), b.id, a.id).affinity, ab.affinity);
});
test("reports sourced residual weighted mass on both sides including emphasis gaps", () => {
  const pair = compareEvidenceGames(model(), a.id, b.id);
  assert.deepEqual(pair.tags.leftOnly.map(item => item.id), ["genre:rpg"]);
  assert.deepEqual(pair.tags.rightOnly.map(item => item.id), ["mood:cozy"]);
  assert.ok(Math.abs(pair.tags.leftOnly[0].mass - .4) < 1e-12);
  assert.ok(Math.abs(pair.tags.rightOnly[0].mass - .4) < 1e-12);
  assert.equal(pair.tags.leftOnly[0].source, "authored-fixture");
  assert.equal(pair.tags.rightOnly[0].source, "authored-fixture");
  for (const side of ["leftOnly", "rightOnly"]) {
    assert.ok(Math.abs(pair.tags.similarity +
      pair.tags[side].reduce((sum, item) => sum + item.mass, 0) - 1) < 1e-12);
  }
  const disjoint = compareEvidenceGames(model(), a.id, c.id);
  assert.equal(disjoint.tags.similarity, 0);
  for (const side of ["leftOnly", "rightOnly"]) {
    assert.ok(Math.abs(disjoint.tags[side].reduce((sum, item) => sum + item.mass, 0) - 1) < 1e-12);
  }
});
test("missing tags abstain instead of treating missing as a mismatch", () => {
  const m = model([a, { ...b, tags: null }]);
  const pair = compareEvidenceGames(m, a.id, b.id);
  assert.equal(pair.status, "uncertain");
  assert.equal(pair.affinity, null);
  assert.ok(pair.metadata.coverage > 0);
  assert.equal(pair.tags.leftOnly, null);
  assert.equal(pair.tags.rightOnly, null);
});
test("metadata is secondary: same common platform is a weak match", () => {
  const pair = compareEvidenceGames(model(), a.id, c.id);
  assert.equal(pair.tags.similarity, 0);
  assert.equal(pair.metadata.similarity, 0);
  const platformOnly = compareEvidenceGames(model(), a.id, b.id);
  assert.ok(platformOnly.metadata.similarity < 0.35);
});
test("sourced direct influence is symmetric as affinity but keeps its arrow", () => {
  const m = model(undefined, [relation("demo:c", "demo:a", .8, "inspired-by")]);
  const ac = compareEvidenceGames(m, a.id, c.id);
  const ca = compareEvidenceGames(m, c.id, a.id);
  assert.equal(ac.relations.direct.from, "demo:c");
  assert.equal(ac.relations.direct.to, "demo:a");
  assert.equal(ac.affinity, ca.affinity);
  assert.equal(ac.relations.twoHop, null);
  assert.equal(ac.relations.direct.source, "https://example.org/receipt");
});
test("reference and inspiration receipts are factual routes, not taste boosts", () => {
  const baseline = compareEvidenceGames(model(), a.id, c.id);
  for (const type of ["references", "inspired-by"]) {
    const withReceipt = compareEvidenceGames(model(undefined,
      [relation("demo:c", "demo:a", 1, type)]), a.id, c.id);
    assert.equal(withReceipt.status, "rankable");
    assert.equal(withReceipt.affinity, baseline.affinity);
    assert.equal(withReceipt.relations.direct.type, type);
    assert.equal(withReceipt.relations.direct.from, "demo:c");
    assert.equal(withReceipt.relations.direct.source, "https://example.org/receipt");
    assert.equal(withReceipt.evidenceCoverageByLane.direct, .08);
  }
  const similar = compareEvidenceGames(model(undefined,
    [relation("demo:c", "demo:a", 1, "similar")]), a.id, c.id);
  assert.ok(Math.abs(similar.affinity - baseline.affinity - .08) < 1e-12);
});
test("mixed two-hop reference routes do not masquerade as semantic affinity", () => {
  const baseline = compareEvidenceGames(model(), a.id, c.id);
  const mixed = compareEvidenceGames(model(undefined, [
    relation("demo:a", "demo:b", .8, "references"),
    relation("demo:b", "demo:c", .5, "similar"),
  ]), a.id, c.id);
  assert.equal(mixed.relations.direct, null);
  assert.equal(mixed.relations.twoHop.strength, .2);
  assert.deepEqual(mixed.relations.twoHop.hops.map(hop => hop.type),
    ["references", "similar"]);
  assert.equal(mixed.affinity, baseline.affinity);
  assert.equal(mixed.evidenceCoverageByLane.twoHop, .03);
  const bothSimilar = compareEvidenceGames(model(undefined, [
    relation("demo:a", "demo:b", .8, "similar"),
    relation("demo:b", "demo:c", .5, "similar"),
  ]), a.id, c.id);
  assert.ok(Math.abs(bothSimilar.affinity - baseline.affinity - .03 * .2) < 1e-12);
});

test("two hops decay, never claim that a transitive link is a direct source", () => {
  const m = model(undefined, [relation("demo:a", "demo:b", .8), relation("demo:b", "demo:c", .5)]);
  const ac = compareEvidenceGames(m, a.id, c.id);
  assert.equal(ac.relations.direct, null);
  assert.equal(ac.relations.twoHop.via, "demo:b");
  assert.equal(ac.relations.twoHop.strength, .2);
  assert.deepEqual(ac.relations.twoHop.hops.map(hop => [hop.from, hop.to, hop.type]),
    [["demo:a", "demo:b", "similar"], ["demo:b", "demo:c", "similar"]]);
  assert.deepEqual(ac.relations.twoHop.hops.map(hop => hop.source), ac.relations.twoHop.sources);
  assert.ok(ac.affinity > 0);
  assert.equal(compareEvidenceGames(m, a.id, d.id).relations.twoHop, null);
});
test("reverse traversal preserves both original authored direction/type claims", () => {
  const m = model(undefined, [
    relation("demo:b", "demo:a", .8, "inspired-by"),
    relation("demo:c", "demo:b", .5, "references"),
  ]);
  const forward = compareEvidenceGames(m, a.id, c.id).relations.twoHop;
  const reverse = compareEvidenceGames(m, c.id, a.id).relations.twoHop;
  assert.equal(forward.strength, reverse.strength);
  const edges = hops => hops.map(h => [h.from, h.to, h.type, h.strength, h.source]).sort();
  assert.deepEqual(edges(forward.hops), edges(reverse.hops));
  assert.deepEqual(edges(forward.hops).map(h => h.slice(0, 3)), [
    ["demo:b", "demo:a", "inspired-by"], ["demo:c", "demo:b", "references"]
  ]);
});
test("direct evidence does not double-count a two-hop path", () => {
  const m = model(undefined, [relation("demo:a", "demo:b"), relation("demo:b", "demo:c"), relation("demo:a", "demo:c", .4)]);
  assert.equal(compareEvidenceGames(m, a.id, c.id).relations.twoHop, null);
});
test("duplicate, dangling and self referential connections are rejected", () => {
  assert.throws(() => model(undefined, [relation("demo:a", "demo:z")]), /endpoints/);
  assert.throws(() => model(undefined, [relation("demo:a", "demo:a")]), /endpoints/);
  assert.throws(() => model(undefined, [relation("demo:a", "demo:b"), relation("demo:b", "demo:a")]), /duplicate pair/);
  assert.throws(() => model(undefined, [{ ...relation("demo:a", "demo:b"), source: "" }]), /source/);
});
test("hard filters remain strict for unknown platforms and cooperative support", () => {
  const result = rankEvidenceBasket(model(), { seeds: [{ id: "demo:a", weight: 1 }], platform: "windows", coopOnly: true });
  assert.deepEqual(result.ranked.map(item => item.id), []);
  assert.ok(result.uncertain.some(item => item.id === "demo:b"));
  assert.ok(result.excluded.some(item => item.id === "demo:c"));
});
test("exclusions, Intersection and Blend reuse existing ranker with per-seed evidence", () => {
  const m = model();
  const seeds = [{ id: "demo:a", weight: 2 }, { id: "demo:b", weight: 1 }];
  const scalar = rankEvidenceBasket(m, { seeds, excluded: ["demo:d"] });
  assert.ok(scalar.ranked.every(item => item.evidence.length === 2));
  assert.ok(scalar.excluded.some(item => item.id === "demo:d"));
  const blend = rankEvidenceBasket(m, { seeds, mode: "blend", lambda: 0.3 });
  assert.equal(blend.mode, "blend");
  assert.deepEqual(blend.ranked.map(item => item.id), ["demo:c", "demo:d"]);
});
test("input order and graph edge order do not change scores or ranks", () => {
  const edges = [relation("demo:a", "demo:b", .8), relation("demo:b", "demo:c", .5)];
  const first = model([a, b, c, d], edges);
  const second = model([d, c, b, a], edges.reverse());
  for (const x of ["demo:a", "demo:b", "demo:c", "demo:d"]) {
    for (const y of ["demo:a", "demo:b", "demo:c", "demo:d"]) {
      assert.equal(compareEvidenceGames(first, x, y).affinity, compareEvidenceGames(second, x, y).affinity);
    }
  }
  assert.deepEqual(rankEvidenceBasket(first, { seeds: [{ id: "demo:a" }] }).ranked.map(x => x.id),
    rankEvidenceBasket(second, { seeds: [{ id: "demo:a" }] }).ranked.map(x => x.id));
});

test("partial and missing tags retain independently sourced relation coverage without ranking", () => {
  const partial = { ...b, tagCoverage: "partial" };
  const directModel = model([a, partial, c],
    [relation("demo:b", "demo:a", .8, "inspired-by")]);
  const direct = compareEvidenceGames(directModel, a.id, b.id);
  assert.equal(direct.status, "uncertain");
  assert.equal(direct.reason, "partial-weighted-tags");
  assert.equal(direct.affinity, null);
  assert.equal(direct.tags.similarity, null);
  assert.equal(direct.relations.direct.from, "demo:b");
  assertCoverageLanes(direct.evidenceCoverageByLane, {
    tags: 0, metadata: .13 * .35, direct: .08, twoHop: 0,
  });
  assert.ok(Math.abs(direct.evidenceCoverage - (.13 * .35 + .08)) < 1e-12);
  const ranked = rankEvidenceBasket(directModel, {
    seeds: [{ id: a.id, weight: 1 }], mode: "intersection",
  });
  assert.ok(!ranked.ranked.some(item => item.id === b.id));
  assert.ok(ranked.uncertain.some(item => item.id === b.id));

  const unknown = { ...c, tags: null };
  const twoHopModel = model([a, b, unknown], [
    relation("demo:a", "demo:b", .8),
    relation("demo:b", "demo:c", .5),
  ]);
  const twoHop = compareEvidenceGames(twoHopModel, a.id, c.id);
  assert.equal(twoHop.status, "uncertain");
  assert.equal(twoHop.reason, "missing-weighted-tags");
  assert.equal(twoHop.affinity, null);
  assert.equal(twoHop.relations.twoHop.strength, .2);
  assertCoverageLanes(twoHop.evidenceCoverageByLane, {
    tags: 0, metadata: .13 * .35, direct: 0, twoHop: .03,
  });
  const noEdge = compareEvidenceGames(model([a, b, unknown]), a.id, c.id);
  assert.equal(noEdge.evidenceCoverageByLane.direct, 0);
  assert.equal(noEdge.evidenceCoverageByLane.twoHop, 0);
  assert.equal(noEdge.affinity, null);
});

test("complete-tag pairs retain the existing score and expose independent coverage lanes", () => {
  const unchanged = compareEvidenceGames(model(), a.id, b.id);
  const sourced = compareEvidenceGames(model(undefined,
    [relation("demo:a", "demo:b", .8)]), a.id, b.id);
  assert.equal(unchanged.status, "rankable");
  assert.ok(Math.abs(unchanged.evidenceCoverage -
    (.76 + .13 * .35)) < 1e-12);
  assertCoverageLanes(sourced.evidenceCoverageByLane, {
    tags: .76, metadata: .13 * .35, direct: .08, twoHop: 0,
  });
  assert.ok(Math.abs(sourced.affinity - unchanged.affinity - .08 * .8) < 1e-12);
  assert.ok(Math.abs(sourced.evidenceCoverage -
    Object.values(sourced.evidenceCoverageByLane).reduce((a, b) => a + b, 0)) < 1e-12);
});
