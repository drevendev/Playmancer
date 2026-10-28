#!/usr/bin/env node
// Offline, genre-only diagnostics for the immutable 30-game CC0/owner pilot.
// The report is a proxy comparison, never player preference or recommendation accuracy.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalogSnapshot } from '../src/catalog.js';
import { rankCandidates } from '../src/ranking.js';
import { runBenchmark } from '../src/benchmark.js';

const MODES = ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend'];
const GROUPS = new Set(['coherent', 'conflicting', 'weighted', 'sparse', 'constrained']);
const PLATFORMS = new Set(['any', 'windows', 'mac', 'linux', 'browser', 'android']);
const CATALOG_FILE = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const PLAN_FILE = new URL('../examples/evaluation-baskets-30.real.json', import.meta.url);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function gitBlobSha1(text) {
  return createHash('sha1').update('blob ' + Buffer.byteLength(text, 'utf8') + '\0').update(text).digest('hex');
}

// With mechanics absent from this frozen pilot, the player's supported
// feature-overlap-2 calculation is exactly Jaccard over observed genre tags.
// Null is missing evidence; zero is a genuine observed non-overlap.
function genrePair(a, b) {
  if (a.themes === null || b.themes === null) return { affinity: null, coverage: 0 };
  const left = new Set(a.themes);
  const right = new Set(b.themes);
  const union = new Set([...left, ...right]).size;
  const shared = [...left].filter(tag => right.has(tag)).length;
  return { affinity: union === 0 ? 0 : shared / union, coverage: 0.3 };
}

function constraintState(game, constraints) {
  let unknown = false;
  if (constraints.platform !== undefined && constraints.platform !== 'any') {
    if (game.platforms === null) unknown = true;
    else if (!game.platforms.includes(constraints.platform)) return 'fail';
  }
  if (constraints.coopOnly === true) {
    if (game.coop === false) return 'fail';
    if (game.coop === null) unknown = true;
  }
  return unknown ? 'unknown' : 'pass';
}

function validatePlan(plan, catalog) {
  assert(record(plan), 'Evaluation plan must be a JSON object');
  assert(plan.protocolVersion === 'real-genre-proxy-v1', 'Unsupported protocolVersion');
  assert(plan.methodVersion === 'feature-overlap-2', 'Unsupported player methodVersion');
  assert(plan.catalogSnapshotId === catalog.snapshotId, 'Catalog snapshot version mismatch');
  assert(Number.isInteger(plan.topK) && plan.topK > 0 && plan.topK <= 10, 'Invalid shared topK');
  assert(plan.blendLambda === 0.3, 'The frozen Blend lambda changed');
  assert(Array.isArray(plan.baskets) && plan.baskets.length === 30, 'Expected 30 predeclared baskets');
  const ids = new Set(catalog.games.map(game => game.id));
  const seen = new Set();
  for (const basket of plan.baskets) {
    assert(record(basket) && typeof basket.id === 'string' && basket.id.trim(), 'Invalid basket id');
    assert(!seen.has(basket.id), 'Duplicate basket id: ' + basket.id);
    seen.add(basket.id);
    assert(GROUPS.has(basket.group), 'Invalid basket group: ' + basket.id);
    assert(Array.isArray(basket.seeds) && basket.seeds.length >= 2 && basket.seeds.length <= 5,
      'A frozen basket needs 2–5 seeds: ' + basket.id);
    const seedIds = new Set();
    for (const seed of basket.seeds) {
      assert(record(seed) && ids.has(seed.id), 'Unknown basket seed: ' + basket.id);
      assert(!seedIds.has(seed.id), 'Duplicate basket seed: ' + basket.id);
      seedIds.add(seed.id);
      assert(Number.isInteger(seed.weight) && seed.weight >= 1 && seed.weight <= 10,
        'Invalid explicit seed weight: ' + basket.id);
    }
    assert(record(basket.constraints), 'Invalid basket constraints: ' + basket.id);
    for (const key of Object.keys(basket.constraints)) {
      assert(key === 'platform' || key === 'coopOnly', 'Unknown hard constraint: ' + basket.id);
    }
    if (Object.hasOwn(basket.constraints, 'platform')) {
      assert(PLATFORMS.has(basket.constraints.platform), 'Unsupported platform: ' + basket.id);
    }
    if (Object.hasOwn(basket.constraints, 'coopOnly')) {
      assert(typeof basket.constraints.coopOnly === 'boolean', 'Invalid coopOnly: ' + basket.id);
    }
    assert(Array.isArray(basket.excludedCandidateIds), 'Missing exclusion list: ' + basket.id);
    const excluded = new Set();
    for (const id of basket.excludedCandidateIds) {
      assert(ids.has(id) && !seedIds.has(id) && !excluded.has(id), 'Invalid exclusion: ' + basket.id);
      excluded.add(id);
    }
  }
}

function measuredMode(row) {
  const seeds = row.seed_ids;
  const values = row.ranked.map(item => seeds.map(id => item.per_seed_affinity[id]));
  return {
    top_ids: row.ranked.map(item => item.candidate_id),
    ranked_count: row.ranked.length,
    unknown_count: row.uncertain.length,
    excluded_count: row.excluded.length,
    all_seed_supported_count: values.filter(pair => pair.every(value => value > 0)).length,
    zero_genre_overlap_count: values.filter(pair => pair.every(value => value === 0)).length,
    supported_seed_strands: seeds.filter(id =>
      row.ranked.some(item => item.per_seed_affinity[id] > 0)).length,
  };
}

export function evaluateFrozenPilot(catalogText, plan) {
  assert(typeof catalogText === 'string', 'Catalog must be the exact raw JSON text');
  assert(record(plan) && /^[a-f0-9]{40}$/.test(plan.catalogBlobSha1), 'Missing frozen catalog blob SHA');
  assert(gitBlobSha1(catalogText) === plan.catalogBlobSha1, 'Frozen catalog blob changed (no silent refresh)');
  const catalog = validateCatalogSnapshot(JSON.parse(catalogText), { requirePublishable: true });
  assert(catalog.kind === 'real' && catalog.games.length === 30, 'Expected 30 licensed real-pilot games');
  assert(catalog.games.every(game => game.mechanics === null), 'Pilot method no longer genre-only; revise protocol');
  validatePlan(plan, catalog);
  const byId = new Map(catalog.games.map(game => [game.id, game]));
  const baskets = [];

  for (const basket of plan.baskets) {
    const candidates = catalog.games.map(game => {
      const evidence = basket.seeds.map(seed => genrePair(game, byId.get(seed.id)));
      return {
        id: game.id,
        affinities: Object.fromEntries(basket.seeds.map((seed, i) => [seed.id, evidence[i].affinity])),
        evidenceCoverage: Math.min(...evidence.map(item => item.coverage)),
        hardConstraintState: constraintState(game, basket.constraints),
      };
    });
    // A single candidate pool, eligibility state and topK for every method.
    const constrained = Object.keys(basket.constraints).length > 0;
    const states = Object.fromEntries(candidates.map(candidate => [candidate.id, candidate.hardConstraintState]));
    const input = {
      protocolVersion: plan.protocolVersion,
      catalogSnapshotId: plan.catalogSnapshotId,
      methodVersion: plan.methodVersion,
      topK: plan.topK,
      blend: { lambda: plan.blendLambda },
      modes: MODES,
      candidates,
      baskets: [{
        id: basket.id, seeds: basket.seeds, constraints: basket.constraints,
        excludedCandidateIds: basket.excludedCandidateIds,
        ...(constrained ? { candidateConstraintStates: states } : {}),
      }],
    };
    const benchmark = runBenchmark(input);
    const byMode = Object.fromEntries(benchmark.results.map(row => [row.mode, measuredMode(row)]));
    const excluded = new Set(basket.excludedCandidateIds);
    const eligibleCandidates = candidates.filter(candidate => !excluded.has(candidate.id));
    // Single-seed lists are contextual references, not a disguised multi-seed method.
    const singleSeedNeighbors = basket.seeds.map(seed => {
      const partition = rankCandidates(eligibleCandidates, [{ id: seed.id, weight: 1 }],
        { mode: 'arithmetic' });
      return {
        seed_id: seed.id,
        top_ids: partition.ranked.slice(0, plan.topK).map(item => item.id),
        uncertain_count: partition.uncertain.length,
        excluded_count: partition.excluded.length + excluded.size,
      };
    });
    const arithmeticIds = byMode.arithmetic.top_ids;
    baskets.push({
      basket_id: basket.id,
      group: basket.group,
      seed_ids: basket.seeds.map(seed => seed.id),
      seed_weights: basket.seeds.map(seed => seed.weight),
      constraints: basket.constraints,
      excluded_candidate_ids: basket.excludedCandidateIds,
      single_seed_neighbors: singleSeedNeighbors,
      mode_diagnostics: byMode,
      negative_signals: {
        all_modes_abstained: benchmark.results.every(row => row.ranked.length === 0),
        intersection_has_no_all_seed_support: byMode.intersection.all_seed_supported_count === 0,
        blend_same_top_ids_as_arithmetic: JSON.stringify(byMode.blend.top_ids) === JSON.stringify(arithmeticIds),
      },
      results: benchmark.results,
    });
  }
  return {
    protocol_version: plan.protocolVersion,
    catalog_snapshot_id: catalog.snapshotId,
    catalog_git_blob_sha1: plan.catalogBlobSha1,
    method_version: plan.methodVersion,
    catalog_game_count: catalog.games.length,
    basket_count: baskets.length,
    top_k: plan.topK,
    blend_lambda: plan.blendLambda,
    modes: MODES,
    proxy_only: 'Genre-overlap and list-strand diagnostics are not preference, accuracy, or player usefulness.',
    summary: {
      all_modes_abstained_baskets: baskets.filter(b => b.negative_signals.all_modes_abstained).map(b => b.basket_id),
      no_all_seed_intersection_support_baskets: baskets.filter(b =>
        b.negative_signals.intersection_has_no_all_seed_support).map(b => b.basket_id),
      blend_identical_to_arithmetic_baskets: baskets.filter(b =>
        b.negative_signals.blend_same_top_ids_as_arithmetic).map(b => b.basket_id),
    },
    baskets,
  };
}

export function loadFrozenPilot() {
  return evaluateFrozenPilot(readFileSync(CATALOG_FILE, 'utf8'),
    JSON.parse(readFileSync(PLAN_FILE, 'utf8')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/evaluate-real-pilot.mjs > report.json');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(loadFrozenPilot(), null, 2) + '\n');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
