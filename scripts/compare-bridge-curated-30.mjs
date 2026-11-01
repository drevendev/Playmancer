#!/usr/bin/env node
// Frozen, rights-limited side-by-side diagnostic for experimental curated Bridge.
// This does not change the player, import relationships or establish quality.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareFrozenBridgeEvidence } from './compare-bridge-real-evidence.mjs';
import { projectFrozenGenres } from '../src/evidence-real-pilot.js';
import { prepareEvidenceModel } from '../src/evidence-similarity.js';
import { findCuratedBridge, CURATED_BRIDGE_VERSION } from '../src/evidence-bridge.js';
import { buildBridgePreview, BRIDGE_ROUTE_METHOD_VERSION } from '../src/bridge-preview.js';

const CATALOG = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const PLAN = new URL('../examples/evaluation-baskets-30.real.json', import.meta.url);
export const FROZEN_CURATED_BRIDGE_PROTOCOL = 'p76-frozen-curated-bridge-30-v1';
const LEGACY_POLICY = Object.freeze({ maxHops: 2, minSimilarity: 0.31 });
const LEGACY_STATUSES = ['route', 'no-route', 'unavailable-endpoint'];
const CURATED_STATUSES = ['route', 'no-route', 'uncertain', 'excluded'];
const counts = statuses => Object.fromEntries(statuses.map(status => [status, 0]));

export function compareFrozenCuratedBridge(catalogText, plan) {
  // This runner validates the exact catalog Git blob, the COMPLETE ordered
  // frozen basket plan, source rights, exclusions and existing results.
  const previous = compareFrozenBridgeEvidence(catalogText, plan);
  if (previous.summary.pair_count !== 50 ||
      previous.summary.basket_count !== 30 ||
      previous.relations !== 0) {
    throw new Error('Frozen 30-game Bridge comparison protocol changed');
  }

  const catalog = JSON.parse(catalogText);
  const profiles = projectFrozenGenres(catalog);
  // No sourced curated relations are present in this catalog. Deliberately
  // passing [] is NOT an assertion that such relationships do not exist.
  const model = prepareEvidenceModel({ games: profiles, relations: [] });
  if (model.profiles.size !== 30 ||
      [...model.edges.values()].some(neighbors => neighbors.size !== 0)) {
    throw new Error('Unexpected curated relation inputs');
  }

  const legacyTwo = counts(LEGACY_STATUSES);
  const curatedTwo = counts(CURATED_STATUSES);
  const pairs = [];
  for (const basket of previous.baskets) {
    for (const pair of basket.pairs) {
      const options = {
        from: pair.start_id, to: pair.end_id,
        platform: basket.constraints.platform,
        coopOnly: basket.constraints.coopOnly,
        excluded: basket.excluded_candidate_ids,
      };
      const legacy = buildBridgePreview({
        catalog: catalog.games,
        snapshotId: catalog.snapshotId,
        startId: options.from, endId: options.to,
        platform: options.platform, coopOnly: options.coopOnly,
        excluded: options.excluded, ...LEGACY_POLICY,
      });
      const curated = findCuratedBridge(model, options);
      if (!LEGACY_STATUSES.includes(legacy.status) ||
          !CURATED_STATUSES.includes(curated.status)) {
        throw new Error('Unexpected matched Bridge route status');
      }
      // A required filter or excluded endpoint must not become available
      // just because the graph implementation changed.
      const legacyUnavailable = legacy.status === 'unavailable-endpoint';
      const curatedUnavailable = curated.status === 'uncertain' || curated.status === 'excluded';
      if (legacyUnavailable !== curatedUnavailable) {
        throw new Error('Hard-filter endpoint availability drift: ' + basket.basket_id);
      }
      if (curated.status === 'route' && curated.hops.some(hop => !hop.source)) {
        throw new Error('A curated route lacks a source receipt');
      }
      legacyTwo[legacy.status]++;
      curatedTwo[curated.status]++;
      pairs.push({
        basket_id: basket.basket_id, group: basket.group,
        from: options.from, to: options.to,
        constraints: { platform: options.platform, coopOnly: options.coopOnly },
        excluded_candidate_ids: [...options.excluded],
        published_legacy_three_hop_status: pair.baseline_status,
        experimental_genre_three_hop_status: pair.v2_status,
        matched_legacy_two_hop_status: legacy.status,
        matched_legacy_two_hop_nodes: legacy.status === 'route' ? legacy.nodes : [],
        curated_two_hop_status: curated.status,
        curated_reason: curated.reason,
        curated_nodes: curated.nodes,
        curated_hops: curated.hops,
      });
    }
  }

  if (pairs.length !== 50 ||
      Object.values(legacyTwo).reduce((a, b) => a + b, 0) !== 50 ||
      Object.values(curatedTwo).reduce((a, b) => a + b, 0) !== 50) {
    throw new Error('Frozen endpoint count drift');
  }
  return {
    report_schema: FROZEN_CURATED_BRIDGE_PROTOCOL,
    catalog_snapshot_id: previous.catalog_snapshot_id,
    frozen_catalog_git_blob_sha1: previous.frozen_catalog_git_blob_sha1,
    frozen_basket_plan_git_blob_sha1: previous.frozen_basket_plan_git_blob_sha1,
    catalog_games: model.profiles.size,
    curated_relation_receipts: 0,
    published_legacy_method: previous.legacy_bridge_method,
    experimental_genre_method: previous.experimental_similarity_method,
    experimental_curated_method: CURATED_BRIDGE_VERSION,
    matched_legacy_method: BRIDGE_ROUTE_METHOD_VERSION,
    policy: {
      pair_selection: 'adjacent explicit favorites in unchanged frozen basket order',
      matched_max_hops: 2,
      legacy_min_similarity: LEGACY_POLICY.minSimilarity,
      curated_min_similarity: null,
      same_catalog_endpoints_constraints_exclusions: true,
      // The curated graph has no licensed edges to evaluate. Equal hop bounds
      // do not make edge evidence, scoring or human relevance comparable.
      no_curated_links_in_snapshot: true,
      performance_latency: 'NOT_MEASURED',
    },
    warning: 'Offline negative readiness gate, not an A/B quality trial. Curated relations are not recorded in the 30-game snapshot: zero curated routes are inevitable, not evidence of lower player relevance. Genre/feature links and curated provenance use different eligibility. No player or share-state changes.',
    summary: {
      basket_count: previous.summary.basket_count,
      pair_count: pairs.length,
      published_legacy_three_hop_statuses: previous.summary.baseline_statuses,
      experimental_genre_three_hop_statuses: previous.summary.experimental_statuses,
      matched_legacy_two_hop_statuses: legacyTwo,
      curated_two_hop_statuses: curatedTwo,
      lost_supported_routes_vs_matched_legacy: pairs.filter(p =>
        p.matched_legacy_two_hop_status === 'route' && p.curated_two_hop_status !== 'route')
        .map(p => ({ basket_id: p.basket_id, from: p.from, to: p.to })),
      gained_supported_routes_vs_matched_legacy: pairs.filter(p =>
        p.matched_legacy_two_hop_status !== 'route' && p.curated_two_hop_status === 'route')
        .map(p => ({ basket_id: p.basket_id, from: p.from, to: p.to })),
    },
    pairs,
  };
}

export function loadFrozenCuratedBridge() {
  return compareFrozenCuratedBridge(readFileSync(CATALOG, 'utf8'),
    JSON.parse(readFileSync(PLAN, 'utf8')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/compare-bridge-curated-30.mjs > bridge-curated-report.json');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(loadFrozenCuratedBridge(), null, 2) + '\n');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
