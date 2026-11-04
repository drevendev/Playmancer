import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareObservations, compareObservations, searchObservations, encodeObservationState,
  decodeObservationState, validateObservationState, OBSERVATION_VERSION } from '../src/observations.js';
const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url), 'utf8'));
const catalog = read('examples/catalog.multistore-30.real.json');
const observations = read('examples/semantic-tags-reviewed-12.v1.json');
const model = prepareObservations(catalog, observations);
const clone = value => structuredClone(value);
const a = 'wikidata:q16972008', b = 'wikidata:q332697';
const state = () => ({ version: OBSERVATION_VERSION, catalog: model.catalog, evidence: model.evidence,
  pair: [a, b], query: 'building', tag: 'mechanic:building' });
test('public projection exposes 48 facts across 12 partial and 18 unreviewed profiles', () => {
  assert.equal(model.games.length, 30); assert.equal(model.observedGames, 12); assert.equal(model.factCount, 48);
  assert.equal(model.games.filter(g => g.coverage === 'unknown').length, 18);
  assert.equal(model.tags.length, 33); assert.ok(Object.isFrozen(model.games));
  for (const game of model.games) for (const fact of game.facts) {
    assert.equal(fact.reviewedOn, '2026-10-31'); assert.ok(fact.source.startsWith('https://'));
    assert.deepEqual(Object.keys(fact).sort(), ['id','label','publisher','reviewedOn','source']);
  }
  assert.deepEqual(catalog, read('examples/catalog.multistore-30.real.json'));
});
test('source URLs are preserved per field, including Celeste changelog', () => {
  const game = model.games.find(g => g.id === 'wikidata:q28451532');
  assert.equal(game.facts.find(f => f.id === 'mechanic:dashing').source, 'https://www.celestegame.com/changelog.html');
  assert.equal(game.facts.find(f => f.id === 'mechanic:platforming').source, 'https://www.celestegame.com/');
});
test('shared facts have two independent receipts; one-sided records are not mismatches', () => {
  const pair = compareObservations(model, a, b);
  assert.deepEqual(pair.shared.map(f => f.id), ['mechanic:building']);
  assert.notEqual(pair.shared[0].left.source, pair.shared[0].right.source);
  assert.equal(pair.status, 'partial'); assert.equal(pair.leftRecorded.length, 3);
  assert.equal(pair.rightRecorded.length, 3);
  for (const name of ['affinity','score','confidence','mismatches']) assert.equal(pair[name], undefined);
  const reverse = compareObservations(model, b, a);
  assert.deepEqual(reverse.leftRecorded, pair.rightRecorded);
});
test('unreviewed and no common observations never imply supported zero similarity', () => {
  const pair = compareObservations(model, a, 'dreven:devmatch');
  assert.equal(pair.status, 'unknown'); assert.deepEqual(pair.shared, []); assert.equal(pair.leftRecorded.length, 4);
  assert.deepEqual(pair.rightRecorded, []);
  const disjoint = compareObservations(model, a, 'wikidata:q59756366');
  assert.equal(disjoint.status, 'partial'); assert.deepEqual(disjoint.shared, []);
  assert.throws(() => compareObservations(model, a, a)); assert.throws(() => compareObservations(model, a, 'missing'));
});
test('search discovers mechanics without modifying ranker constraints or treating missing facts as absent', () => {
  assert.equal(searchObservations(model).length, 30);
  assert.deepEqual(searchObservations(model, '', 'mechanic:building').map(g => g.name), ['Factorio','RimWorld','Terraria']);
  assert.deepEqual(searchObservations(model, 'FARMING').map(g => g.name), ['Spiritfarer','Stardew Valley']);
  assert.deepEqual(searchObservations(model, '<script>'), []);
  assert.equal(searchObservations(model, 'DevMatch')[0].coverage, 'unknown');
  assert.throws(() => searchObservations(model, '', 'mechanic:unreviewed'));
  assert.throws(() => searchObservations(model, 'a'.repeat(121)));
});
test('projection is byte-stable under catalog, taxonomy, receipt and fact reordering', () => {
  const changed = clone(observations);
  changed.taxonomy.tags.reverse(); changed.receipts.reverse(); changed.games.reverse();
  for (const game of changed.games) game.tags.reverse();
  assert.deepEqual(prepareObservations({ ...catalog, games: [...catalog.games].reverse() }, changed), model);
});
test('versioned links preserve order and filters; bad versions/IDs fail visibly through rejection', () => {
  assert.deepEqual(decodeObservationState(model, encodeObservationState(model, state())), state());
  assert.deepEqual(decodeObservationState(model, encodeObservationState(model, { ...state(), pair: [b,a] })).pair, [b,a]);
  for (const bad of [ {version:'future'}, {catalog:'different'}, {evidence:'0'.repeat(40)}, {pair:[a,a]},
    {pair:['missing',b]}, {pair:[a]}, {query:null}, {query:undefined}, {tag:null}, {extra:true} ])
    assert.throws(() => validateObservationState(model, { ...state(), ...bad }));
  for (const hash of ['', '#basket=x', '#facts=%xx', '#facts=null', '#facts='+'a'.repeat(4096)])
    assert.throws(() => decodeObservationState(model, hash));
});
const corruptions = {
  'catalog binding': r => { r.catalogSnapshotId = 'wrong'; },
  'catalog checksum': r => { r.catalogGitBlobSha1 = '0'.repeat(40); },
  'schema version': r => { r.schemaVersion = 2; },
  'taxonomy version': r => { r.taxonomy.version = 'future'; },
  'duplicate vocabulary': r => { r.taxonomy.tags.push(r.taxonomy.tags[0]); },
  'empty label': r => { r.taxonomy.tags[0].label = ''; },
  'duplicate game': r => { r.games.push(r.games[0]); },
  'unknown identity': r => { r.games[0].id = 'missing'; },
  'complete claim': r => { r.games[0].tagCoverage = 'complete'; },
  'no observations': r => { r.games[0].tags = []; },
  'unknown tag': r => { r.games[0].tags[0].id = 'mechanic:invented'; },
  'duplicate tag': r => { r.games[0].tags[1] = clone(r.games[0].tags[0]); },
  'bad weight': r => { r.games[0].tags[0].weight = -1; },
  'wrong mass': r => { r.games[0].tags[0].weight = 0.1; },
  'missing receipt': r => { r.receipts.shift(); },
  'orphan receipt': r => { r.games.shift(); },
  'duplicate receipt': r => { r.receipts.push(r.receipts[0]); },
  'invalid date': r => { r.receipts[0].reviewedOn = '2026-02-31'; },
  'cross-origin source': r => { r.games[0].tags[0].source = 'https://example.org/'; },
  'unsafe scheme': r => { r.games[0].tags[0].source = 'javascript:alert(1)'; },
  'credentials': r => { r.games[0].tags[0].source = 'https://secret@direct.factorio.com/game/content'; },
};
for (const [name, mutate] of Object.entries(corruptions)) test(`reject ${name}`, () => {
  const candidate = clone(observations); mutate(candidate); assert.throws(() => prepareObservations(catalog, candidate));
});
test('reject duplicate or oversized catalog and malformed search state', () => {
  assert.throws(() => prepareObservations({ ...catalog, games: [catalog.games[0],catalog.games[0]] }, observations));
  assert.throws(() => prepareObservations({ ...catalog, games: Array(251).fill(catalog.games[0]) }, observations));
  assert.throws(() => prepareObservations(catalog, observations, 'invalid'));
});
