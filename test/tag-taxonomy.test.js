import test from 'node:test';
import assert from 'node:assert/strict';
import { TAG_TAXONOMY_VERSION, prepareTagTaxonomy, projectWeightedTagProfiles } from '../src/tag-taxonomy.js';

const source = 'authored-fictional-fixture';
const vocabulary = () => ({ version: TAG_TAXONOMY_VERSION, tags: [
  { id: 'genre:rpg', label: 'Role-playing', aliases: ['genre:role-playing'] },
  { id: 'mechanic:dialogue-choices', label: 'Dialogue choices', aliases: ['mechanic:branching-dialogue'] },
  { id: 'mood:cozy', label: 'Cozy', aliases: ['mood:comforting'] },
  { id: 'visual:pixel-art', label: 'Pixel art', aliases: [] },
] });
const samples = () => [
  { id: 'demo:a', tags: [
    { id: 'mechanic:branching-dialogue', weight: .4, source },
    { id: 'genre:rpg', weight: .3, source },
    { id: 'mood:cozy', weight: .3, source },
  ], metadata: {}, coop: null },
  { id: 'demo:b', tags: [
    { id: 'genre:role-playing', weight: .5, source },
    { id: 'visual:pixel-art', weight: .5, source },
  ] },
  { id: 'demo:unknown', tags: null, metadata: {} },
];

test('compiles explicit multi-namespace tag masses and source receipts without inventing missing lanes', () => {
  const result = projectWeightedTagProfiles(prepareTagTaxonomy(vocabulary()), samples());
  assert.equal(result.taxonomyVersion, TAG_TAXONOMY_VERSION);
  assert.deepEqual(result.games.map(game => game.id), ['demo:a', 'demo:b', 'demo:unknown']);
  assert.deepEqual(result.games[0].tags.map(tag => [tag.id, tag.weight]), [
    ['genre:rpg', .3], ['mechanic:dialogue-choices', .4], ['mood:cozy', .3],
  ]);
  assert.ok(result.games[0].tags.every(tag => tag.source === source));
  assert.equal(result.games[2].tags, null);
  assert.ok(!Object.hasOwn(result.games[1], 'metadata'));
});

test('explicit aliases do not create extra evidence or change the game tag total', () => {
  const taxonomy = prepareTagTaxonomy(vocabulary());
  const first = projectWeightedTagProfiles(taxonomy, samples());
  const reordered = samples().reverse();
  reordered.forEach(game => { if (game.tags) game.tags.reverse(); });
  assert.deepEqual(projectWeightedTagProfiles(taxonomy, reordered), first);
  const duplicate = samples();
  duplicate[0].tags[0] = { id: 'mechanic:dialogue-choices', weight: .2, source };
  duplicate[0].tags.push({ id: 'mechanic:branching-dialogue', weight: .2, source });
  assert.throws(() => projectWeightedTagProfiles(taxonomy, duplicate), /alias\/canonical collision/);
});

test('rejects cross-namespace, duplicate and unknown aliases instead of guessing semantics', () => {
  const crossed = vocabulary();
  crossed.tags[0].aliases.push('mood:role-playing');
  assert.throws(() => prepareTagTaxonomy(crossed), /cross-namespace/);
  const collided = vocabulary();
  collided.tags[0].aliases.push('mechanic:dialogue-choices');
  assert.throws(() => prepareTagTaxonomy(collided), /cross-namespace/);
  const duplicate = vocabulary();
  duplicate.tags[0].aliases.push('genre:role-playing');
  assert.throws(() => prepareTagTaxonomy(duplicate), /duplicate canonical ID or alias/);
  const changed = samples();
  changed[0].tags[0].id = 'mechanic:unverified-feature';
  assert.throws(() => projectWeightedTagProfiles(prepareTagTaxonomy(vocabulary()), changed), /unknown taxonomy tag/);
  const inventedNamespace = vocabulary();
  inventedNamespace.tags.push({ id: 'popularity:most-played', label: 'Popular' });
  assert.throws(() => prepareTagTaxonomy(inventedNamespace), /supported canonical namespace/);
});

test('rejects unweighted, overspecified, unsourced or implicitly missing tags', () => {
  const taxonomy = prepareTagTaxonomy(vocabulary());
  const changedMass = samples();
  changedMass[0].tags[0].weight = .2;
  assert.throws(() => projectWeightedTagProfiles(taxonomy, changedMass), /must sum to 1/);
  for (const weight of [0, -1, 1.1, NaN, Infinity, '0.4']) {
    const input = samples(); input[0].tags[0].weight = weight;
    assert.throws(() => projectWeightedTagProfiles(taxonomy, input), /weight must be finite/);
  }
  const unsourced = samples(); unsourced[0].tags[0].source = '';
  assert.throws(() => projectWeightedTagProfiles(taxonomy, unsourced), /source/);
  const absent = samples(); delete absent[0].tags;
  assert.throws(() => projectWeightedTagProfiles(taxonomy, absent), /missing observed\/unknown tags marker/);
  const empty = samples(); empty[0].tags = [];
  assert.throws(() => projectWeightedTagProfiles(taxonomy, empty), /1-128 entries or be null/);
  const extra = samples(); extra[0].tags[0].confidence = .95;
  assert.throws(() => projectWeightedTagProfiles(taxonomy, extra), /unknown .* fields/);
});

test('rejects version drift and duplicate games without mutating source objects', () => {
  assert.throws(() => prepareTagTaxonomy({ ...vocabulary(), version: 'tag-taxonomy-2' }), /unsupported/);
  const taxonomy = prepareTagTaxonomy(vocabulary());
  const duplicated = samples(); duplicated.push({ ...duplicated[0] });
  assert.throws(() => projectWeightedTagProfiles(taxonomy, duplicated), /duplicate game/);
  const original = samples();
  const frozen = structuredClone(original);
  projectWeightedTagProfiles(taxonomy, original);
  assert.deepEqual(original, frozen);
  assert.throws(() => projectWeightedTagProfiles({ ...taxonomy }, original), /prepare a validated taxonomy first/);
});
