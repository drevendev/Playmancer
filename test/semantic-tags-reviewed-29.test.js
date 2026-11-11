import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareObservations, compareObservations, searchObservations,
  encodeObservationState, decodeObservationState, REVIEWED_OBSERVATIONS_SHA,
  REVIEWED_CATALOG_SHA, OBSERVATION_VERSION } from '../src/observations.js';
const read = name => readFileSync(new URL('../examples/' + name, import.meta.url));
const prior = read('semantic-tags-reviewed-28.v1.json');
const now = read('semantic-tags-reviewed-29.v1.json');
const catalogBytes = read('catalog.multistore-30.real.json');
const old = JSON.parse(prior), current = JSON.parse(now), catalog = JSON.parse(catalogBytes);
const blob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const oldSha = '717eb3689c6eaf82b7f826a9633407e9b259e76e', id = 'dreven:circlanoid', source = 'https://play.google.com/store/apps/details?id=com.drevengames.circlanoid';
test('the 29-profile snapshot is versioned and retains all 28 immutable prior records', () => {
  assert.equal(blob(prior), oldSha);
  assert.equal(blob(now), REVIEWED_OBSERVATIONS_SHA);
  assert.equal(blob(catalogBytes), REVIEWED_CATALOG_SHA);
  assert.equal(current.supersedes, 'semantic-tags-reviewed-28.v1.json');
  assert.equal(current.games.length, 29);
  assert.equal(current.receipts.length, 29);
  assert.equal(current.taxonomy.tags.length, 80);
  assert.equal(current.games.reduce((s,g) => s + g.tags.length, 0), 118);
  for (const key of ['games', 'receipts']) for (const record of old[key])
    assert.deepEqual(current[key].find(item => item.id === record.id), record);
  for (const tag of old.taxonomy.tags)
    assert.deepEqual(current.taxonomy.tags.find(item => item.id === tag.id), tag);
  assert.ok(current.games.every(game => game.tagCoverage === 'partial'));
});
test('Circlanoid facts are distinct, source-attributed, partial, and DevMatch stays unknown', () => {
  assert.equal(catalog.games.find(game => game.id === id)?.name, 'Circlanoid');
  assert.deepEqual(current.receipts.find(r => r.id === id),
    { id, publisher: 'Dreven Games (Google Play listing; secondary corroboration)',
      url: source, reviewedOn: '2026-11-11' });
  const tags = current.games.find(game => game.id === id).tags;
  assert.deepEqual(tags.map(tag => tag.id), [
    'mechanic:orbital-paddles', 'mechanic:target-breaking',
    'structure:campaign-levels', 'structure:endless-mode']);
  assert.ok(tags.every(tag => tag.weight === 0.25 && tag.source === source));
  const model = prepareObservations(catalog, current);
  assert.equal(model.observedGames, 29);
  assert.equal(model.factCount, 118);
  assert.deepEqual(model.games.filter(game => game.coverage === 'unknown').map(game => game.name), ['DevMatch']);
  assert.deepEqual(searchObservations(model, '', 'mechanic:orbital-paddles').map(game => game.name), ['Circlanoid']);
  const pair = compareObservations(model, id, 'dreven:devmatch');
  assert.equal(pair.status, 'unknown');
  assert.equal(pair.affinity, undefined);
  assert.equal(pair.mismatches, undefined);
});
test('old fact links reject current evidence and mismatched-origin sources fail closed', () => {
  const oldModel = prepareObservations(catalog, old, oldSha);
  const currentModel = prepareObservations(catalog, current);
  const state = { version: OBSERVATION_VERSION, catalog: currentModel.catalog,
    evidence: currentModel.evidence, pair: [id, 'dreven:devmatch'],
    query: '', tag: 'mechanic:orbital-paddles' };
  assert.deepEqual(decodeObservationState(currentModel, encodeObservationState(currentModel, state)), state);
  const priorState = { ...state, evidence: oldSha,
    pair: ['dreven:shadow-runner', 'wikidata:q28451532'], tag: 'mechanic:platforming' };
  assert.throws(() => decodeObservationState(currentModel, encodeObservationState(oldModel, priorState)), /Incompatible/);
  const tampered = structuredClone(current);
  tampered.games.find(game => game.id === id).tags[0].source = 'https://example.invalid/borrowed';
  assert.throws(() => prepareObservations(catalog, tampered), /source does not match/);
});
