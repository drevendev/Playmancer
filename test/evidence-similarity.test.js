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
test("missing tags abstain instead of treating missing as a mismatch", () => {
  const m = model([a, { ...b, tags: null }]);
  const pair = compareEvidenceGames(m, a.id, b.id);
  assert.equal(pair.status, "uncertain");
  assert.equal(pair.affinity, null);
  assert.ok(pair.metadata.coverage > 0);
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
test("two hops decay, never claim that a transitive link is a direct source", () => {
  const m = model(undefined, [relation("demo:a", "demo:b", .8), relation("demo:b", "demo:c", .5)]);
  const ac = compareEvidenceGames(m, a.id, c.id);
  assert.equal(ac.relations.direct, null);
  assert.equal(ac.relations.twoHop.via, "demo:b");
  assert.equal(ac.relations.twoHop.strength, .2);
  assert.ok(ac.affinity > 0);
  assert.equal(compareEvidenceGames(m, a.id, d.id).relations.twoHop, null);
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
