#!/usr/bin/env node
// A separate Bridge endpoint/hop diagnostic on the frozen 30-game source.
// Routes are metadata connections, never player preference or an accuracy score.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFrozenPilot } from './evaluate-real-pilot.mjs';
import { buildBridgePreview, BRIDGE_ROUTE_METHOD_VERSION } from '../src/bridge-preview.js';

const CATALOG = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const BASKETS = new URL('../examples/evaluation-baskets-30.real.json', import.meta.url);
const PROTOCOL = 'bridge-real-genre-proxy-v1';
const POLICY = Object.freeze({ maxHops: 3, minSimilarity: 0.31 });
const STATUSES = ['route', 'no-route', 'unavailable-endpoint'];
const emptyCounts = () => Object.fromEntries(STATUSES.map(status => [status, 0]));

export function evaluateFrozenBridgeRoutes(catalogText, plan) {
  // Reuse the frozen comparison's full schema, license, source SHA and basket
  // checks. A changed source/plan cannot silently inherit the old evidence.
  const baseline = evaluateFrozenPilot(catalogText, plan);
  if (BRIDGE_ROUTE_METHOD_VERSION !== 'bridge-features-preview-3') {
    throw new Error('Bridge method changed: declare and verify a new protocol');
  }
  const catalog = JSON.parse(catalogText);
  if (baseline.catalog_game_count !== 30 || catalog.snapshotId !== baseline.catalog_snapshot_id) {
    throw new Error('Frozen 30-game catalog identity changed');
  }
  const totals = emptyCounts();
  const byGroup = {};
  const baskets = plan.baskets.map(basket => {
    const groupCounts = byGroup[basket.group] ??= emptyCounts();
    // Evaluate adjacent favorites in their declared order, not arbitrary
    // all-pairs combinations or a synthetic aggregate favorite.
    const pairs = basket.seeds.slice(1).map((seed, index) => {
      const startId = basket.seeds[index].id;
      const route = buildBridgePreview({
        catalog: catalog.games,
        snapshotId: catalog.snapshotId,
        startId, endId: seed.id,
        platform: basket.constraints.platform ?? 'any',
        coopOnly: basket.constraints.coopOnly ?? false,
        excluded: basket.excludedCandidateIds,
        ...POLICY
      });
      if (!STATUSES.includes(route.status)) throw new Error('Unexpected Bridge route status');
      totals[route.status]++;
      groupCounts[route.status]++;
      return {
        start_id: startId,
        end_id: seed.id,
        result: route
      };
    });
    return {
      basket_id: basket.id,
      group: basket.group,
      seed_ids: basket.seeds.map(seed => seed.id),
      seed_weights: basket.seeds.map(seed => seed.weight),
      constraints: basket.constraints,
      excluded_candidate_ids: basket.excludedCandidateIds,
      pairs
    };
  });
  return {
    protocol_version: PROTOCOL,
    source_protocol_version: baseline.protocol_version,
    catalog_snapshot_id: baseline.catalog_snapshot_id,
    catalog_git_blob_sha1: baseline.catalog_git_blob_sha1,
    route_method_version: BRIDGE_ROUTE_METHOD_VERSION,
    route_policy: {
      endpoint_selection: 'adjacent favorites in frozen basket order',
      max_hops: POLICY.maxHops,
      min_similarity: POLICY.minSimilarity,
      weights_used: false
    },
    proxy_only: 'Genre-only routes have at most 30% comparable feature evidence. Connection is not recommendation quality or player preference.',
    summary: { basket_count: baskets.length, pair_count: Object.values(totals).reduce((a, b) => a + b, 0), statuses: totals, statuses_by_group: byGroup },
    baskets
  };
}

export function loadFrozenBridgeRoutes() {
  return evaluateFrozenBridgeRoutes(readFileSync(CATALOG, 'utf8'),
    JSON.parse(readFileSync(BASKETS, 'utf8')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/evaluate-bridge-real-pilot.mjs > bridge-report.json');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(loadFrozenBridgeRoutes(), null, 2) + '\n');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
