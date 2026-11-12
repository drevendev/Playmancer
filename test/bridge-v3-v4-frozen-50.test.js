import assert from 'node:assert/strict';
import test from 'node:test';
import { compareFrozenBridgeV3V4, BRIDGE_V3_V4_PROTOCOL } from '../scripts/compare-bridge-v3-v4-frozen-50.mjs';
import { buildBridgePreview as buildV3 } from './fixtures/bridge-preview-v3.js';
import { buildBridgePreview as buildV4 } from '../src/bridge-preview.js';

test('frozen v3 and v4 compare the same 50 real-catalog route tasks, no silent relaxation', () => {
  const report = compareFrozenBridgeV3V4();
  assert.equal(report.report_schema, BRIDGE_V3_V4_PROTOCOL);
  assert.equal(report.catalog_git_blob_sha1, '0570fd610b14fb336c0de65e6cc3062892abe301');
  assert.equal(report.basket_plan_git_blob_sha1, 'e28809801448df2f73c604d0349ce71c042d7f53');
  assert.equal(report.summary.basket_count, 30);
  assert.equal(report.summary.compared_endpoint_pairs, 50);
  assert.deepEqual(report.summary.v3_statuses,
    { route: 5, 'no-route': 44, 'unavailable-endpoint': 1 });
  assert.deepEqual(report.summary.v4_statuses,
    { route: 5, 'no-route': 44, 'unavailable-endpoint': 1 });
  assert.equal(report.summary.changed_status_pairs, 0);
  assert.equal(report.summary.changed_path_pairs, 0);
  assert.ok(report.summary.per_task_fail_to_unknown_reclassifications > 0,
    'This comparison must exercise positive-only platform evidence');
  assert.ok(report.summary.affected_baskets.length > 0);
  for (const row of report.pairs) {
    assert.deepEqual(row.v3_nodes, row.v4_nodes);
    assert.equal(row.v3_eligibility.pass, row.v4_eligibility.pass);
    assert.equal(row.v3_eligibility.excluded, row.v4_eligibility.excluded);
    assert.ok(row.v3_eligibility.fail >= row.v4_eligibility.fail);
    assert.equal(row.v4_eligibility.unknown - row.v3_eligibility.unknown,
      row.reclassified_fail_to_unknown);
  }
});

test('same source gives byte-identical, deterministic aggregate and paired report', () => {
  const left = compareFrozenBridgeV3V4();
  const right = compareFrozenBridgeV3V4();
  assert.deepEqual(left, right);
  assert.equal(JSON.stringify(left), JSON.stringify(right));
  assert.equal(new Set(left.pairs.map(row => row.basket_id + '/' + row.from + '/' + row.to)).size,
    left.pairs.length);
});

test('v4 abstains instead of inventing a real-game platform incompatibility', () => {
  const catalog = [
    { id: 'fixture:from', mechanics: null, themes: ['platformer'],
      platforms: ['windows'], coop: null },
    { id: 'fixture:to', mechanics: null, themes: ['platformer'],
      platforms: ['browser'], coop: null },
  ];
  const options = { catalog, snapshotId: 'multi-store-genre-pilot-test',
    startId: 'fixture:from', endId: 'fixture:to',
    platform: 'windows', coopOnly: false, maxHops: 3, minSimilarity: 0.31 };
  const old = buildV3(options), now = buildV4(options);
  assert.equal(old.status, 'unavailable-endpoint');
  assert.equal(old.reason, 'fail');
  assert.equal(now.status, 'unavailable-endpoint');
  assert.equal(now.reason, 'unknown');
  assert.equal(now.eligibility.pass, old.eligibility.pass);
  assert.equal(now.eligibility.unknown, old.eligibility.unknown + 1);
  assert.equal(now.eligibility.fail, old.eligibility.fail - 1);

  // Fictional catalog authoring can declare exhaustive platform lists. The
  // v4 real-pilot policy must not leak to such snapshots.
  const exhaustive = buildV4({ ...options, snapshotId: 'fictional-complete-test' });
  assert.equal(exhaustive.reason, 'fail');
});
