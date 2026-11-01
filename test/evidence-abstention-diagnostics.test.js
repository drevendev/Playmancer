import test from "node:test";
import assert from "node:assert/strict";
import { prepareEvidenceModel, rankEvidenceBasket } from "../src/evidence-similarity.js";

// Deliberately authored fixtures: positive observations never imply that
// unmentioned game characteristics are absent.
const source = "fixture:reviewed-observation";
const tag = id => ({ id, weight: 1, source });
function game(id, tags, tagCoverage) {
  return {
    id, tags,
    ...(tagCoverage ? { tagCoverage } : {}),
    metadata: { platforms: { value: ["windows"], source } },
    coop: null,
  };
}
const model = prepareEvidenceModel({
  games: [
    game("demo:favorite", [tag("mechanic:exploration")], "partial"),
    game("demo:other", [tag("genre:strategy")], "complete"),
    game("demo:candidate", [tag("mechanic:exploration")], "partial"),
    game("demo:unknown", null),
  ],
  relations: [{
    from: "demo:candidate", to: "demo:favorite", type: "inspired-by",
    strength: 0.8, source: "fixture:curated-relation",
  }],
});
const seeds = [{ id: "demo:favorite", weight: 2 }, { id: "demo:other", weight: 1 }];

test("abstentions retain source-backed positive observations without inventing scores", () => {
  for (const mode of ["intersection", "blend"]) {
    const result = rankEvidenceBasket(model, { seeds, mode, limit: 5 });
    assert.equal(result.ranked.length, 0, "partial profiles cannot become recommendations");

    const candidate = result.uncertain.find(item => item.id === "demo:candidate");
    assert.ok(candidate);
    assert.equal(candidate.reason, "missing-seed-affinity");
    assert.equal(candidate.scores, null);
    assert.deepEqual(candidate.evidence.map(pair => pair.seedId),
      ["demo:favorite", "demo:other"]);
    const positive = candidate.evidence[0];
    assert.equal(positive.status, "uncertain");
    assert.equal(positive.reason, "partial-weighted-tags");
    assert.equal(positive.affinity, null);
    assert.equal(positive.tags.similarity, null);
    assert.equal(positive.tags.observedOverlap, 1);
    assert.equal(positive.tags.shared[0].sources[0], source);
    assert.equal(positive.tags.leftOnly, null);
    assert.equal(positive.tags.rightOnly, null);
    assert.equal(positive.evidenceCoverageByLane.tags, 0);
    assert.equal(positive.relations.direct.source, "fixture:curated-relation");
    assert.equal(positive.relations.direct.from, "demo:candidate");
    assert.equal(positive.relations.direct.to, "demo:favorite");
    assert.equal(candidate.evidence[1].tags.observedOverlap, 0);
    assert.equal(candidate.evidence[1].tags.similarity, null);

    const missing = result.uncertain.find(item => item.id === "demo:unknown");
    assert.ok(missing);
    assert.equal(missing.evidence.length, 2);
    assert.ok(missing.evidence.every(pair =>
      pair.reason === "missing-weighted-tags" && pair.tags.coverage === "unknown" &&
      pair.affinity === null && pair.tags.observedOverlap === null));
    assert.ok(result.excluded.some(item => item.id === "demo:favorite"));
    assert.ok(result.excluded.some(item => item.id === "demo:other"));

    // An inactive favorite must not create a misleading evidence explanation.
    const inactive = rankEvidenceBasket(model, {
      seeds: [...seeds, { id: "demo:unknown", weight: 0 }], mode, limit: 5,
    });
    assert.deepEqual(inactive, result);
  }
});

test("hard-constraint abstentions preserve their reason and separate pair evidence", () => {
  const result = rankEvidenceBasket(model, { seeds, coopOnly: true });
  const candidate = result.uncertain.find(item => item.id === "demo:candidate");
  assert.ok(candidate);
  assert.equal(candidate.reason, "hard-constraint-unknown");
  assert.equal(candidate.scores, null);
  assert.deepEqual(candidate.evidence.map(pair => pair.seedId),
    ["demo:favorite", "demo:other"]);
  assert.equal(candidate.evidence[0].tags.coverage, "partial");
  assert.equal(candidate.evidence[0].affinity, null);
  assert.equal(result.ranked.length, 0);
});
