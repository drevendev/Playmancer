import { CATALOG, CATALOG_VERSION, METHOD_VERSION, PLATFORMS, pairEvidence, constraintState } from './demo.js';
import { prepareEvidenceModel, rankEvidenceBasket, EVIDENCE_METHOD_VERSION } from './evidence-similarity.js';
import { blendCandidates, rankCandidates } from './ranking.js';

// Diagnostic only: authored fictional tags are a controlled proxy, NOT scraped/store tags.
// A partially observed legacy profile remains unknown in the experiment; never
// renormalize its surviving theme group to imply that all tags are known.
const GROUPS = [ ['mechanics', 'mechanic', 0.7], ['themes', 'theme', 0.3] ];
const MODES = ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend'];
const RECEIPT = 'playmancer:authored-fictional-fixture';
const VERSION = 'p76-synthetic-paired-1';

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
  const ids = new Set(CATALOG.map(game => game.id));
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
    for (const id of basket.probeIds) { knownId(id, ids, 'probe'); check(!seeds.has(id), 'probe cannot be a seed'); }
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

export function runEvidenceComparison(input) {
  const model = prepareFixture(input);
  const rows = [];
  for (const basket of input.baskets) {
    // The exact same immutable synthetic catalog, effective basket, top-k,
    // hard filters and exclusions are passed to both ranking implementations.
    // Differences in evidence-known status are reported, not reclassified as failures.
    for (const mode of MODES) {
      const legacy = summarize(oldRanking(basket, mode, input.topK, input.lambda), input.topK);
      const experimental = summarize(rankEvidenceBasket(model, {
        seeds: basket.seeds, mode, platform: basket.platform, coopOnly: basket.coopOnly,
        excluded: basket.excluded, lambda: input.lambda, limit: input.topK,
      }), input.topK);
      check(JSON.stringify(legacy.excluded) === JSON.stringify(experimental.excluded),
        `hard exclusion drift for ${basket.id}/${mode}`);
      const legacyHits = probeHits(legacy.top, basket.probeIds);
      const experimentalHits = probeHits(experimental.top, basket.probeIds);
      rows.push({ basket_id: basket.id, mode, constraints: { platform: basket.platform, coopOnly: basket.coopOnly },
        seeds: basket.seeds.map(seed => ({ id: seed.id, weight: seed.weight })),
        excluded_ids: [...basket.excluded], probe_ids: [...basket.probeIds],
        old: legacy, v2: experimental,
        shared_top_k: legacy.top.filter(id => experimental.top.includes(id)).length,
        probe_hits_old: legacyHits, probe_hits_v2: experimentalHits,
        probe_delta: experimentalHits - legacyHits });
    }
  }
  return { report_schema: VERSION, catalog_snapshot_id: CATALOG_VERSION,
    old_method: METHOD_VERSION, new_method: EVIDENCE_METHOD_VERSION,
    evidence_source: 'authored-fictional-only',
    warning: 'Offline synthetic probes, NOT real-catalog tags, human labels or measured uplift; Bridge route quality is not evaluated.',
    game_count: CATALOG.length, basket_count: input.baskets.length,
    top_k: input.topK, blend_lambda: input.lambda, modes: [...MODES],
    losses: rows.filter(row => row.probe_delta < 0).map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.probe_delta })),
    gains: rows.filter(row => row.probe_delta > 0).map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.probe_delta })),
    rows };
}
