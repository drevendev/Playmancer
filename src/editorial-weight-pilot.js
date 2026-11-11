// Offline editorial experiment over exactly four selected source-backed profiles.
// Weight hypotheses are NOT publisher weights or complete game-wide evidence.
import { createHash } from 'node:crypto';
import { projectFrozenGenres, FROZEN_CATALOG_BLOB, FROZEN_CATALOG_ID } from './evidence-real-pilot.js';
import { REVIEWED_TWENTY_NINE_TAGS_BLOB } from './reviewed-tag-readiness.js';
import { prepareTagTaxonomy, projectWeightedTagProfiles } from './tag-taxonomy.js';
import { prepareEvidenceModel, compareEvidenceGames, rankEvidenceBasket } from './evidence-similarity.js';

export const EDITORIAL_WEIGHT_PROTOCOL = 'p76-editorial-selected-weights-4';
const IDS = Object.freeze([
  'wikidata:q16972008', // Factorio
  'wikidata:q19581568', // RimWorld
  'wikidata:q248810',   // Dwarf Fortress
  'wikidata:q332697',   // Terraria
]);
const PAIRS = Object.freeze([
  ['wikidata:q16972008', 'wikidata:q332697'],
  ['wikidata:q16972008', 'wikidata:q248810'],
  ['wikidata:q19581568', 'wikidata:q248810'],
  ['wikidata:q332697', 'wikidata:q248810'],
]);
const BASKETS = Object.freeze([
  { id: 'factory-and-building', seeds: [{ id: IDS[0], weight: 2 }, { id: IDS[3], weight: 1 }] },
  { id: 'colonies-and-crafting', seeds: [{ id: IDS[1], weight: 2 }, { id: IDS[2], weight: 1 }] },
]);
function insist(ok, reason) { if (!ok) throw new TypeError(reason); }
function fields(value, keys, label) {
  insist(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype, label + ' must be a plain record');
  const actual = Object.keys(value);
  insist(actual.length === keys.length && actual.every(key => keys.includes(key)),
    label + ' contains missing or unknown fields');
}
function blobSha(text) {
  return createHash('sha1').update('blob ' + Buffer.byteLength(text, 'utf8') + '\0')
    .update(text).digest('hex');
}
function rounded(value) { return Math.round(value * 1e6) / 1e6; }
function buildProfiles(genres, reviewed, weightById = new Map()) {
  const observations = new Map(reviewed.games.map(game => [game.id, game]));
  const projected = genres.map(game => {
    const original = observations.get(game.id);
    if (!original) return { ...game, tags: null };
    insist(original.tagCoverage === 'partial' && original.tags?.length > 0,
      'reviewed selected-fact coverage changed: ' + game.id);
    const weights = weightById.get(game.id);
    const tags = original.tags.map(tag => ({
      ...tag, weight: weights ? weights[tag.id] : tag.weight,
    }));
    return { ...game, tags, tagCoverage: 'partial' };
  });
  return projectWeightedTagProfiles(prepareTagTaxonomy(reviewed.taxonomy), projected).games;
}
function checkPilot(pilot, reviewed) {
  fields(pilot, [
    'schemaVersion', 'protocol', 'catalogSnapshotId', 'catalogGitBlobSha1',
    'reviewedFactsGitBlobSha1', 'reviewedOn', 'weightPolicy', 'coverage', 'profiles',
  ], 'pilot');
  insist(pilot.schemaVersion === 1 && pilot.protocol === EDITORIAL_WEIGHT_PROTOCOL &&
    pilot.catalogSnapshotId === FROZEN_CATALOG_ID &&
    pilot.catalogGitBlobSha1 === FROZEN_CATALOG_BLOB &&
    pilot.reviewedFactsGitBlobSha1 === REVIEWED_TWENTY_NINE_TAGS_BLOB &&
    pilot.reviewedOn === '2026-11-11' &&
    typeof pilot.weightPolicy === 'string' && pilot.weightPolicy.includes('NOT relative weight') &&
    typeof pilot.coverage === 'string' && pilot.coverage.startsWith('partial-'),
    'pilot version, provenance or uncertainty disclosure changed');
  insist(Array.isArray(pilot.profiles) && pilot.profiles.length === IDS.length,
    'pilot must contain exactly four selected profiles');
  insist(pilot.profiles.map(p => p.id).join('|') === IDS.join('|'),
    'editorial cohort drift or duplicate game');
  const existing = new Map(reviewed.games.map(game => [game.id, game]));
  const byId = new Map();
  for (const profile of pilot.profiles) {
    fields(profile, ['id', 'weightByTag'], 'editorial profile');
    const source = existing.get(profile.id);
    insist(source?.tagCoverage === 'partial' && source.tags.length === 4,
      'missing four positive source observations: ' + profile.id);
    const originalIds = source.tags.map(tag => tag.id).sort();
    const weights = profile.weightByTag;
    fields(weights, originalIds, 'weights for ' + profile.id);
    insist(Object.keys(weights).sort().join('|') === originalIds.join('|'),
      'editorial weights added/dropped a source tag: ' + profile.id);
    let mass = 0;
    for (const id of originalIds) {
      const value = weights[id];
      insist(typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1,
        'invalid weight: ' + profile.id + '/' + id);
      mass += value;
    }
    insist(Math.abs(mass - 1) < 1e-9, 'editorial selected-fact mass must equal 1: ' + profile.id);
    byId.set(profile.id, weights);
  }
  return byId;
}

export function auditEditorialSelectedWeights(catalogText, reviewedText, pilotText) {
  insist(typeof catalogText === 'string' && blobSha(catalogText) === FROZEN_CATALOG_BLOB,
    'frozen real catalog changed');
  insist(typeof reviewedText === 'string' &&
    blobSha(reviewedText) === REVIEWED_TWENTY_NINE_TAGS_BLOB,
    'frozen 29-game observation source changed');
  const reviewed = JSON.parse(reviewedText);
  insist(reviewed.games?.length === 29 &&
    reviewed.catalogGitBlobSha1 === FROZEN_CATALOG_BLOB &&
    reviewed.games.every(game => game.tagCoverage === 'partial') &&
    reviewed.receipts?.length === 29, 'source cohort/coverage changed');
  const pilot = JSON.parse(pilotText);
  const weights = checkPilot(pilot, reviewed);
  const genres = projectFrozenGenres(JSON.parse(catalogText));
  const original = prepareEvidenceModel({ games: buildProfiles(genres, reviewed) });
  const edited = prepareEvidenceModel({ games: buildProfiles(genres, reviewed, weights) });
  const coverage = { complete: 0, partial: 0, unknown: 0 };
  for (const game of edited.profiles.values()) coverage[game.tagCoverage]++;

  const pairs = PAIRS.map(([left, right]) => {
    const before = compareEvidenceGames(original, left, right);
    const after = compareEvidenceGames(edited, left, right);
    insist(before.status === 'uncertain' && after.status === 'uncertain' &&
      before.affinity === null && after.affinity === null &&
      after.tags.coverage === 'partial' && after.tags.leftOnly === null &&
      after.tags.rightOnly === null, 'selected positive facts were promoted into fit');
    insist(before.tags.shared.map(t => t.id).join('|') ===
      after.tags.shared.map(t => t.id).join('|'), 'authored weights changed sourced positives');
    return { left, right, shared_positive_tag_ids: after.tags.shared.map(tag => tag.id),
      equal_mass_observed_overlap: rounded(before.tags.observedOverlap),
      editorial_observed_overlap: rounded(after.tags.observedOverlap),
      difference: rounded(after.tags.observedOverlap - before.tags.observedOverlap),
      status: after.status, rankable_affinity: after.affinity };
  });
  const scenarios = BASKETS.flatMap(basket =>
    ['intersection', 'blend'].map(mode => {
      const result = rankEvidenceBasket(edited, {
        seeds: basket.seeds, mode, limit: 5, platform: 'any', coopOnly: false, excluded: [],
      });
      insist(result.ranked.length === 0, 'partial editorial observations became ranked v2 suggestions');
      return { basket_id: basket.id, mode, ranked: result.ranked.length,
        uncertain: result.uncertain.length, excluded: result.excluded.length };
    }));
  return {
    protocol: EDITORIAL_WEIGHT_PROTOCOL,
    catalog_snapshot_id: FROZEN_CATALOG_ID,
    catalog_git_blob_sha1: FROZEN_CATALOG_BLOB,
    reviewed_facts_blob_sha1: REVIEWED_TWENTY_NINE_TAGS_BLOB,
    edited_profiles: weights.size, selected_positive_tags: weights.size * 4,
    coverage, pair_count: pairs.length, pairs, scenarios,
    interpretation: 'Source-backed positive observations only; weights are subjective, conditional editorial allocations. This is neither complete game-wide tag mass, calibrated affinity, real-player quality evidence nor a v2 release.',
  };
}
