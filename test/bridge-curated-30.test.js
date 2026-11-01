import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareFrozenCuratedBridge, loadFrozenCuratedBridge,
  FROZEN_CURATED_BRIDGE_PROTOCOL } from '../scripts/compare-bridge-curated-30.mjs';

const source = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const planFile = new URL('../examples/evaluation-baskets-30.real.json', import.meta.url);
const run = () => loadFrozenCuratedBridge();
const total = statuses => Object.values(statuses).reduce((sum, count) => sum + count, 0);

test('pins the licensed 30-game input and all 50 exact frozen endpoint tasks', () => {
  const result = run();
  assert.equal(result.report_schema, FROZEN_CURATED_BRIDGE_PROTOCOL);
  assert.equal(result.catalog_games, 30);
  assert.equal(result.curated_relation_receipts, 0);
  assert.equal(result.frozen_catalog_git_blob_sha1,
    '0570fd610b14fb336c0de65e6cc3062892abe301');
  assert.equal(result.frozen_basket_plan_git_blob_sha1,
    'e28809801448df2f73c604d0349ce71c042d7f53');
  assert.equal(result.summary.basket_count, 30);
  assert.equal(result.summary.pair_count, 50);
  assert.equal(result.pairs.length, 50);
  assert.deepEqual(result.policy, {
    pair_selection: 'adjacent explicit favorites in unchanged frozen basket order',
    matched_max_hops: 2,
    legacy_min_similarity: 0.31,
    curated_min_similarity: null,
    same_catalog_endpoints_constraints_exclusions: true,
    no_curated_links_in_snapshot: true,
    performance_latency: 'NOT_MEASURED',
  });
  assert.equal(result.experimental_curated_method, 'curated-bridge-routes-1');
  assert.equal(result.matched_legacy_method, 'bridge-features-preview-3');
  assert.deepEqual(result.summary.published_legacy_three_hop_statuses, {
    route: 5, 'no-route': 44, 'unavailable-endpoint': 1,
  });
  assert.deepEqual(result.summary.experimental_genre_three_hop_statuses, {
    route: 4, 'no-route': 45, 'unavailable-endpoint': 1,
  });
  assert.equal(total(result.summary.matched_legacy_two_hop_statuses), 50);
  assert.equal(total(result.summary.curated_two_hop_statuses), 50);
});

test('no curated edges means abstention from invented routes, not a zero taste score', () => {
  const result = run();
  assert.deepEqual(result.summary.curated_two_hop_statuses, {
    route: 0, 'no-route': 49, uncertain: 1, excluded: 0,
  });
  assert.deepEqual(result.summary.gained_supported_routes_vs_matched_legacy, []);
  assert.equal(result.summary.lost_supported_routes_vs_matched_legacy.length,
    result.summary.matched_legacy_two_hop_statuses.route);
  assert.ok(result.warning.includes('not evidence of lower player relevance'));
  assert.ok(result.pairs.every(row =>
    row.curated_two_hop_status !== 'route' &&
    row.curated_nodes.length === 0 && row.curated_hops.length === 0));
});

test('same endpoints, declared exclusions and hard filters, with a strict unknown endpoint', () => {
  const result = run();
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  const expected = plan.baskets.flatMap(basket =>
    basket.seeds.slice(1).map((seed, index) => ({
      basket_id: basket.id,
      group: basket.group,
      from: basket.seeds[index].id,
      to: seed.id,
      constraints: {
        platform: basket.constraints.platform ?? 'any',
        coopOnly: basket.constraints.coopOnly ?? false,
      },
      excluded_candidate_ids: basket.excludedCandidateIds,
    })));
  assert.deepEqual(result.pairs.map(row => ({
    basket_id: row.basket_id, group: row.group, from: row.from, to: row.to,
    constraints: row.constraints, excluded_candidate_ids: row.excluded_candidate_ids,
  })), expected);
  for (const row of result.pairs) {
    const legacyUnavailable = row.matched_legacy_two_hop_status === 'unavailable-endpoint';
    const curatedUnavailable = ['uncertain', 'excluded'].includes(row.curated_two_hop_status);
    assert.equal(legacyUnavailable, curatedUnavailable);
    if (row.matched_legacy_two_hop_status === 'route') {
      assert.equal(row.matched_legacy_two_hop_nodes[0], row.from);
      assert.equal(row.matched_legacy_two_hop_nodes.at(-1), row.to);
      assert.ok(row.matched_legacy_two_hop_nodes.length <= 3);
      assert.ok(row.matched_legacy_two_hop_nodes.every(
        id => !row.excluded_candidate_ids.includes(id)));
    }
  }
  const unknown = result.pairs.find(row => row.basket_id === 'required-coop-unknown');
  assert.equal(unknown.curated_two_hop_status, 'uncertain');
  assert.equal(unknown.curated_reason, 'endpoint-required-metadata-unknown');
});

test('mutated catalog, reordered endpoints and revised basket weights fail closed', () => {
  const raw = readFileSync(source, 'utf8');
  const plan = JSON.parse(readFileSync(planFile, 'utf8'));
  assert.throws(() => compareFrozenCuratedBridge(
    raw.replace('Stardew Valley', 'Stardew Valley CHANGED'), plan),
    /Frozen catalog blob changed/);
  const reordered = structuredClone(plan);
  reordered.baskets[0].seeds.reverse();
  assert.throws(() => compareFrozenCuratedBridge(raw, reordered), /Frozen basket plan changed/);
  const reweighted = structuredClone(plan);
  reweighted.baskets[0].seeds[0].weight = 99;
  assert.throws(() => compareFrozenCuratedBridge(raw, reweighted), /Frozen basket plan changed/);
});

test('report remains byte-for-byte deterministic and JSON serializable', () => {
  const first = run(), second = run();
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});
