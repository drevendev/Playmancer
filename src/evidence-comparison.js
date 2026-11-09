import { CATALOG, CATALOG_VERSION, METHOD_VERSION, PLATFORMS, pairEvidence, constraintState } from './demo.js';
import { prepareEvidenceModel, rankEvidenceBasket, EVIDENCE_METHOD_VERSION } from './evidence-similarity.js';
import { blendCandidates, rankCandidates } from './ranking.js';

// Diagnostic only: authored fictional tags are a controlled proxy, NOT scraped/store tags.
// A partially observed legacy profile remains unknown in the experiment; never
// renormalize its surviving theme group to imply that all tags are known.
const GROUPS = [ ['mechanics', 'mechanic', 0.7], ['themes', 'theme', 0.3] ];
const MODES = ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend'];
const RECEIPT = 'playmancer:authored-fictional-fixture';
const VERSION = 'p76-synthetic-paired-5';

function check(condition, message) { if (!condition) throw new TypeError(message); }
function knownId(id, ids, label) {
  check(typeof id === 'string' && ids.has(id), `${label} references an unknown game: ${String(id)}`);
  return id;
}
function profile(game) {
  const complete = GROUPS.every(([key]) => Array.isArray(game[key]) && game[key].length > 0);
  const tags = complete ? GROUPS.flatMap(([key, prefix, mass]) =>
    game[key].map(value => ({ id: `${prefix}:${value}`, weight: mass / game[key].length, source: RECEIPT }))) : null;
  return { id: game.id, tags,
    metadata: game.platforms == null ? {} : { platforms: { value: game.platforms, source: RECEIPT } },
    coop: game.coop, ...(game.coop == null ? {} : { coopSource: RECEIPT }) };
}
function prepareFixture(input) {
  check(input && typeof input === 'object' && !Array.isArray(input), 'comparison input must be an object');
  check(input.protocolVersion === VERSION, `unsupported comparison protocol: ${String(input.protocolVersion)}`);
  check(input.catalogSnapshotId === CATALOG_VERSION, 'comparison catalog revision mismatch');
  check(Number.isInteger(input.topK) && input.topK >= 1 && input.topK <= CATALOG.length, 'topK out of range');
  check(typeof input.lambda === 'number' && Number.isFinite(input.lambda) && input.lambda >= 0 && input.lambda <= 1, 'invalid Blend lambda');
  check(Array.isArray(input.baskets) && input.baskets.length > 0 && input.baskets.length <= 50, 'expected 1-50 baskets');
  check(Array.isArray(input.relations), 'explicit authored relations are required');
  const gameById = new Map(CATALOG.map(game => [game.id, game]));
  const ids = new Set(gameById.keys());
  const baskets = new Set();
  for (const basket of input.baskets) {
    check(basket && typeof basket === 'object' && typeof basket.id === 'string' && basket.id.trim(), 'invalid basket id');
    check(!baskets.has(basket.id), `duplicate basket id: ${basket.id}`);
    baskets.add(basket.id);
    check(Array.isArray(basket.seeds) && basket.seeds.length >= 2 && basket.seeds.length <= 5, 'expected 2-5 seeds');
    const seeds = new Set();
    for (const seed of basket.seeds) {
      check(seed && typeof seed === 'object', 'invalid seed');
      knownId(seed.id, ids, 'seed');
      check(!seeds.has(seed.id), `duplicate seed: ${seed.id}`);
      seeds.add(seed.id);
      check(typeof seed.weight === 'number' && Number.isFinite(seed.weight) && seed.weight > 0, 'seed weights must be positive finite numbers');
    }
    check(PLATFORMS.includes(basket.platform), 'unsupported platform constraint');
    check(typeof basket.coopOnly === 'boolean', 'coopOnly must be boolean');
    check(Array.isArray(basket.excluded) && new Set(basket.excluded).size === basket.excluded.length, 'duplicate or missing exclusions');
    for (const id of basket.excluded) { knownId(id, ids, 'exclusion'); check(!seeds.has(id), 'seed cannot be excluded'); }
    check(Array.isArray(basket.probeIds) && new Set(basket.probeIds).size === basket.probeIds.length, 'probeIds must be unique array');
    for (const id of basket.probeIds) {
      knownId(id, ids, 'probe');
      check(!seeds.has(id), 'probe cannot be a seed');
      check(!basket.excluded.includes(id), 'probe cannot be explicitly excluded: ' + id);
      // Probe deltas are meaningless if a proposed target is unavailable under
      // the same mandatory platform/co-op filters as both rankers.
      check(constraintState(gameById.get(id), basket) === 'pass',
        'probe must pass hard constraints (not fail or unknown): ' + id);
    }
  }
  return prepareEvidenceModel({ games: CATALOG.map(profile), relations: input.relations });
}
function idsOf(items) { return items.map(item => item.id); }
function oldRanking(basket, mode, topK, lambda) {
  const seedsById = new Map(CATALOG.map(game => [game.id, game]));
  const excluded = new Set(basket.excluded);
  const candidates = CATALOG.map(game => {
    const comparisons = basket.seeds.map(seed => ({ id: seed.id, ...pairEvidence(game, seedsById.get(seed.id)) }));
    return { id: game.id, affinities: Object.fromEntries(comparisons.map(item => [item.id, item.affinity])),
      evidenceCoverage: Math.min(...comparisons.map(item => item.coverage)),
      hardConstraintState: excluded.has(game.id) ? 'fail' : constraintState(game, basket) };
  });
  return mode === 'blend' ? blendCandidates(candidates, basket.seeds, { lambda, limit: topK })
    : rankCandidates(candidates, basket.seeds, { mode });
}
function summarize(partition, topK) {
  return { top: idsOf(partition.ranked.slice(0, topK)),
    uncertain: idsOf(partition.uncertain), excluded: idsOf(partition.excluded) };
}
function probeHits(top, probes) { return probes.filter(id => top.includes(id)).length; }
// Raw probe deltas include evidence availability. Keep them, but also report
// authored probes scoreable by BOTH methods; this is not a human relevance study.
export function pairedProbeDiagnostics(probes, oldTop, v2Top, oldAbstained, v2Abstained) {
  const oldUnknown = new Set(oldAbstained), v2Unknown = new Set(v2Abstained);
  const comparable = probes.filter(id => !oldUnknown.has(id) && !v2Unknown.has(id));
  const unpaired = probes.filter(id => oldUnknown.has(id) || v2Unknown.has(id))
    .map(id => ({ id, old: oldUnknown.has(id) ? 'abstained' : 'rankable',
      v2: v2Unknown.has(id) ? 'abstained' : 'rankable' }));
  const oldHits = probeHits(oldTop, comparable), v2Hits = probeHits(v2Top, comparable);
  return { comparable_probe_ids: comparable, probe_evidence_unpaired: unpaired,
    paired_probe_hits_old: oldHits, paired_probe_hits_v2: v2Hits,
    paired_probe_delta: v2Hits - oldHits };
}
// A probe-only intersection is insufficient: one-sided rankable background games
// still consume top-k slots, and Blend's greedy state depends on those choices.
// Re-run BOTH production rankers on the exact same fully scoreable candidate pool.
export function pairedRankableCohort(legacyFull, experimentalFull, seeds, mode, lambda, topK) {
  const oldById = new Map(legacyFull.ranked.map(item => [item.id, item]));
  const newById = new Map(experimentalFull.ranked.map(item => [item.id, item]));
  const shared = [...oldById.keys()].filter(id => newById.has(id)).sort();
  const oldOnly = [...oldById.keys()].filter(id => !newById.has(id)).sort();
  const newOnly = [...newById.keys()].filter(id => !oldById.has(id)).sort();
  const rerank = byId => {
    const candidates = shared.map(id => {
      const item = byId.get(id);
      return { id, affinities: item.affinities, evidenceCoverage: item.evidenceCoverage,
        hardConstraintState: 'pass' };
    });
    const ranked = mode === 'blend'
      ? blendCandidates(candidates, seeds, { lambda, limit: topK }).ranked
      : rankCandidates(candidates, seeds, { mode }).ranked.slice(0, topK);
    return idsOf(ranked);
  };
  const pairedOld = rerank(oldById), pairedV2 = rerank(newById);
  return { paired_rankable_ids: shared, old_only_rankable_ids: oldOnly,
    v2_only_rankable_ids: newOnly, paired_top_old: pairedOld, paired_top_v2: pairedV2,
    paired_shared_top_k: pairedOld.filter(id => pairedV2.includes(id)).length };
}

function hardUnknownIds(partition) {
  return partition.uncertain.filter(item => item.reason === 'hard-constraint-unknown')
    .map(item => item.id).sort();
}
// Independent catalog eligibility, not a model-produced prediction. Blend returns
// only top-k ranked items, so its ranked.length is not the opportunity denominator.
function eligibleUniverse(basket) {
  const seeds = new Set(basket.seeds.map(seed => seed.id));
  const excluded = new Set(basket.excluded);
  const eligible = [], hardUnknown = [], hardExcluded = [];
  for (const game of CATALOG) {
    const state = constraintState(game, basket);
    if (seeds.has(game.id) || excluded.has(game.id) || state === 'fail') hardExcluded.push(game.id);
    else if (state === 'unknown') hardUnknown.push(game.id);
    else eligible.push(game.id);
  }
  return { eligible: eligible.sort(), hardUnknown: hardUnknown.sort(), hardExcluded: hardExcluded.sort() };
}
function evidenceAbstentions(partition) {
  return partition.uncertain.filter(item => item.reason !== 'hard-constraint-unknown')
    .map(item => item.id).sort();
}

export function runEvidenceComparison(input) {
  const model = prepareFixture(input);
  const rows = [];
  for (const basket of input.baskets) {
    // The exact same immutable synthetic catalog, effective basket, top-k,
    // hard filters and exclusions are passed to both ranking implementations.
    // Differences in evidence-known status are reported, not reclassified as failures.
    for (const mode of MODES) {
      const legacyResult = oldRanking(basket, mode, CATALOG.length, input.lambda);
      const experimentalResult = rankEvidenceBasket(model, {
        seeds: basket.seeds, mode, platform: basket.platform, coopOnly: basket.coopOnly,
        excluded: basket.excluded, lambda: input.lambda, limit: CATALOG.length,
      });
      // Ranking uncertainty may differ because the models observe different
      // features. Unknown *hard-filter* states may not differ or become passes.
      const universe = eligibleUniverse(basket);
      const eligibleSet = new Set(universe.eligible);
      // The legacy filter treats absence from a positive-only platform list as
      // failure. Experimental v9 instead abstains. Both require positive support
      // for the identical rankable pool; expose the different partitions.
      const seeds = new Set(basket.seeds.map(seed => seed.id));
      const blocked = new Set(basket.excluded);
      const platformUnverified = CATALOG.filter(game =>
        !seeds.has(game.id) && !blocked.has(game.id) &&
        basket.platform !== 'any' && Array.isArray(game.platforms) &&
        !game.platforms.includes(basket.platform) &&
        (!basket.coopOnly || game.coop !== false)).map(game => game.id).sort();
      const reclassified = new Set(platformUnverified);
      const v2Unknown = [...universe.hardUnknown, ...platformUnverified].sort();
      const v2Excluded = universe.hardExcluded.filter(id => !reclassified.has(id));
      const oldAbstained = evidenceAbstentions(legacyResult);
      const v2Abstained = evidenceAbstentions(experimentalResult);
      for (const [method, partition, abstained] of [
        ['old', legacyResult, oldAbstained], ['v2', experimentalResult, v2Abstained],
      ]) {
        const expectedUnknown = method === 'old' ? universe.hardUnknown : v2Unknown;
        const expectedExcluded = method === 'old' ? universe.hardExcluded : v2Excluded;
        check(JSON.stringify(hardUnknownIds(partition)) === JSON.stringify(expectedUnknown),
          `hard constraint unknown drift for ${basket.id}/${mode}/${method}`);
        check(JSON.stringify(idsOf(partition.excluded).sort()) === JSON.stringify(expectedExcluded),
          `hard exclusion drift for ${basket.id}/${mode}/${method}`);
        check(abstained.every(id => eligibleSet.has(id)) &&
          partition.ranked.every(item => eligibleSet.has(item.id) && !abstained.includes(item.id)),
          `non-eligible ranked/abstained candidate for ${basket.id}/${mode}/${method}`);
      }
      const legacy = summarize(legacyResult, input.topK);
      const experimental = summarize(experimentalResult, input.topK);
      const legacyHits = probeHits(legacy.top, basket.probeIds);
      const experimentalHits = probeHits(experimental.top, basket.probeIds);
      const paired = pairedRankableCohort(legacyResult, experimentalResult,
        basket.seeds, mode, input.lambda, input.topK);
      const pairedProbes = pairedProbeDiagnostics(basket.probeIds, paired.paired_top_old,
        paired.paired_top_v2, oldAbstained, v2Abstained);
      check(JSON.stringify(pairedProbes.comparable_probe_ids) ===
        JSON.stringify(basket.probeIds.filter(id => paired.paired_rankable_ids.includes(id))),
        `paired probe/candidate mismatch for ${basket.id}/${mode}`);
      rows.push({ basket_id: basket.id, mode, constraints: { platform: basket.platform, coopOnly: basket.coopOnly },
        seeds: basket.seeds.map(seed => ({ id: seed.id, weight: seed.weight })),
        excluded_ids: [...basket.excluded], probe_ids: [...basket.probeIds],
        old: legacy, v2: experimental,
        eligible_candidates: universe.eligible.length,
        hard_unknown_candidates: universe.hardUnknown.length,
        hard_excluded_candidates: universe.hardExcluded.length,
        v2_hard_unknown_candidates: v2Unknown.length,
        v2_hard_excluded_candidates: v2Excluded.length,
        platform_support_reclassified_to_unknown: platformUnverified,
        rankable_opportunities_old: universe.eligible.length - oldAbstained.length,
        rankable_opportunities_v2: universe.eligible.length - v2Abstained.length,
        probe_evidence_unknown_old: basket.probeIds.filter(id => oldAbstained.includes(id)),
        probe_evidence_unknown_v2: basket.probeIds.filter(id => v2Abstained.includes(id)),
        shared_top_k: legacy.top.filter(id => experimental.top.includes(id)).length,
        probe_hits_old: legacyHits, probe_hits_v2: experimentalHits,
        probe_delta: experimentalHits - legacyHits,
        ...paired, ...pairedProbes });
    }
  }
  return { report_schema: VERSION, catalog_snapshot_id: CATALOG_VERSION,
    old_method: METHOD_VERSION, new_method: EVIDENCE_METHOD_VERSION,
    evidence_source: 'authored-fictional-only',
    warning: 'Offline synthetic probes, NOT real-catalog tags, human labels or measured uplift; identical positive-support rankable pool, but positive-only platform records can move from legacy excluded to v2 unknown. Bridge route quality is not evaluated.',
    game_count: CATALOG.length, basket_count: input.baskets.length,
    top_k: input.topK, blend_lambda: input.lambda, modes: [...MODES],
    losses: rows.filter(row => row.probe_delta < 0).map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.probe_delta })),
    gains: rows.filter(row => row.probe_delta > 0).map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.probe_delta })),
    paired_losses: rows.filter(row => row.paired_probe_delta < 0).map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.paired_probe_delta })),
    paired_gains: rows.filter(row => row.paired_probe_delta > 0).map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.paired_probe_delta })),
    rows };
}
