import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareTagTaxonomy, projectWeightedTagProfiles } from '../src/tag-taxonomy.js';
import { prepareEvidenceModel, compareEvidenceGames, rankEvidenceBasket } from '../src/evidence-similarity.js';

const read = name => JSON.parse(readFileSync(new URL('../examples/' + name, import.meta.url), 'utf8'));
const previous = read('semantic-tags-reviewed-4.v1.json');
const pilot = read('semantic-tags-reviewed-8.v1.json');
const rawCatalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url));
const catalog = JSON.parse(rawCatalog.toString('utf8'));
const blobSha = data => createHash('sha1').update('blob ' + data.length + '\0').update(data).digest('hex');
const terraria = 'wikidata:q332697';
const hollow = 'wikidata:q29300592';
const celeste = 'wikidata:q28451532';
const deadCells = 'wikidata:q30639210';
const hades = 'wikidata:q59756366';
function evidence() {
  const taxonomy = prepareTagTaxonomy(pilot.taxonomy);
  const observed = new Map(pilot.games.map(game => [game.id, game]));
  const profiles = projectWeightedTagProfiles(taxonomy,
    catalog.games.map(game => observed.get(game.id) ?? { id: game.id, tags: null }));
  return { profiles, model: prepareEvidenceModel({ games: profiles.games }) };
}

test('eight-game pilot pins the unchanged 30-game catalog and preserves four prior observations', () => {
  assert.equal(pilot.schemaVersion, 1);
  assert.equal(pilot.supersedes, 'semantic-tags-reviewed-4.v1.json');
  assert.equal(pilot.catalogSnapshotId, catalog.snapshotId);
  assert.equal(pilot.catalogGitBlobSha1, blobSha(rawCatalog));
  assert.equal(catalog.games.length, 30);
  assert.equal(pilot.games.length, 8);
  assert.equal(new Set(pilot.games.map(game => game.id)).size, 8);
  assert.deepEqual(pilot.games.filter(game => previous.games.some(old => old.id === game.id)),
    [...previous.games].sort((a, b) => a.id.localeCompare(b.id, 'en')));
  for (const previousReceipt of previous.receipts) {
    assert.deepEqual(pilot.receipts.find(item => item.id === previousReceipt.id), previousReceipt);
  }
  assert.ok(pilot.games.every(game => catalog.games.some(item => item.id === game.id && item.kind === 'game')));
});

test('new source-backed tags are factual, sourced, canonical and partial, not reused publisher prose', () => {
  assert.match(pilot.rightsScope, /no publisher text/);
  assert.match(pilot.weightSemantics, /NOT source-importance/);
  assert.equal(pilot.taxonomy.version, 'tag-taxonomy-1');
  assert.equal(pilot.taxonomy.tags.length, 23);
  const reviewed = new Set([terraria, hollow, celeste, deadCells]);
  const receiptById = new Map(pilot.receipts.map(receipt => [receipt.id, receipt]));
  assert.equal(receiptById.size, 8);
  for (const game of pilot.games) {
    assert.equal(game.tagCoverage, 'partial');
    assert.equal(game.tags.length, 4);
    assert.equal(game.tags.reduce((sum, tag) => sum + tag.weight, 0), 1);
    const receipt = receiptById.get(game.id);
    assert.equal(receipt.reviewedOn, pilot.reviewedOn);
    for (const tag of game.tags) {
      assert.ok(!tag.id.startsWith('genre:'));
      assert.ok(tag.source.startsWith('https://'));
      if (reviewed.has(game.id)) {
        const primary = new URL(tag.source);
        const publisher = new URL(receipt.url);
        assert.equal(primary.hostname, publisher.hostname);
        assert.ok([publisher.pathname, '/changelog.html'].includes(primary.pathname));
      }
    }
  }
});

test('exact projection stays deterministic and leaves 22 unreviewed games unknown', () => {
  const { profiles } = evidence();
  assert.equal(profiles.games.length, 30);
  assert.equal(profiles.games.filter(game => game.tags !== null).length, 8);
  assert.equal(profiles.games.filter(game => game.tags === null).length, 22);
  assert.ok(profiles.games.filter(game => game.tags).every(game => game.tagCoverage === 'partial'));
  const taxonomy = prepareTagTaxonomy(pilot.taxonomy);
  const reversed = [...pilot.games].reverse().map(game => ({ ...game, tags: [...game.tags].reverse() }));
  assert.deepEqual(projectWeightedTagProfiles(taxonomy, reversed).games,
    projectWeightedTagProfiles(taxonomy, pilot.games).games);
});

test('new cross-game overlaps are selected-fact diagnostics, never calibrated affinity', () => {
  const { model } = evidence();
  const pairs = [
    [terraria, hollow, 0.25, ['activity:exploration']],
    [hollow, deadCells, 0.5, ['activity:exploration', 'mechanic:action-combat']],
    [celeste, deadCells, 0.25, ['mechanic:platforming']],
    [deadCells, hades, 0.5, ['mechanic:action-combat', 'structure:repeatable-runs']],
  ];
  for (const [left, right, overlap, shared] of pairs) {
    for (const [a, b] of [[left, right], [right, left]]) {
      const result = compareEvidenceGames(model, a, b);
      assert.equal(result.tags.coverage, 'partial');
      assert.equal(result.tags.observedOverlap, overlap);
      assert.equal(result.tags.similarity, null);
      assert.equal(result.status, 'uncertain');
      assert.equal(result.affinity, null);
      assert.equal(result.reason, 'partial-weighted-tags');
      assert.equal(result.tags.leftOnly, null);
      assert.equal(result.tags.rightOnly, null);
      assert.deepEqual(result.tags.shared.map(tag => tag.id), shared);
    }
  }
  const none = compareEvidenceGames(model, terraria, hades);
  assert.equal(none.tags.observedOverlap, 0);
  assert.equal(none.tags.similarity, null);
  assert.equal(none.tags.leftOnly, null);
  assert.equal(rankEvidenceBasket(model, { seeds: [{ id: terraria, weight: 1 }], limit: 12 }).ranked.length, 0);
});

test('new observations cannot satisfy missing mandatory platform evidence', () => {
  const { model } = evidence();
  const result = rankEvidenceBasket(model, { seeds: [{ id: deadCells, weight: 1 }],
    platform: 'windows', coopOnly: true, limit: 12 });
  assert.equal(result.ranked.length, 0);
  assert.ok(result.uncertain.length > 0 || result.excluded.length > 0);
});
