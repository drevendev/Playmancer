import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { evaluateFrozenBridgeRoutes, loadFrozenBridgeRoutes } from '../scripts/evaluate-bridge-real-pilot.mjs';

const catalogFile = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const planFile = new URL('../examples/evaluation-baskets-30.real.json', import.meta.url);
const run = () => loadFrozenBridgeRoutes();

test('Bridge route diagnostic pins the 30-game source and uses live player defaults', () => {
  const result = run();
  assert.equal(result.catalog_snapshot_id, 'multi-store-genre-pilot-30-2026-10-28');
  assert.equal(result.catalog_git_blob_sha1, '0570fd610b14fb336c0de65e6cc3062892abe301');
  assert.equal(result.route_method_version, 'bridge-features-preview-3');
  assert.deepEqual(result.route_policy, {
    endpoint_selection: 'adjacent favorites in frozen basket order',
    max_hops: 3, min_similarity: 0.31, weights_used: false
  });
  assert.equal(result.summary.basket_count, 30);
  assert.equal(result.summary.pair_count, 50);
  assert.deepEqual(result.summary.statuses, {
    route: 5, 'no-route': 44, 'unavailable-endpoint': 1
  });
});

test('ordered endpoints, strict constraints and exclusion policy are retained', () => {
  const report = run();
  const expected = JSON.parse(readFileSync(planFile, 'utf8'));
  for (const [i, basket] of report.baskets.entries()) {
    const original = expected.baskets[i];
    assert.equal(basket.basket_id, original.id);
    assert.deepEqual(basket.constraints, original.constraints);
    assert.deepEqual(basket.excluded_candidate_ids, original.excludedCandidateIds);
    assert.equal(basket.pairs.length, original.seeds.length - 1);
    for (const [j, pair] of basket.pairs.entries()) {
      assert.equal(pair.start_id, original.seeds[j].id);
      assert.equal(pair.end_id, original.seeds[j + 1].id);
      assert.equal(pair.result.start_id, pair.start_id);
      assert.equal(pair.result.end_id, pair.end_id);
      assert.deepEqual(pair.result.constraints, {
        platform: original.constraints.platform ?? 'any',
        coopOnly: original.constraints.coopOnly ?? false
      });
      assert.deepEqual(pair.result.excluded_candidate_ids, [...original.excludedCandidateIds].sort());
      if (pair.result.status === 'route') {
        assert.equal(pair.result.nodes[0], pair.start_id);
        assert.equal(pair.result.nodes.at(-1), pair.end_id);
        assert.ok(pair.result.hops >= 1 && pair.result.hops <= 3);
        assert.equal(pair.result.steps.length, pair.result.hops);
        for (const step of pair.result.steps) {
          assert.ok(step.affinity >= 0.31);
          assert.equal(step.evidence_coverage, 0.3);
          assert.ok(step.groups.some(group => group.shared.length > 0));
        }
        for (const excluded of original.excludedCandidateIds) {
          assert.ok(!pair.result.nodes.includes(excluded));
        }
      }
    }
  }
});

test('missing genres and required co-op abstain instead of fabricating routes', () => {
  const report = run();
  for (const id of ['sparse-devmatch', 'sparse-devmatch-alt']) {
    assert.equal(report.baskets.find(item => item.basket_id === id).pairs[0].result.status, 'no-route');
  }
  const coop = report.baskets.find(item => item.basket_id === 'required-coop-unknown');
  assert.equal(coop.pairs[0].result.status, 'unavailable-endpoint');
  assert.equal(coop.pairs[0].result.reason, 'unknown');
  assert.equal(coop.pairs[0].result.eligibility.pass, 0);
});

test('catalog or plan mutation invalidates the frozen comparison', () => {
  const raw = readFileSync(catalogFile, 'utf8');
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  assert.throws(() => evaluateFrozenBridgeRoutes(raw.replace('Stardew Valley', 'Stardew Valley MODIFIED'), plan),
    /Frozen catalog blob changed/);
  const altered = structuredClone(plan);
  altered.blendLambda = 0.7;
  assert.throws(() => evaluateFrozenBridgeRoutes(raw, altered), /frozen Blend lambda/);
});

test('entire route report is deterministic and JSON serializable', () => {
  const left = run(), right = run();
  assert.deepEqual(left, right);
  assert.deepEqual(JSON.parse(JSON.stringify(left)), left);
});
