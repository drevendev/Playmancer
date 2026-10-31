// Frozen, offline release-gate audit for the eight selected-fact profiles.
// This measures abstention/eligibility, not recommendation quality.
import { createHash } from 'node:crypto';
import { validateCatalogSnapshot } from './catalog.js';
import { prepareTagTaxonomy, projectWeightedTagProfiles } from './tag-taxonomy.js';
import { prepareEvidenceModel, rankEvidenceBasket, EVIDENCE_METHOD_VERSION } from './evidence-similarity.js';
import {
  projectFrozenGenres, runFrozenRealEvidenceComparison,
  FROZEN_CATALOG_BLOB, FROZEN_PLAN_BLOB,
} from './evidence-real-pilot.js';

export const REVIEWED_TAG_READINESS_PROTOCOL = 'p76-reviewed-eight-readiness-1';
export const REVIEWED_EIGHT_TAGS_BLOB = '4c480de60b6d09f465cdd29f942ecdf17a6684c9';

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}
function blobSha(text) {
  const byteCount = Buffer.byteLength(text, 'utf8');
  return createHash('sha1').update('blob ' + byteCount + '\0').update(text).digest('hex');
}
function sortedIds(entries) {
  return entries.map(item => typeof item === 'string' ? item : item.id)
    .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

// Independently reconstruct the hard-filter partition from the frozen source.
// Ranking uncertainty is broader: missing similarity must never be confused
// with an unknown required platform/co-op property.
function hardFilterPartition(games, basket) {
  const seeds = new Set(basket.seeds.map(seed => seed.id));
  const explicit = new Set(basket.excludedCandidateIds);
  const excluded = [], hardUnknown = [];
  for (const game of games) {
    if (seeds.has(game.id) || explicit.has(game.id)) {
      excluded.push(game.id);
      continue;
    }
    let unknown = false;
    const requiredPlatform = basket.constraints.platform;
    if (requiredPlatform && requiredPlatform !== 'any') {
      if (game.platforms === null) unknown = true;
      else if (!game.platforms.includes(requiredPlatform)) {
        excluded.push(game.id);
        continue;
      }
    }
    if (basket.constraints.coopOnly) {
      if (game.coop === false) {
        excluded.push(game.id);
        continue;
      }
      if (game.coop === null) unknown = true;
    }
    if (unknown) hardUnknown.push(game.id);
  }
  return { excluded: excluded.sort(), hardUnknown: hardUnknown.sort() };
}

// Catalog/plan/selected-fact JSON are exact checked-in UTF-8 strings.
// No fetching, implicit tags, unverified complete vectors, or fallback ranking.
export function auditReviewedTagReadiness(catalogText, frozenPlan, reviewedTagsText) {
  assert(typeof catalogText === 'string' && blobSha(catalogText) === FROZEN_CATALOG_BLOB,
    'catalog blob changed: use a new versioned audit');
  assert(typeof reviewedTagsText === 'string' && blobSha(reviewedTagsText) === REVIEWED_EIGHT_TAGS_BLOB,
    'reviewed tag blob changed: use a new versioned audit');

  const reviewed = JSON.parse(reviewedTagsText);
  assert(reviewed.schemaVersion === 1 && reviewed.catalogGitBlobSha1 === FROZEN_CATALOG_BLOB &&
    reviewed.catalogSnapshotId === frozenPlan.catalogSnapshotId &&
    reviewed.games?.length === 8 && reviewed.receipts?.length === 8,
  'reviewed tag fixture/catalog mismatch');

  // The existing paired evaluator also validates the exact immutable basket-plan
  // blob, identical-catalog legacy baseline, source rights and hard constraints.
  const legacy = runFrozenRealEvidenceComparison(catalogText, frozenPlan);
  assert(legacy.frozen_basket_plan_git_blob_sha1 === FROZEN_PLAN_BLOB &&
    legacy.frozen_catalog_git_blob_sha1 === FROZEN_CATALOG_BLOB,
  'baseline source revision mismatch');

  const snapshot = validateCatalogSnapshot(JSON.parse(catalogText), { requirePublishable: true });
  const sourceProfiles = projectFrozenGenres(snapshot);
  const reviewedById = new Map(reviewed.games.map(game => [game.id, game]));
  assert(reviewedById.size === 8 && reviewed.receipts.length === 8 &&
    new Set(reviewed.receipts.map(receipt => receipt.id)).size === 8,
  'duplicate reviewed game or receipt');
  assert(reviewed.games.every(game => game.tagCoverage === 'partial' &&
    reviewed.receipts.some(receipt => receipt.id === game.id) &&
    sourceProfiles.some(sourceGame => sourceGame.id === game.id)),
  'selected observations must remain catalog-backed, sourced and partial');

  const taxonomy = prepareTagTaxonomy(reviewed.taxonomy);
  const profiles = projectWeightedTagProfiles(taxonomy, sourceProfiles.map(source => {
    const observation = reviewedById.get(source.id);
    return {
      ...source,
      tags: observation?.tags ?? null,
      ...(observation ? { tagCoverage: observation.tagCoverage } : {}),
    };
  })).games;
  const model = prepareEvidenceModel({ games: profiles, relations: [] });

  const coverage = { complete: 0, partial: 0, unknown: 0 };
  for (const profile of model.profiles.values()) coverage[profile.tagCoverage]++;

  const ids = [...model.profiles.keys()].sort();
  const pairCoverage = { rankable: 0, partial: 0, unknown: 0, positive_observed_overlap: 0 };
  for (let a = 0; a < ids.length; a++) {
    for (let b = a + 1; b < ids.length; b++) {
      const left = model.profiles.get(ids[a]), right = model.profiles.get(ids[b]);
      if (!left.tags || !right.tags) pairCoverage.unknown++;
      else {
        pairCoverage.partial++;
        const other = new Map(right.tags.map(tag => [tag.id, tag.weight]));
        if (left.tags.some(tag => other.has(tag.id))) pairCoverage.positive_observed_overlap++;
      }
      if (left.tagCoverage === 'complete' && right.tagCoverage === 'complete')
        pairCoverage.rankable++;
    }
  }

  const basketById = new Map(frozenPlan.baskets.map(basket => [basket.id, basket]));
  assert(basketById.size === frozenPlan.baskets.length, 'duplicate frozen basket');
  const rows = legacy.rows.map(old => {
    const basket = basketById.get(old.basket_id);
    assert(basket && basket.seeds.length > 0, 'missing frozen basket');
    const result = rankEvidenceBasket(model, {
      seeds: basket.seeds, mode: old.mode, lambda: frozenPlan.blendLambda,
      limit: frozenPlan.topK, platform: basket.constraints.platform ?? 'any',
      coopOnly: basket.constraints.coopOnly ?? false,
      excluded: basket.excludedCandidateIds,
    });
    const excluded = sortedIds(result.excluded);
    const hardUnknown = sortedIds(result.uncertain.filter(item =>
      item.reason === 'hard-constraint-unknown'));
    const expected = hardFilterPartition(snapshot.games, basket);
    assert(JSON.stringify(excluded) === JSON.stringify(expected.excluded) &&
      JSON.stringify(old.excluded_old) === JSON.stringify(expected.excluded),
    'hard-filter/seed/exclusion parity changed: ' + old.basket_id + '/' + old.mode);
    assert(JSON.stringify(hardUnknown) === JSON.stringify(expected.hardUnknown) &&
      expected.hardUnknown.every(id => old.unknown_old.includes(id)),
    'unknown required platform/co-op parity changed: ' + old.basket_id + '/' + old.mode);
    return {
      basket_id: old.basket_id, mode: old.mode,
      legacy_top: old.old_top, reviewed_top: result.ranked.map(item => item.id),
      legacy_unknown_count: old.unknown_old.length,
      reviewed_unknown_count: result.uncertain.length,
      hard_constraint_unknown_count: hardUnknown.length,
      excluded_count: excluded.length,
      eligible_count: snapshot.games.length - excluded.length - hardUnknown.length,
    };
  });

  return {
    schema: REVIEWED_TAG_READINESS_PROTOCOL,
    catalog_snapshot_id: snapshot.snapshotId,
    catalog_git_blob_sha1: FROZEN_CATALOG_BLOB,
    basket_plan_git_blob_sha1: FROZEN_PLAN_BLOB,
    reviewed_tags_git_blob_sha1: REVIEWED_EIGHT_TAGS_BLOB,
    taxonomy_version: taxonomy.version,
    experimental_method: EVIDENCE_METHOD_VERSION,
    legacy_method: legacy.old_method,
    game_count: snapshot.games.length,
    basket_count: frozenPlan.baskets.length,
    top_k: frozenPlan.topK,
    modes: legacy.modes,
    tag_profile_coverage: coverage,
    unordered_game_pairs: pairCoverage,
    scenario_count: rows.length,
    legacy_nonempty_scenarios: rows.filter(row => row.legacy_top.length > 0).length,
    reviewed_nonempty_scenarios: rows.filter(row => row.reviewed_top.length > 0).length,
    empty_with_legacy_results: rows.filter(row => row.legacy_top.length > 0 &&
      row.reviewed_top.length === 0).length,
    eligibility_parity: true,
    conclusion: 'NOT READY: selected facts are partial, so v2 abstains rather than manufacturing full-game similarity. A zero reviewed_top is not a zero player-fit score.',
    bridge_evaluated: false,
    human_quality_evaluated: false,
    rows,
  };
}
