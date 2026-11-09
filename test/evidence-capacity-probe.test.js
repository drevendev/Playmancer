import test from "node:test";
import assert from "node:assert/strict";
import { makeEvidenceCapacityFixture, benchmarkEvidenceCapacity, evidenceCapacitySignature } from "../src/evidence-capacity-probe.js";
import { prepareEvidenceModel, rankEvidenceBasket } from "../src/evidence-similarity.js";

test("fictional workload fits the exact v2 capacity ceiling without duplicates", () => {
  const fixture = makeEvidenceCapacityFixture();
  assert.equal(fixture.games.length, 250);
  assert.equal(fixture.relations.length, 4096);
  assert.ok(fixture.games.every(game => game.tags.length === 128 &&
    Math.abs(game.tags.reduce((n, tag) => n + tag.weight, 0) - 1) < 1e-9));
  assert.equal(new Set(fixture.games.map(game => game.id)).size, 250);
  const pairs = fixture.relations.map(edge => [edge.from, edge.to].sort().join("/"));
  assert.equal(new Set(pairs).size, 4096);
  assert.ok(fixture.relations.some(edge => edge.type === "references"));
  assert.ok(fixture.relations.some(edge => edge.type === "similar"));
  assert.ok(prepareEvidenceModel(fixture).profiles.size === 250);
});

test("the exact 250/128/4096 scorer executes under strict filters", () => {
  // Smoke the true ceiling (not just validation/preparation). No timing
  // assertion: CI hosts vary, and this is not browser p95 certification.
  const report = benchmarkEvidenceCapacity({ warmups: 0, samples: 1 });
  assert.equal(report.game_count, 250);
  assert.equal(report.tags_per_game, 128);
  assert.equal(report.relation_count, 4096);
  for (const mode of ["intersection", "blend"]) {
    const result = report.modes[mode];
    assert.ok(result.rankable_returned <= 5);
    assert.ok(result.unknown_count > 0);
    assert.ok(result.excluded_count > 0);
    assert.ok(!result.ranked_ids.some(id => report.filters.excluded.includes(id)));
  }
});

test("capacity probe verifies deterministic eligibility and both distinct modes", () => {
  const options = { gameCount: 12, tagsPerGame: 7, edgeCount: 32, warmups: 1, samples: 2 };
  const first = benchmarkEvidenceCapacity(options);
  const second = benchmarkEvidenceCapacity(options);
  assert.equal(first.method, "weighted-tags-graph-experiment-9");
  assert.equal(first.protocol, "p76-fictional-v2-capacity-node-2");
  assert.equal(first.basket_seed_count, 5);
  assert.equal(first.filters.platform, "windows");
  assert.equal(first.filters.coopOnly, true);
  assert.deepEqual(first.modes.intersection.ranked_ids, second.modes.intersection.ranked_ids);
  assert.deepEqual(first.modes.blend.ranked_ids, second.modes.blend.ranked_ids);
  for (const mode of ["intersection", "blend"]) {
    const row = first.modes[mode];
    assert.ok(row.p95_node_ms >= 0 && row.p95_node_ms <= row.max_node_ms);
    assert.ok(row.p50_node_ms <= row.p95_node_ms);
    assert.equal(new Set(row.ranked_ids).size, row.ranked_ids.length);
    assert.ok(row.ranked_ids.length <= first.top_k);
    assert.ok(row.unknown_count + row.excluded_count + row.rankable_returned <= 12);
    assert.ok(!row.ranked_ids.includes(first.filters.excluded[0]));
  }
  assert.match(first.scope, /NOT browser p95/);
});

test("capacity fixture rejects impossible workloads rather than shrinking them silently", () => {
  assert.throws(() => makeEvidenceCapacityFixture({ gameCount: 251 }), /gameCount/);
  assert.throws(() => makeEvidenceCapacityFixture({ partialTagEvery: -1 }), /partialTagEvery/);
  assert.throws(() => makeEvidenceCapacityFixture({ partialTagEvery: 251 }), /partialTagEvery/);
  assert.throws(() => makeEvidenceCapacityFixture({ tagsPerGame: 129 }), /tagsPerGame/);
  assert.throws(() => makeEvidenceCapacityFixture({ gameCount: 5, edgeCount: 11 }), /edgeCount/);
  assert.throws(() => benchmarkEvidenceCapacity({ samples: 0 }), /samples/);
  assert.throws(() => benchmarkEvidenceCapacity({ warmups: -1 }), /warmups/);
  const small = makeEvidenceCapacityFixture({ gameCount: 5, tagsPerGame: 3, edgeCount: 10 });
  assert.equal(small.relations.length, 10);
  const model = prepareEvidenceModel(small);
  const result = rankEvidenceBasket(model, { seeds: [{ id: small.games[0].id }], platform: "windows" });
  assert.ok(result.ranked.length + result.uncertain.length + result.excluded.length === 5);
});

test("full capacity result serialization catches score and evidence drift with unchanged IDs", () => {
  const fixture = makeEvidenceCapacityFixture({ gameCount: 12, tagsPerGame: 7, edgeCount: 32 });
  const model = prepareEvidenceModel(fixture);
  const result = rankEvidenceBasket(model, { seeds: [{ id: fixture.games[0].id, weight: 1 }], limit: 5 });
  assert.ok(result.ranked.length > 0);
  assert.ok(result.ranked[0].evidence.length > 0);
  const expected = evidenceCapacitySignature(result);
  assert.equal(evidenceCapacitySignature(structuredClone(result)), expected);

  const changedAffinity = structuredClone(result);
  changedAffinity.ranked[0].evidence[0].affinity += 0.001;
  assert.notEqual(evidenceCapacitySignature(changedAffinity), expected);

  const changedCoverage = structuredClone(result);
  changedCoverage.ranked[0].evidence[0].evidenceCoverage += 0.001;
  assert.notEqual(evidenceCapacitySignature(changedCoverage), expected);

  const changedReceipt = structuredClone(result);
  changedReceipt.ranked[0].hardConstraintEvidence.platform.source = "fictional:edited-source";
  assert.notEqual(evidenceCapacitySignature(changedReceipt), expected);
});


test("mixed sparse facts at 250-game capacity preserve abstentions and strict filters", () => {
  // Keep the fixed five seeds complete while 41 non-seed profiles have only
  // selected observations. This tests a mixed evidence partition, not relevance.
  const report = benchmarkEvidenceCapacity({ partialTagEvery: 6, warmups: 0, samples: 1 });
  assert.equal(report.partial_tag_every, 6);
  assert.equal(report.partial_profiles, 41);
  for (const mode of ["intersection", "blend"]) {
    const row = report.modes[mode];
    assert.ok(row.rankable_returned > 0, mode);
    assert.ok(row.uncertain_evidence_count > 0, mode);
    assert.ok(row.uncertain_hard_constraint_count > 0, mode);
    assert.equal(row.unknown_count,
      row.uncertain_evidence_count + row.uncertain_hard_constraint_count);
    assert.ok(!row.ranked_ids.some(id => report.filters.excluded.includes(id)));
  }
});

test("all selected-fact vectors abstain rather than inventing a complete affinity", () => {
  const report = benchmarkEvidenceCapacity({
    gameCount: 12, tagsPerGame: 7, edgeCount: 32,
    partialTagEvery: 1, warmups: 0, samples: 1,
  });
  assert.equal(report.partial_profiles, 12);
  for (const mode of ["intersection", "blend"]) {
    const row = report.modes[mode];
    assert.deepEqual(row.ranked_ids, []);
    assert.equal(row.rankable_returned, 0);
    assert.ok(row.uncertain_evidence_count > 0);
    assert.equal(row.unknown_count,
      row.uncertain_evidence_count + row.uncertain_hard_constraint_count);
  }
});
