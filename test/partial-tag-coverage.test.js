import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTagTaxonomy, projectWeightedTagProfiles } from '../src/tag-taxonomy.js';
import { prepareEvidenceModel, compareEvidenceGames, rankEvidenceBasket } from '../src/evidence-similarity.js';

const source = 'authored-fixture';
const tag = (id, weight = 1) => ({ id, weight, source });
const vocabulary = prepareTagTaxonomy({ version: 'tag-taxonomy-1', tags: [
  { id: 'mechanic:farming', label: 'Farming', aliases: [] },
  { id: 'mechanic:fishing', label: 'Fishing', aliases: [] },
  { id: 'structure:repeatable-runs', label: 'Repeatable runs', aliases: [] },
] });
const fixtures = () => [
  { id: 'demo:complete', tags: [tag('mechanic:farming')] },
  { id: 'demo:partial-shared', tagCoverage: 'partial', tags: [
    tag('mechanic:farming', 0.5), tag('mechanic:fishing', 0.5),
  ] },
  { id: 'demo:partial-disjoint', tagCoverage: 'partial',
    tags: [tag('structure:repeatable-runs')] },
  { id: 'demo:unknown', tags: null },
];
function model(games = fixtures(), relations = []) {
  const projection = projectWeightedTagProfiles(vocabulary, games);
  return prepareEvidenceModel({ games: projection.games, relations });
}

test('partial evidence preserves observed positive overlap but never promotes it to complete fit', () => {
  const pair = compareEvidenceGames(model(), 'demo:complete', 'demo:partial-shared');
  assert.equal(pair.status, 'uncertain');
  assert.equal(pair.reason, 'partial-weighted-tags');
  assert.equal(pair.affinity, null);
  assert.equal(pair.tags.coverage, 'partial');
  assert.equal(pair.tags.similarity, null);
  assert.equal(pair.tags.observedOverlap, 0.5);
  assert.deepEqual(pair.tags.shared.map(x => x.id), ['mechanic:farming']);
  assert.equal(pair.tags.leftOnly, null);
  assert.equal(pair.tags.rightOnly, null);
  assert.equal(pair.evidenceCoverage, 0);
  const reverse = compareEvidenceGames(model(), 'demo:partial-shared', 'demo:complete');
  assert.equal(reverse.tags.observedOverlap, pair.tags.observedOverlap);
  assert.equal(reverse.affinity, null);
});

test('zero shared selected facts and wholly unknown profiles both abstain, for different reasons', () => {
  const m = model();
  const disjoint = compareEvidenceGames(m, 'demo:complete', 'demo:partial-disjoint');
  assert.equal(disjoint.status, 'uncertain');
  assert.equal(disjoint.tags.coverage, 'partial');
  assert.equal(disjoint.tags.observedOverlap, 0);
  assert.equal(disjoint.tags.leftOnly, null);
  assert.equal(disjoint.tags.rightOnly, null);
  const missing = compareEvidenceGames(m, 'demo:complete', 'demo:unknown');
  assert.equal(missing.reason, 'missing-weighted-tags');
  assert.equal(missing.tags.coverage, 'unknown');
  assert.equal(missing.tags.observedOverlap, null);
  const ranked = rankEvidenceBasket(m, {
    seeds: [{ id: 'demo:complete', weight: 1 }], limit: 10,
  });
  assert.deepEqual(ranked.ranked.map(x => x.id), []);
  assert.deepEqual(ranked.uncertain.map(x => x.id),
    ['demo:partial-disjoint', 'demo:partial-shared', 'demo:unknown']);
});

test('complete-to-complete comparison keeps strict weighted gaps and rankable zeros', () => {
  const complete = fixtures().map(game => game.id === 'demo:partial-disjoint'
    ? { ...game, tagCoverage: 'complete' } : game);
  const pair = compareEvidenceGames(model(complete), 'demo:complete', 'demo:partial-disjoint');
  assert.equal(pair.status, 'rankable');
  assert.equal(pair.tags.coverage, 'complete');
  assert.equal(pair.tags.observedOverlap, 0);
  assert.equal(pair.tags.similarity, 0);
  assert.equal(pair.tags.leftOnly[0].id, 'mechanic:farming');
  assert.equal(pair.tags.rightOnly[0].id, 'structure:repeatable-runs');
});

test('graph edges and matching metadata cannot override partial-tag abstention', () => {
  const games = fixtures().map(game => ({ ...game, metadata: {
    creator: { value: 'Same', source },
  } }));
  const m = model(games, [{ from: 'demo:complete', to: 'demo:partial-shared',
    type: 'similar', strength: 1, source }]);
  const pair = compareEvidenceGames(m, 'demo:complete', 'demo:partial-shared');
  assert.equal(pair.status, 'uncertain');
  assert.equal(pair.affinity, null);
  assert.ok(pair.metadata.similarity > 0);
  assert.ok(pair.relations.direct);
});

test('tag coverage markers are explicit, validated, and never invented for missing data', () => {
  const raw = fixtures();
  const projected = projectWeightedTagProfiles(vocabulary, raw).games;
  assert.equal(projected.find(x => x.id === 'demo:partial-shared').tagCoverage, 'partial');
  assert.equal(projected.find(x => x.id === 'demo:unknown').tagCoverage, undefined);
  for (const bad of [null, 'unknown', 'verified', true]) {
    const changed = fixtures();
    changed[1].tagCoverage = bad;
    assert.throws(() => model(changed), /tagCoverage/);
  }
  const noTags = fixtures();
  noTags[3].tagCoverage = 'partial';
  assert.throws(() => model(noTags), /tagCoverage/);
  assert.throws(() => prepareEvidenceModel({ games: [
    { id: 'demo:bad', tags: [tag('mechanic:farming')], tagCoverage: 'invented' },
  ] }), /tagCoverage/);
});
