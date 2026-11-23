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
  { id: 'demo:a', tagCoverage: 'complete', tags: [
    { id: 'mechanic:branching-dialogue', weight: .4, source },
    { id: 'genre:rpg', weight: .3, source },
    { id: 'mood:cozy', weight: .3, source },
  ], metadata: {}, coop: null },
  { id: 'demo:b', tagCoverage: 'complete', tags: [
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

test('observed tag profiles must explicitly declare completeness before scoring', () => {
  const taxonomy = prepareTagTaxonomy(vocabulary());
  const omitted = samples();
  delete omitted[0].tagCoverage;
  assert.throws(() => projectWeightedTagProfiles(taxonomy, omitted), /tagCoverage must explicitly/);
  const partial = samples();
  partial[0].tagCoverage = 'partial';
  const projected = projectWeightedTagProfiles(taxonomy, partial);
  assert.equal(projected.games.find(game => game.id === 'demo:a').tagCoverage, 'partial');
  assert.equal(projected.games.find(game => game.id === 'demo:b').tagCoverage, 'complete');
  assert.ok(!Object.hasOwn(projected.games.find(game => game.id === 'demo:unknown'), 'tagCoverage'));
});

test('taxonomy normalization orders punctuation-bearing canonical IDs without locale collation', () => {
  // ICU can order underscores before hyphens, unlike the locale-free ID
  // comparator used by the ranking and sharing contract.
  const ids = ['genre:craft_smith', 'genre:craft-smith', 'genre:craft.smith'];
  const expected = ['genre:craft-smith', 'genre:craft.smith', 'genre:craft_smith'];
  const weights = new Map([
    ['genre:craft_smith', .2],
    ['genre:craft-smith', .3],
    ['genre:craft.smith', .5],
  ]);
  for (const order of [ids, [...ids].reverse()]) {
    const taxonomy = prepareTagTaxonomy({ version: TAG_TAXONOMY_VERSION,
      tags: order.map(id => ({ id, label: id, aliases: [] })) });
    assert.deepEqual(taxonomy.tags.map(entry => entry.id), expected);
    const games = [{ id: 'demo:z', tagCoverage: 'complete',
      tags: order.map(id => ({ id, weight: weights.get(id), source })) },
      { id: 'demo:a', tags: null }];
    const projected = projectWeightedTagProfiles(taxonomy, games);
    assert.deepEqual(projected.games.map(game => game.id), ['demo:a', 'demo:z']);
    assert.deepEqual(projected.games[1].tags.map(entry => entry.id), expected);
    assert.deepEqual(projected.games[1].tags.map(entry => entry.weight),
      expected.map(id => weights.get(id)));
  }
});

test('taxonomy rejects sparse and accessor-backed arrays before complete-vector projection', () => {
  const sparseTaxonomy = vocabulary();
  delete sparseTaxonomy.tags[1];
  assert.throws(() => prepareTagTaxonomy(sparseTaxonomy), /dense own data elements/);
  const sparseAliases = vocabulary();
  sparseAliases.tags[0].aliases.length = 2;
  assert.throws(() => prepareTagTaxonomy(sparseAliases), /dense own data elements/);
  const taxonomy = prepareTagTaxonomy(vocabulary());
  const sparseGames = samples();
  delete sparseGames[1];
  assert.throws(() => projectWeightedTagProfiles(taxonomy, sparseGames), /dense own data elements/);
  const sparseTags = samples();
  sparseTags[0].tags = [{ id: 'genre:rpg', weight: 1, source }, ,];
  assert.throws(() => projectWeightedTagProfiles(taxonomy, sparseTags), /dense own data elements/);
  const accessorIndex = vocabulary();
  let read = false;
  Object.defineProperty(accessorIndex.tags, 0, { get() { read = true; return {}; } });
  assert.throws(() => prepareTagTaxonomy(accessorIndex), /dense own data elements/);
  assert.equal(read, false);
});

test('taxonomy rejects hidden and accessor-backed record fields without invoking getters', () => {
  const hidden = vocabulary();
  Object.defineProperty(hidden.tags[0], 'unknownReceipt', { value: true });
  assert.throws(() => prepareTagTaxonomy(hidden), /unknown taxonomy tag fields/);
  const symbol = vocabulary();
  symbol.tags[0][Symbol('source')] = 'fictional';
  assert.throws(() => prepareTagTaxonomy(symbol), /unknown taxonomy tag fields/);
  const accessor = vocabulary();
  let read = false;
  Object.defineProperty(accessor.tags[0], 'label', { get() { read = true; return 'invented'; } });
  assert.throws(() => prepareTagTaxonomy(accessor), /own data property/);
  assert.equal(read, false);
  const taxonomy = prepareTagTaxonomy(vocabulary());
  const weighted = samples();
  Object.defineProperty(weighted[0].tags[0], 'weight', { get() { read = true; return .4; } });
  assert.throws(() => projectWeightedTagProfiles(taxonomy, weighted), /own data property/);
  assert.equal(read, false);
});

test('taxonomy ignores redirected iterators and reads Proxy length just once', () => {
  const baseline = prepareTagTaxonomy(vocabulary());
  const redirected = vocabulary();
  redirected.tags[Symbol.iterator] = function* () { throw Error('iterator called'); };
  assert.deepEqual(prepareTagTaxonomy(redirected).tags, baseline.tags);
  const taxonomy = prepareTagTaxonomy(vocabulary());
  const gameList = samples();
  gameList[0].tags[Symbol.iterator] = function* () { throw Error('tag iterator called'); };
  assert.deepEqual(projectWeightedTagProfiles(taxonomy, gameList).games,
    projectWeightedTagProfiles(taxonomy, samples()).games);
  const proxy = vocabulary();
  let lengthReads = 0;
  proxy.tags = new Proxy(proxy.tags, {
    get(target, key, receiver) {
      if (key === 'length') lengthReads++;
      if (key === Symbol.iterator) throw Error('Proxy iterator called');
      return Reflect.get(target, key, receiver);
    },
  });
  assert.deepEqual(prepareTagTaxonomy(proxy).tags, baseline.tags);
  assert.equal(lengthReads, 1);
});
