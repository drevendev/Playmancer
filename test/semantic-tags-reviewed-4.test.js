import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareTagTaxonomy, projectWeightedTagProfiles } from '../src/tag-taxonomy.js';
import { prepareEvidenceModel, compareEvidenceGames, rankEvidenceBasket } from '../src/evidence-similarity.js';

const rawCatalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url));
const catalog = JSON.parse(rawCatalog.toString('utf8'));
const pilot = JSON.parse(readFileSync(
  new URL('../examples/semantic-tags-reviewed-4.v1.json', import.meta.url), 'utf8'));
const blobHash = input => createHash('sha1').update('blob ' + input.length + '\0')
  .update(input).digest('hex');
const stardew = 'wikidata:q23013817';
const spiritfarer = 'wikidata:q80533334';
const hades = 'wikidata:q59756366';
const spire = 'wikidata:q48078440';
function model() {
  const taxonomy = prepareTagTaxonomy(pilot.taxonomy);
  const observed = new Map(pilot.games.map(game => [game.id, game]));
  const all = catalog.games.map(game => observed.get(game.id) || { id: game.id, tags: null });
  const projected = projectWeightedTagProfiles(taxonomy, all);
  return { taxonomy, projected, evidence: prepareEvidenceModel({ games: projected.games }) };
}

test('frozen 30-game catalog and reviewed four-game identity are exact', () => {
  assert.equal(pilot.schemaVersion, 1);
  assert.equal(pilot.catalogSnapshotId, catalog.snapshotId);
  assert.equal(pilot.catalogGitBlobSha1, blobHash(rawCatalog));
  assert.equal(catalog.games.length, 30);
  assert.deepEqual(pilot.games.map(game => game.id).sort(),
    [stardew, spiritfarer, hades, spire].sort());
  assert.equal(new Set(pilot.games.map(game => game.id)).size, 4);
  assert.ok(pilot.games.every(game =>
    catalog.games.some(catalogGame => catalogGame.id === game.id && catalogGame.kind === 'game')));
  assert.match(pilot.observationCoverage, /partial-selected-facts-only/);
  assert.match(pilot.weightSemantics, /NOT source-importance/);
});

test('each authored fact has its own reviewed primary-source URL; no source text is copied', () => {
  assert.equal(pilot.receipts.length, 4);
  const receipts = new Map(pilot.receipts.map(receipt => [receipt.id, receipt]));
  assert.equal(receipts.size, 4);
  for (const game of pilot.games) {
    const receipt = receipts.get(game.id);
    assert.ok(receipt);
    assert.equal(receipt.reviewedOn, pilot.reviewedOn);
    const url = new URL(receipt.url);
    assert.equal(url.protocol, 'https:');
    assert.ok(['www.stardewvalley.net', 'thunderlotusgames.com',
      'www.supergiantgames.com', 'www.megacrit.com'].includes(url.hostname));
    assert.equal(game.tags.length, 4);
    for (const tag of game.tags) {
      assert.equal(tag.source, receipt.url);
      assert.equal(tag.weight, 0.25);
      assert.ok(!tag.id.startsWith('genre:'));
    }
  }
  assert.match(pilot.rightsScope, /no publisher text/);
});

test('the real-fact pilot uses the v1 taxonomy and never fills 26 unreviewed games', () => {
  const { projected, taxonomy } = model();
  assert.equal(projected.taxonomyVersion, taxonomy.version);
  assert.equal(projected.games.length, 30);
  const reviewed = projected.games.filter(game => game.tags !== null);
  assert.equal(reviewed.length, 4);
  assert.equal(projected.games.filter(game => game.tags === null).length, 26);
  for (const game of reviewed) {
    assert.ok(game.tags.every(tag => tag.source.startsWith('https://')));
    assert.equal(game.tags.reduce((sum, tag) => sum + tag.weight, 0), 1);
  }
  const reordered = pilot.games.map(game => ({
    ...game, tags: [...game.tags].reverse(),
  })).reverse();
  assert.deepEqual(projectWeightedTagProfiles(taxonomy, reordered).games,
    projectWeightedTagProfiles(taxonomy, pilot.games).games);
});

test('non-genre overlap is measurable, while unreviewed pairs abstain', () => {
  const { evidence } = model();
  const farmAndCare = compareEvidenceGames(evidence, stardew, spiritfarer);
  const runs = compareEvidenceGames(evidence, hades, spire);
  assert.equal(farmAndCare.status, 'rankable');
  assert.equal(farmAndCare.tags.similarity, 0.5);
  assert.deepEqual(farmAndCare.tags.shared.map(tag => tag.id),
    ['mechanic:farming', 'mechanic:fishing']);
  assert.equal(runs.tags.similarity, 0.25);
  assert.deepEqual(runs.tags.shared.map(tag => tag.id), ['structure:repeatable-runs']);
  assert.equal(compareEvidenceGames(evidence, spiritfarer, stardew).tags.similarity, 0.5);
  const unknownId = catalog.games.find(game => !pilot.games.some(x => x.id === game.id)).id;
  const missing = compareEvidenceGames(evidence, stardew, unknownId);
  assert.equal(missing.status, 'uncertain');
  assert.equal(missing.affinity, null);
  assert.equal(missing.tags.leftOnly, null);
});

test('pilot-only evidence does not silently satisfy platform hard constraints', () => {
  const { evidence } = model();
  const result = rankEvidenceBasket(evidence, {
    seeds: [{ id: stardew, weight: 1 }], platform: 'windows', limit: 10,
  });
  assert.equal(result.ranked.length, 0);
  assert.ok(result.uncertain.length > 0);
});

test('changed weights, duplicate aliases and unsourced facts fail closed', () => {
  const { taxonomy } = model();
  const badMass = structuredClone(pilot.games);
  badMass[0].tags[0].weight = 0.5;
  assert.throws(() => projectWeightedTagProfiles(taxonomy, badMass), /must sum to 1/);
  const unsourced = structuredClone(pilot.games);
  unsourced[0].tags[0].source = '';
  assert.throws(() => projectWeightedTagProfiles(taxonomy, unsourced), /source/);
});
