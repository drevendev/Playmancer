// Offline, source-limited diagnostic for the already approved 30-game pilot.
// Equal genre weights are an AUTHORED PROXY, never sourced game-tag importance.
import { createHash } from 'node:crypto';
import { validateCatalogSnapshot } from './catalog.js';
import { prepareEvidenceModel, rankEvidenceBasket, EVIDENCE_METHOD_VERSION } from './evidence-similarity.js';
import { evaluateFrozenPilot } from '../scripts/evaluate-real-pilot.mjs';

export const REAL_EVIDENCE_PROTOCOL = 'p76-frozen-real-genre-proxy-1';
export const FROZEN_CATALOG_ID = 'multi-store-genre-pilot-30-2026-10-28';
export const FROZEN_CATALOG_BLOB = '0570fd610b14fb336c0de65e6cc3062892abe301';
// The immutable, predeclared 30-basket plan (Git blob of 2-space JSON + LF).
export const FROZEN_PLAN_BLOB = 'e28809801448df2f73c604d0349ce71c042d7f53';
const MODES = ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend'];

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}
function gitBlobSha1(text) {
  return createHash('sha1').update('blob ' + Buffer.byteLength(text, 'utf8') + '\0')
    .update(text).digest('hex');
}
export function canonicalGenreTag(value) {
  assert(typeof value === 'string' && value.trim(), 'genre label must be nonempty text');
  // No synonym assumptions. Any normalized collision is a hard error.
  const slug = value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  assert(slug.length > 0 && slug.length <= 89, 'unsupported genre label: ' + value);
  return 'genre:' + slug;
}
function receipt(game, field, source, snapshotId) {
  if (game.sourceId === 'wikidata-cc0') {
    assert(/^wikidata:q[0-9]+$/.test(game.id), 'Wikidata game ID missing QID');
    return 'https://www.wikidata.org/wiki/' + game.id.split(':')[1].toUpperCase() +
      (field === 'themes' ? '#P136' : '#P400') +
      ' (frozen ' + snapshotId + ' / ' + game.id + ' / ' + field + ')';
  }
  const listing = game.storeLinks[0]?.url ?? source.rights.reference;
  return listing + ' (frozen ' + snapshotId + ' / ' + game.id + ' / ' + field + ')';
}

export function projectFrozenGenres(input) {
  // The catalog validator enforces per-field publication rights and canonical
  // game identity. Do not independently import store/community tags.
  const snapshot = validateCatalogSnapshot(input, { requirePublishable: true });
  assert(snapshot.snapshotId === FROZEN_CATALOG_ID && snapshot.kind === 'real' &&
    snapshot.games.length === 30, 'not the frozen 30-game real catalog');
  assert(snapshot.games.every(game => game.mechanics === null && game.coop === null),
    'pilot coverage changed: revise the experiment rather than silently enrich it');
  const sources = new Map(snapshot.sources.map(source => [source.id, source]));
  return snapshot.games.map(game => {
    const source = sources.get(game.sourceId);
    assert(source.rights.fields.includes('themes'), 'genre rights missing: ' + game.id);
    const tags = game.themes === null || game.themes.length === 0 ? null : (() => {
      const ids = game.themes.map(canonicalGenreTag);
      assert(new Set(ids).size === ids.length, 'genre alias collision: ' + game.id);
      return ids.map(id => ({ id, weight: 1 / ids.length,
        source: receipt(game, 'themes', source, snapshot.snapshotId) }));
    })();
    const metadata = {};
    if (game.platforms !== null) {
      assert(source.rights.fields.includes('platforms'), 'platform rights missing: ' + game.id);
      metadata.platforms = {
        value: game.platforms,
        source: receipt(game, 'platforms', source, snapshot.snapshotId),
      };
    }
    // No creator/year/co-op/curated link assertions without field receipts.
    return { id: game.id, tags, metadata, coop: null };
  });
}

function ids(items, field = 'id') { return items.map(item => item[field]); }
function sortedIds(items) { return [...items].sort((a, b) => a < b ? -1 : a > b ? 1 : 0); }
function equalIds(left, right) { return JSON.stringify(sortedIds(left)) === JSON.stringify(sortedIds(right)); }
function supportFromTags(item) {
  return item.evidence.every(pair => pair.tags.similarity !== null && pair.tags.similarity > 0);
}
function detail(item) {
  return {
    id: item.id,
    observed_genre_support_by_seed: Object.fromEntries(item.evidence.map(pair =>
      [pair.seedId, pair.tags.similarity])),
    composite_fit_by_seed: Object.fromEntries(item.evidence.map(pair =>
      [pair.seedId, pair.affinity])),
    evidence_coverage_by_seed: Object.fromEntries(item.evidence.map(pair =>
      [pair.seedId, pair.evidenceCoverage])),
  };
}

export function runFrozenRealEvidenceComparison(catalogText, frozenPlan) {
  // Reuse the existing exact-blob, rights-cleared, 30-basket legacy diagnostic.
  // The plan's own hash alone is insufficient; also pin the known source blob.
  assert(frozenPlan?.catalogBlobSha1 === FROZEN_CATALOG_BLOB, 'unexpected frozen catalog hash');
  // Verify the complete declared basket plan, not merely its catalog reference.
  // Its committed file is precisely JSON.stringify(plan, null, 2) + LF.
  assert(gitBlobSha1(JSON.stringify(frozenPlan, null, 2) + '\n') === FROZEN_PLAN_BLOB,
    'frozen basket plan changed (requires a new versioned evaluation)');
  const baseline = evaluateFrozenPilot(catalogText, frozenPlan);
  assert(baseline.catalog_snapshot_id === FROZEN_CATALOG_ID &&
    baseline.catalog_git_blob_sha1 === FROZEN_CATALOG_BLOB, 'frozen source changed');
  const snapshot = validateCatalogSnapshot(JSON.parse(catalogText), { requirePublishable: true });
  const profiles = projectFrozenGenres(snapshot);
  const model = prepareEvidenceModel({ games: profiles, relations: [] });
  const rows = [];
  for (let i = 0; i < frozenPlan.baskets.length; i++) {
    const basket = frozenPlan.baskets[i];
    const baseBasket = baseline.baskets[i];
    assert(basket.id === baseBasket.basket_id, 'baseline basket order drift');
    for (const mode of MODES) {
      const old = baseBasket.results.find(row => row.mode === mode);
      assert(old !== undefined, 'missing legacy mode: ' + mode);
      const v2 = rankEvidenceBasket(model, {
        seeds: basket.seeds, mode, lambda: frozenPlan.blendLambda,
        limit: frozenPlan.topK, platform: basket.constraints.platform ?? 'any',
        coopOnly: basket.constraints.coopOnly ?? false,
        excluded: basket.excludedCandidateIds,
      });
      const excludedOld = ids(old.excluded, 'candidate_id');
      const excludedV2 = ids(v2.excluded);
      assert(equalIds(excludedOld, excludedV2),
        'changed hard constraint/seed/exclusion eligibility: ' + basket.id + '/' + mode);
      const oldTop = ids(old.ranked, 'candidate_id');
      const newTop = ids(v2.ranked);
      const seedIds = basket.seeds.map(seed => seed.id);
      assert(newTop.every(id => !seedIds.includes(id) &&
        !basket.excludedCandidateIds.includes(id)), 'ineligible v2 recommendation');
      const oldSupported = baseBasket.mode_diagnostics[mode].all_seed_supported_count;
      const newSupported = v2.ranked.filter(supportFromTags).length;
      rows.push({
        basket_id: basket.id, group: basket.group, mode,
        seeds: basket.seeds.map(seed => ({ id: seed.id, weight: seed.weight })),
        constraints: { ...basket.constraints },
        explicit_exclusions: [...basket.excludedCandidateIds],
        excluded_old: sortedIds(excludedOld), excluded_v2: sortedIds(excludedV2),
        old_top: oldTop, v2_top: newTop,
        v2_top_observed_evidence: v2.ranked.map(detail),
        unknown_old: ids(old.uncertain, 'candidate_id'),
        unknown_v2: ids(v2.uncertain),
        shared_top_k: oldTop.filter(id => newTop.includes(id)).length,
        changed_order: JSON.stringify(oldTop) !== JSON.stringify(newTop),
        old_top_all_seed_genre_support: oldSupported,
        v2_top_all_seed_genre_support: newSupported,
        lost_observed_genre_support: newSupported < oldSupported,
        gained_observed_genre_support: newSupported > oldSupported,
      });
    }
  }
  const known = profiles.filter(game => game.tags !== null).length;
  const absent = profiles.filter(game => game.tags === null).map(game => game.id);
  return {
    report_schema: REAL_EVIDENCE_PROTOCOL,
    catalog_snapshot_id: FROZEN_CATALOG_ID, frozen_catalog_git_blob_sha1: FROZEN_CATALOG_BLOB,
    frozen_basket_plan_git_blob_sha1: FROZEN_PLAN_BLOB,
    catalog_games: profiles.length, genre_tagged_games: known, missing_genre_game_ids: absent,
    old_method: baseline.method_version, v2_method: EVIDENCE_METHOD_VERSION,
    basket_count: frozenPlan.baskets.length, top_k: frozenPlan.topK,
    blend_lambda: frozenPlan.blendLambda, modes: [...MODES],
    weight_policy: 'Equal authorship-only mass among each game\'s observed CC0/owner-published genres; not source-ranked tag importance.',
    observed_lanes: ['genre', 'platforms'], curated_relation_count: 0,
    unobserved_lanes: ['mechanics', 'visual-style', 'characters', 'mood', 'creator', 'franchise', 'release-year', 'curated-links', 'coop'],
    warning: 'Offline same-eligibility real-identity genre-only PROXY; no human labels, measured uplift or complete semantic tag vectors. v2 metadata contributes known platform overlap only; Bridge not evaluated.',
    summary: {
      paired_rows: rows.length,
      changed_rank_orders: rows.filter(row => row.changed_order).length,
      decreased_observed_genre_support_rows: rows.filter(row => row.lost_observed_genre_support)
        .map(row => ({ basket_id: row.basket_id, mode: row.mode })),
      increased_observed_genre_support_rows: rows.filter(row => row.gained_observed_genre_support)
        .map(row => ({ basket_id: row.basket_id, mode: row.mode })),
      no_v2_ranked_rows: rows.filter(row => row.v2_top.length === 0).length,
      no_legacy_ranked_rows: rows.filter(row => row.old_top.length === 0).length,
    },
    rows,
  };
}
