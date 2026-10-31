#!/usr/bin/env node
// Offline paired Bridge diagnostic. This is NOT the live player Bridge method.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateFrozenBridgeRoutes } from './evaluate-bridge-real-pilot.mjs';
import { projectFrozenGenres, FROZEN_CATALOG_BLOB, FROZEN_PLAN_BLOB } from '../src/evidence-real-pilot.js';
import { prepareEvidenceModel, compareEvidenceGames, EVIDENCE_METHOD_VERSION } from '../src/evidence-similarity.js';
import { findBridgeRoute } from '../src/bridge.js';

const CATALOG = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const PLAN = new URL('../examples/evaluation-baskets-30.real.json', import.meta.url);
export const BRIDGE_EVIDENCE_PROTOCOL = 'p76-frozen-bridge-genre-proxy-1';
const POLICY = Object.freeze({ maxHops: 3, minSimilarity: 0.31 });
const STATUSES = ['route', 'no-route', 'unavailable-endpoint'];
const counts = () => Object.fromEntries(STATUSES.map(status => [status, 0]));

function eligibility(profile, constraints, excluded) {
  if (excluded.has(profile.id)) return 'excluded';
  let unknown = false;
  if (constraints.platform !== 'any') {
    const platforms = profile.metadata.platforms?.value;
    if (platforms === undefined) unknown = true;
    else if (!platforms.includes(constraints.platform)) return 'fail';
  }
  if (constraints.coopOnly) {
    if (profile.coop === false) return 'fail';
    if (profile.coop === null) unknown = true;
  }
  return unknown ? 'unknown' : 'pass';
}

function bridgeGraph(model, profiles, basket) {
  const constraints = {
    platform: basket.constraints.platform ?? 'any',
    coopOnly: basket.constraints.coopOnly ?? false,
  };
  const excluded = new Set(basket.excludedCandidateIds);
  const status = new Map(profiles.map(profile =>
    [profile.id, eligibility(profile, constraints, excluded)]));
  const eligible = profiles.filter(profile => status.get(profile.id) === 'pass')
    .map(profile => profile.id).sort();
  const edges = [];
  const evidence = { missing_tags: 0, zero_genre_support: 0, below_threshold: 0, connected: 0 };
  for (let i = 0; i < eligible.length; i++) for (let j = i + 1; j < eligible.length; j++) {
    const pair = compareEvidenceGames(model, eligible[i], eligible[j]);
    // A metadata-only connection is not a supported taste route. Unknown tags
    // never become a zero score, nor does a shared platform fabricate a bridge.
    if (pair.tags.similarity === null) evidence.missing_tags++;
    else if (pair.tags.similarity <= 0) evidence.zero_genre_support++;
    else if (pair.affinity < POLICY.minSimilarity) evidence.below_threshold++;
    else {
      evidence.connected++;
      edges.push({ from: eligible[i], to: eligible[j], similarity: pair.affinity });
    }
  }
  return { status, constraints, eligible, evidence, graph: { nodes: eligible, edges } };
}

function explainSteps(route, model) {
  return route.edges.map(edge => {
    const pair = compareEvidenceGames(model, edge.from, edge.to);
    if (pair.status !== 'rankable' || !(pair.tags.similarity > 0))
      throw new Error('Route used unknown or unsupported genre evidence');
    return {
      from: edge.from, to: edge.to, composite_affinity: edge.similarity,
      observed_genre_overlap: pair.tags.similarity,
      evidence_coverage: pair.evidenceCoverage,
      shared_genres: pair.tags.shared,
      secondary_metadata_matches: pair.metadata.matches,
    };
  });
}

export function compareFrozenBridgeEvidence(catalogText, plan) {
  // The existing runner checks frozen raw catalog and *complete* basket plan,
  // license coverage, versions, hard filters, exclusion IDs and endpoint order.
  const baseline = evaluateFrozenBridgeRoutes(catalogText, plan);
  if (baseline.catalog_git_blob_sha1 !== FROZEN_CATALOG_BLOB ||
      baseline.basket_plan_git_blob_sha1 !== FROZEN_PLAN_BLOB ||
      baseline.summary.pair_count !== 50)
    throw new Error('Unexpected frozen Bridge comparison inputs');
  const profiles = projectFrozenGenres(JSON.parse(catalogText));
  const model = prepareEvidenceModel({ games: profiles, relations: [] });
  const totals = counts(), baselineTotals = counts(), byGroup = {};
  const baskets = plan.baskets.map((basket, index) => {
    const legacy = baseline.baskets[index];
    if (legacy.basket_id !== basket.id || legacy.pairs.length !== basket.seeds.length - 1)
      throw new Error('Frozen Bridge endpoint order drift');
    const built = bridgeGraph(model, profiles, basket);
    const groupTotals = byGroup[basket.group] ??= counts();
    const pairs = legacy.pairs.map((old, pairIndex) => {
      const startId = basket.seeds[pairIndex].id, endId = basket.seeds[pairIndex + 1].id;
      if (old.start_id !== startId || old.end_id !== endId)
        throw new Error('Frozen Bridge endpoints changed');
      const bad = [startId, endId].find(id => built.status.get(id) !== 'pass');
      const result = bad
        ? { status: 'unavailable-endpoint', reason: built.status.get(bad),
            affected_id: bad }
        : (() => {
          const route = findBridgeRoute(built.graph, startId, endId,
            { maxHops: POLICY.maxHops });
          return route.status === 'route'
            ? { status: 'route', nodes: route.nodes, hops: route.hops,
                total_cost: route.totalCost, steps: explainSteps(route, model) }
            : { status: 'no-route', reason: route.reason };
        })();
      if (!STATUSES.includes(result.status) || !STATUSES.includes(old.result.status))
        throw new Error('Unexpected Bridge status');
      totals[result.status]++;
      baselineTotals[old.result.status]++;
      groupTotals[result.status]++;
      return {
        start_id: startId, end_id: endId,
        baseline_status: old.result.status,
        v2_status: result.status,
        v2_result: result,
      };
    });
    return {
      basket_id: basket.id, group: basket.group,
      seed_ids: basket.seeds.map(seed => seed.id),
      seed_weights: basket.seeds.map(seed => seed.weight),
      constraints: built.constraints,
      excluded_candidate_ids: [...basket.excludedCandidateIds],
      eligibility: Object.fromEntries(['pass', 'fail', 'unknown', 'excluded']
        .map(key => [key, [...built.status.values()].filter(s => s === key).length])),
      pair_evidence: built.evidence, pairs,
    };
  });
  if (JSON.stringify(baselineTotals) !== JSON.stringify(baseline.summary.statuses))
    throw new Error('Baseline status totals changed');
  return {
    report_schema: BRIDGE_EVIDENCE_PROTOCOL,
    catalog_snapshot_id: baseline.catalog_snapshot_id,
    frozen_catalog_git_blob_sha1: FROZEN_CATALOG_BLOB,
    frozen_basket_plan_git_blob_sha1: FROZEN_PLAN_BLOB,
    legacy_bridge_method: baseline.route_method_version,
    experimental_similarity_method: EVIDENCE_METHOD_VERSION,
    relations: 0,
    policy: {
      endpoint_selection: 'adjacent favorites in original frozen basket order',
      max_hops: POLICY.maxHops, min_similarity: POLICY.minSimilarity,
      weights_used: false, require_positive_genre_overlap_for_each_edge: true,
    },
    warning: 'Offline uniform-genre-weight proxy, not full semantic Bridge, human usefulness or calibrated route quality. The same 0.31 numeric threshold does NOT guarantee comparable scales between methods. No curated relation edges exist in this 30-game snapshot.',
    summary: {
      basket_count: baskets.length, pair_count: Object.values(totals).reduce((a, b) => a + b, 0),
      baseline_statuses: baselineTotals, experimental_statuses: totals, by_group: byGroup,
      route_gains: baskets.flatMap(b => b.pairs.filter(p =>
        p.baseline_status !== 'route' && p.v2_status === 'route')
        .map(p => ({ basket_id: b.basket_id, from: p.start_id, to: p.end_id }))),
      route_losses: baskets.flatMap(b => b.pairs.filter(p =>
        p.baseline_status === 'route' && p.v2_status !== 'route')
        .map(p => ({ basket_id: b.basket_id, from: p.start_id, to: p.end_id }))),
    },
    baskets,
  };
}

export function loadFrozenBridgeEvidence() {
  return compareFrozenBridgeEvidence(readFileSync(CATALOG, 'utf8'),
    JSON.parse(readFileSync(PLAN, 'utf8')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/compare-bridge-real-evidence.mjs > bridge-v2-report.json');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(loadFrozenBridgeEvidence(), null, 2) + '\n');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
