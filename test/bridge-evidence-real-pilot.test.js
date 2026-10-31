import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareFrozenBridgeEvidence, loadFrozenBridgeEvidence,
  BRIDGE_EVIDENCE_PROTOCOL } from '../scripts/compare-bridge-real-evidence.mjs';

const source = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const basketsFile = new URL('../examples/evaluation-baskets-30.real.json', import.meta.url);
const run = () => loadFrozenBridgeEvidence();

test('new protocol reuses exact frozen catalog, basket plan and 50 real endpoints', () => {
  const result = run();
  assert.equal(result.report_schema, BRIDGE_EVIDENCE_PROTOCOL);
  assert.equal(result.catalog_snapshot_id, 'multi-store-genre-pilot-30-2026-10-28');
  assert.equal(result.frozen_catalog_git_blob_sha1, '0570fd610b14fb336c0de65e6cc3062892abe301');
  assert.equal(result.frozen_basket_plan_git_blob_sha1, 'e28809801448df2f73c604d0349ce71c042d7f53');
  assert.equal(result.legacy_bridge_method, 'bridge-features-preview-3');
  assert.equal(result.experimental_similarity_method, 'weighted-tags-graph-experiment-1');
  assert.equal(result.relations, 0);
  assert.deepEqual(result.policy, {
    endpoint_selection: 'adjacent favorites in original frozen basket order',
    max_hops: 3, min_similarity: 0.31, weights_used: false,
    require_positive_genre_overlap_for_each_edge: true,
  });
  assert.equal(result.summary.basket_count, 30);
  assert.equal(result.summary.pair_count, 50);
  assert.deepEqual(result.summary.baseline_statuses, {
    route: 5, 'no-route': 44, 'unavailable-endpoint': 1,
  });
  assert.deepEqual(result.summary.experimental_statuses, {
    route: 4, 'no-route': 45, 'unavailable-endpoint': 1,
  });
  assert.deepEqual(result.summary.route_gains, []);
  assert.deepEqual(result.summary.route_losses, [{
    basket_id: 'coherent-platformer',
    from: 'wikidata:q80533334', to: 'dreven:shadow-runner',
  }]);
});

test('every frozen task preserves endpoint order, constraints, exclusions and route receipts', () => {
  const report = run(), plan = JSON.parse(readFileSync(basketsFile, 'utf8'));
  for (const [i, basket] of report.baskets.entries()) {
    const original = plan.baskets[i];
    assert.equal(basket.basket_id, original.id);
    assert.deepEqual(basket.seed_ids, original.seeds.map(seed => seed.id));
    assert.deepEqual(basket.seed_weights, original.seeds.map(seed => seed.weight));
    assert.deepEqual(basket.constraints, {
      platform: original.constraints.platform ?? 'any',
      coopOnly: original.constraints.coopOnly ?? false,
    });
    assert.deepEqual(basket.excluded_candidate_ids, original.excludedCandidateIds);
    assert.equal(basket.pairs.length, original.seeds.length - 1);
    for (const [j, pair] of basket.pairs.entries()) {
      assert.equal(pair.start_id, original.seeds[j].id);
      assert.equal(pair.end_id, original.seeds[j + 1].id);
      if (pair.v2_status === 'route') {
        assert.equal(pair.v2_result.nodes[0], pair.start_id);
        assert.equal(pair.v2_result.nodes.at(-1), pair.end_id);
        assert.ok(pair.v2_result.hops >= 1 && pair.v2_result.hops <= 3);
        assert.equal(pair.v2_result.steps.length, pair.v2_result.hops);
        for (const step of pair.v2_result.steps) {
          assert.ok(step.observed_genre_overlap > 0);
          assert.ok(step.composite_affinity >= .31);
          assert.ok(step.shared_genres.length > 0);
          assert.ok(step.shared_genres.every(tag => tag.sources.length === 2 &&
            tag.sources.every(source => source.includes('(frozen '))));
        }
        assert.ok(pair.v2_result.nodes.every(id => !original.excludedCandidateIds.includes(id)));
      }
    }
    const n = basket.eligibility.pass;
    assert.equal(Object.values(basket.pair_evidence).reduce((a, b) => a + b, 0),
      n < 2 ? 0 : n * (n - 1) / 2);
  }
});

test('unknown genres and unknown required co-op do not invent player routes', () => {
  const report = run();
  for (const id of ['sparse-devmatch', 'sparse-devmatch-alt']) {
    const result = report.baskets.find(b => b.basket_id === id);
    assert.equal(result.pairs[0].v2_status, 'no-route');
    assert.ok(result.pair_evidence.missing_tags > 0);
  }
  const coop = report.baskets.find(b => b.basket_id === 'required-coop-unknown');
  assert.equal(coop.eligibility.pass, 0);
  assert.equal(coop.pairs[0].v2_status, 'unavailable-endpoint');
  assert.equal(coop.pairs[0].v2_result.reason, 'unknown');
});

test('frozen source or valid but edited endpoint plans fail closed', () => {
  const raw = readFileSync(source, 'utf8');
  const plan = JSON.parse(readFileSync(basketsFile, 'utf8'));
  assert.throws(() => compareFrozenBridgeEvidence(
    raw.replace('Stardew Valley', 'Stardew Valley MODIFIED'), plan), /Frozen catalog blob changed/);
  const reordered = structuredClone(plan);
  reordered.baskets[0].seeds.reverse();
  assert.throws(() => compareFrozenBridgeEvidence(raw, reordered), /Frozen basket plan changed/);
  const reweighted = structuredClone(plan);
  reweighted.baskets[0].seeds[0].weight = 10;
  assert.throws(() => compareFrozenBridgeEvidence(raw, reweighted), /Frozen basket plan changed/);
});

test('the complete diagnostic report is repeatable and serializes as JSON', () => {
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
  assert.equal(a.summary.route_gains.length, a.baskets.reduce((sum, basket) =>
    sum + basket.pairs.filter(pair => pair.v2_status === 'route' && pair.baseline_status !== 'route').length, 0));
  assert.equal(a.summary.route_losses.length, a.baskets.reduce((sum, basket) =>
    sum + basket.pairs.filter(pair => pair.v2_status !== 'route' && pair.baseline_status === 'route').length, 0));
});
