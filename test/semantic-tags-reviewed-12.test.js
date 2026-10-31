import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareTagTaxonomy, projectWeightedTagProfiles } from '../src/tag-taxonomy.js';
import { prepareEvidenceModel, compareEvidenceGames, rankEvidenceBasket } from '../src/evidence-similarity.js';

const read = name => JSON.parse(readFileSync(new URL('../examples/' + name, import.meta.url), 'utf8'));
const previous = read('semantic-tags-reviewed-8.v1.json');
const reviewed = read('semantic-tags-reviewed-12.v1.json');
const catalogRaw = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url));
const catalog = JSON.parse(catalogRaw.toString('utf8'));
const blobSha = data => createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex');
const newIds = [
  'wikidata:q16972008', // Factorio
  'wikidata:q19581568', // RimWorld
  'wikidata:q19631660', // Outer Wilds
  'wikidata:q4308783', // FTL
];
function model() {
  const taxonomy = prepareTagTaxonomy(reviewed.taxonomy);
  const observed = new Map(reviewed.games.map(g => [g.id, g]));
  const projected = projectWeightedTagProfiles(taxonomy,
    catalog.games.map(g => observed.get(g.id) ?? { id: g.id, tags: null }));
  return { projected, result: prepareEvidenceModel({ games: projected.games }) };
}
test('twelve-game snapshot is pinned, additive and leaves all eight previous profiles unchanged', () => {
  assert.equal(reviewed.schemaVersion, 1);
  assert.equal(reviewed.catalogSnapshotId, catalog.snapshotId);
  assert.equal(reviewed.catalogGitBlobSha1, blobSha(catalogRaw));
  assert.equal(reviewed.supersedes, 'semantic-tags-reviewed-8.v1.json');
  assert.equal(reviewed.games.length, 12);
  assert.equal(reviewed.receipts.length, 12);
  assert.equal(reviewed.taxonomy.tags.length, 33);
  assert.equal(new Set(reviewed.games.map(g => g.id)).size, 12);
  assert.deepEqual(reviewed.games.filter(g => previous.games.some(p => p.id === g.id)), previous.games);
  for (const receipt of previous.receipts) {
    assert.deepEqual(reviewed.receipts.find(r => r.id === receipt.id), receipt);
  }
  for (const tag of previous.taxonomy.tags) {
    assert.deepEqual(reviewed.taxonomy.tags.find(t => t.id === tag.id), tag);
  }
  assert.ok(reviewed.games.every(g => catalog.games.some(c => c.id === g.id && c.kind === 'game')));
});
test('new observations are individually source-backed, equal-mass and explicitly incomplete', () => {
  assert.match(reviewed.rightsScope, /no publisher text/);
  assert.match(reviewed.weightSemantics, /NOT source-importance/);
  const known = new Set(previous.games.map(g => g.id));
  const receipts = new Map(reviewed.receipts.map(r => [r.id, r]));
  assert.equal(receipts.size, 12);
  for (const id of newIds) {
    assert.ok(!known.has(id));
    const game = reviewed.games.find(g => g.id === id);
    const receipt = receipts.get(id);
    assert.equal(game.tagCoverage, 'partial');
    assert.equal(game.tags.length, 4);
    assert.equal(game.tags.reduce((sum, tag) => sum + tag.weight, 0), 1);
    assert.equal(receipt.reviewedOn, reviewed.reviewedOn);
    for (const tag of game.tags) {
      assert.ok(!tag.id.startsWith('genre:'));
      assert.equal(tag.weight, 0.25);
      assert.ok(reviewed.taxonomy.tags.some(t => t.id === tag.id));
      assert.equal(new URL(tag.source).hostname, new URL(receipt.url).hostname);
      assert.equal(tag.source, receipt.url);
    }
  }
});
test('projection is stable, with twelve partial and eighteen unknown profiles', () => {
  const { projected } = model();
  assert.equal(projected.games.length, 30);
  assert.equal(projected.games.filter(g => g.tags === null).length, 18);
  assert.equal(projected.games.filter(g => g.tagCoverage === 'partial').length, 12);
  assert.equal(projected.games.filter(g => g.tagCoverage === 'complete').length, 0);
  const taxonomy = prepareTagTaxonomy(reviewed.taxonomy);
  const shuffled = [...reviewed.games].reverse().map(g => ({ ...g, tags: [...g.tags].reverse() }));
  assert.deepEqual(projectWeightedTagProfiles(taxonomy, shuffled).games,
    projectWeightedTagProfiles(taxonomy, reviewed.games).games);
});
test('selected facts connect games but never become fabricated affinity or negative mismatch', () => {
  const { result } = model();
  const checks = [
    ['wikidata:q16972008', 'wikidata:q332697', 0.25, ['mechanic:building']],
    ['wikidata:q19581568', 'wikidata:q332697', 0.5, ['mechanic:building', 'mechanic:combat']],
    ['wikidata:q19631660', 'wikidata:q29300592', 0.25, ['activity:exploration']],
    ['wikidata:q19631660', 'wikidata:q4308783', 0.25, ['activity:space-travel']],
    ['wikidata:q4308783', 'wikidata:q59756366', 0.25, ['structure:repeatable-runs']],
  ];
  for (const [a, b, overlap, shared] of checks) {
    for (const [left, right] of [[a, b], [b, a]]) {
      const row = compareEvidenceGames(result, left, right);
      assert.equal(row.tags.coverage, 'partial');
      assert.equal(row.tags.observedOverlap, overlap);
      assert.equal(row.tags.similarity, null);
      assert.equal(row.affinity, null);
      assert.equal(row.status, 'uncertain');
      assert.equal(row.reason, 'partial-weighted-tags');
      assert.equal(row.tags.leftOnly, null);
      assert.equal(row.tags.rightOnly, null);
      assert.deepEqual(row.tags.shared.map(t => t.id), shared);
    }
  }
  const noObservedOverlap = compareEvidenceGames(result, 'wikidata:q16972008', 'wikidata:q59756366');
  assert.equal(noObservedOverlap.tags.observedOverlap, 0);
  assert.equal(noObservedOverlap.tags.similarity, null);
  assert.equal(noObservedOverlap.tags.rightOnly, null);
});
test('new tags cannot bypass unknown required platform/co-op constraints or produce fake rankings', () => {
  const { result } = model();
  const basket = rankEvidenceBasket(result, { seeds: [{ id: 'wikidata:q16972008', weight: 1 }],
    platform: 'windows', coopOnly: true, limit: 10 });
  assert.equal(basket.ranked.length, 0);
  assert.ok(basket.uncertain.length + basket.excluded.length > 0);
  assert.ok(basket.uncertain.some(g => g.reason === 'hard-constraint-unknown'));
});
