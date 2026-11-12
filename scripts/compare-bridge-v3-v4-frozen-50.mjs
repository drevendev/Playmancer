#!/usr/bin/env node
// Exact-code v3 -> v4 frozen 50-endpoint Bridge comparison.
// The historical implementation is pinned by its Git blob SHA. No imports or
// mutations of third-party catalog data, no inferred player relevance.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrozenBridgeRoutes } from './evaluate-bridge-real-pilot.mjs';
import { buildBridgePreview as buildV3, BRIDGE_ROUTE_METHOD_VERSION as V3 } from '../test/fixtures/bridge-preview-v3.js';
import { BRIDGE_ROUTE_METHOD_VERSION as V4 } from '../src/bridge-preview.js';

const CATALOG = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const ARCHIVED_V3 = new URL('../test/fixtures/bridge-preview-v3.js', import.meta.url);
const HISTORIC_SOURCE_BLOB = '37643c7b4802a0e26dc3826c7b3c5ace1f5bdf63';
const HISTORIC_SOURCE_COMMIT = '0b3375bc6ef92f5f58b81e2cacae566d2739c37b';
export const BRIDGE_V3_V4_PROTOCOL = 'bridge-frozen-v3-v4-50-v1';
const STATUSES = ['route', 'no-route', 'unavailable-endpoint'];
const count = () => Object.fromEntries(STATUSES.map(status => [status, 0]));
const keyFor = (oldStatus, newStatus) => oldStatus + ' -> ' + newStatus;
function gitBlobSha1(content) {
  return createHash('sha1')
    .update('blob ' + Buffer.byteLength(content, 'utf8') + '\0')
    .update(content).digest('hex');
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function verifyV3Source() {
  const copied = readFileSync(ARCHIVED_V3, 'utf8');
  const relocated = "from '../../src/bridge.js'";
  assert(copied.includes(relocated) && copied.split(relocated).length === 2,
    'Archived Bridge v3 import was changed');
  const original = copied.replace(relocated, "from './bridge.js'");
  assert(gitBlobSha1(original) === HISTORIC_SOURCE_BLOB,
    'Archived Bridge v3 source drifted from its historical Git blob');
  assert(V3 === 'bridge-features-preview-3' && V4 === 'bridge-features-preview-4',
    'Bridge version changed: revise the comparison protocol');
}
export function compareFrozenBridgeV3V4() {
  verifyV3Source();
  // The existing evaluator pins the exact CC0/owner-published catalog source,
  // complete basket plan, 30 baskets, 50 ordered endpoints and live Bridge
  // defaults. It executes the actual v4 implementation for all 50 tasks.
  const current = loadFrozenBridgeRoutes();
  assert(current.summary.pair_count === 50 &&
    current.summary.basket_count === 30 &&
    current.route_method_version === V4 &&
    current.route_policy.max_hops === 3 &&
    current.route_policy.min_similarity === 0.31,
    'Frozen v4 comparison population/policy changed');
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
  assert(catalog.snapshotId === current.catalog_snapshot_id &&
    catalog.games.length === 30, 'Catalog source changed');

  const v3Counts = count(), v4Counts = count(), transitions = {};
  const rows = [];
  let reclassified = 0, changedStatuses = 0, changedPaths = 0;
  for (const basket of current.baskets) {
    for (const pair of basket.pairs) {
      const options = {
        catalog: catalog.games, snapshotId: catalog.snapshotId,
        startId: pair.start_id, endId: pair.end_id,
        platform: basket.constraints.platform ?? 'any',
        coopOnly: basket.constraints.coopOnly ?? false,
        excluded: basket.excluded_candidate_ids,
        maxHops: current.route_policy.max_hops,
        minSimilarity: current.route_policy.min_similarity
      };
      const old = buildV3(options), newer = pair.result;
      assert(STATUSES.includes(old.status) && STATUSES.includes(newer.status),
        'Unexpected Bridge result status');
      assert(old.route_method_version === V3 && newer.route_method_version === V4,
        'Method-version mismatch');
      assert(JSON.stringify(old.constraints) === JSON.stringify(newer.constraints) &&
        JSON.stringify(old.excluded_candidate_ids) === JSON.stringify(newer.excluded_candidate_ids),
        'Constraint/exclusion drift');
      // An unconfirmed platform is now UNKNOWN rather than FAIL, and can never
      // become PASS. Confirmed negatives and explicit exclusions stay strict.
      const deltaPass = newer.eligibility.pass - old.eligibility.pass;
      const deltaFail = newer.eligibility.fail - old.eligibility.fail;
      const deltaUnknown = newer.eligibility.unknown - old.eligibility.unknown;
      const deltaExcluded = newer.eligibility.excluded - old.eligibility.excluded;
      assert(deltaPass === 0 && deltaExcluded === 0 && deltaFail <= 0 &&
        deltaUnknown === -deltaFail, 'Hard-eligibility contract drift');
      if (options.platform === 'any')
        assert(deltaUnknown === 0, 'Unconstrained platform task changed classification');
      reclassified += deltaUnknown;
      v3Counts[old.status]++; v4Counts[newer.status]++;
      const transition = keyFor(old.status, newer.status);
      transitions[transition] = (transitions[transition] ?? 0) + 1;
      const changedStatus = old.status !== newer.status;
      if (changedStatus) changedStatuses++;
      const oldPath = old.status === 'route' ? old.nodes : [];
      const newPath = newer.status === 'route' ? newer.nodes : [];
      const changedPath = JSON.stringify(oldPath) !== JSON.stringify(newPath);
      if (changedPath) changedPaths++;
      rows.push({
        basket_id: basket.basket_id, group: basket.group,
        from: pair.start_id, to: pair.end_id,
        constraints: basket.constraints,
        excluded_candidate_ids: basket.excluded_candidate_ids,
        v3_status: old.status, v4_status: newer.status,
        v3_reason: old.reason ?? null, v4_reason: newer.reason ?? null,
        v3_nodes: oldPath, v4_nodes: newPath,
        v3_eligibility: old.eligibility, v4_eligibility: newer.eligibility,
        reclassified_fail_to_unknown: deltaUnknown,
        route_status_changed: changedStatus, path_changed: changedPath,
      });
    }
  }
  assert(rows.length === 50 &&
    Object.values(v3Counts).reduce((a, b) => a + b, 0) === 50 &&
    Object.values(v4Counts).reduce((a, b) => a + b, 0) === 50,
    'Paired-task coverage changed');
  return {
    report_schema: BRIDGE_V3_V4_PROTOCOL,
    catalog_snapshot_id: current.catalog_snapshot_id,
    catalog_git_blob_sha1: current.catalog_git_blob_sha1,
    basket_plan_git_blob_sha1: current.basket_plan_git_blob_sha1,
    historical_source_commit: HISTORIC_SOURCE_COMMIT,
    historical_source_blob_sha1: HISTORIC_SOURCE_BLOB,
    v3_method: V3, v4_method: V4,
    policy: {
      same_catalog_ordered_endpoints_hard_constraints_exclusions: true,
      hop_limit: 3, min_similarity: 0.31,
      basket_weights_used_for_routes: false,
      platform_receipts: 'Positive-only for this exact real catalog',
      performance: 'NOT_MEASURED',
      player_relevance: 'NOT_MEASURED',
    },
    warning: 'Offline deterministic regression comparison; not evidence of recommendation usefulness or a representative user cohort. Reclassified unknown metadata remains ineligible. No platform, tag or relation inference.',
    summary: {
      basket_count: current.summary.basket_count,
      compared_endpoint_pairs: rows.length,
      v3_statuses: v3Counts,
      v4_statuses: v4Counts,
      status_transitions: Object.fromEntries(Object.entries(transitions).sort(([a], [b]) => a.localeCompare(b))),
      changed_status_pairs: changedStatuses,
      changed_path_pairs: changedPaths,
      per_task_fail_to_unknown_reclassifications: reclassified,
      affected_baskets: [...new Set(rows.filter(r => r.reclassified_fail_to_unknown > 0)
        .map(r => r.basket_id))],
    },
    pairs: rows,
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/compare-bridge-v3-v4-frozen-50.mjs');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(compareFrozenBridgeV3V4(), null, 2) + '\n');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
