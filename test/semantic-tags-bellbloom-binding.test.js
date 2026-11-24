import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareObservations, compareObservations, searchObservations, encodeObservationState,
  decodeObservationState, OBSERVATION_VERSION, CANDIDATE_CATALOG_ID, CANDIDATE_CATALOG_SHA,
  CANDIDATE_OBSERVATIONS_SHA, REVIEWED_OBSERVATIONS_SHA } from '../src/observations.js';
const read = name => readFileSync(new URL('../examples/' + name, import.meta.url));
const blob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const priorBytes = read('semantic-tags-reviewed-29.v1.json');
const candidateBytes = read('semantic-tags-reviewed-30.catalog31.v1.json');
const catalogBytes = read('catalog.multistore-31.real.json');
const prior = JSON.parse(priorBytes), candidate = JSON.parse(candidateBytes);
const catalog = JSON.parse(catalogBytes), oldCatalog = JSON.parse(read('catalog.multistore-30.real.json'));
const id = 'dreven:bellbloom';
test('candidate binds exact blobs and preserves earlier profiles, receipts and taxonomy', () => {
  assert.equal(blob(priorBytes), REVIEWED_OBSERVATIONS_SHA);
  assert.equal(blob(candidateBytes), CANDIDATE_OBSERVATIONS_SHA);
  assert.equal(blob(catalogBytes), CANDIDATE_CATALOG_SHA);
  assert.equal(candidate.catalogSnapshotId, CANDIDATE_CATALOG_ID);
  assert.equal(candidate.catalogGitBlobSha1, CANDIDATE_CATALOG_SHA);
  assert.equal(candidate.supersedes, 'semantic-tags-reviewed-29.v1.json');
  for (const key of ['games', 'receipts']) assert.deepEqual(candidate[key].slice(0, prior[key].length), prior[key]);
  assert.deepEqual(candidate.taxonomy.tags.slice(0, prior.taxonomy.tags.length), prior.taxonomy.tags);
  assert.equal(candidate.taxonomy.tags.length, 84);
  assert.ok(candidate.games.every(game => game.tagCoverage === 'partial'));
});
test('Bellbloom is discoverable as four partial facts, not a complete weight vector', () => {
  const old = prepareObservations(oldCatalog, prior);
  const model = prepareObservations(catalog, candidate, CANDIDATE_OBSERVATIONS_SHA);
  assert.equal(model.games.length, 31);
  assert.equal(model.observedGames, 30);
  assert.equal(model.factCount, 122);
  for (const game of old.games) assert.deepEqual(model.games.find(item => item.id === game.id), game);
  assert.deepEqual(model.games.filter(game => game.coverage === 'unknown').map(game => game.id), ['dreven:devmatch']);
  assert.deepEqual(searchObservations(model, '', 'mechanic:layered-soundtrack').map(game => game.id), [id]);
  assert.equal(compareObservations(model, id, 'dreven:devmatch').status, 'unknown');
  assert.equal(compareObservations(model, id, 'dreven:idle-fantasy-shop').affinity, undefined);
});
test('candidate requires the explicit evidence version; crossed catalogs and old links fail closed', () => {
  const old = prepareObservations(oldCatalog, prior);
  const model = prepareObservations(catalog, candidate, CANDIDATE_OBSERVATIONS_SHA);
  const state = { version: OBSERVATION_VERSION, catalog: model.catalog, evidence: model.evidence,
    pair: [id, 'dreven:devmatch'], query: '', tag: 'mechanic:layered-soundtrack' };
  assert.deepEqual(decodeObservationState(model, encodeObservationState(model, state)), state);
  assert.throws(() => decodeObservationState(old, encodeObservationState(model, state)), /Incompatible/);
  assert.throws(() => prepareObservations(catalog, candidate), /revision mismatch/);
  assert.throws(() => prepareObservations(catalog, prior, CANDIDATE_OBSERVATIONS_SHA), /revision mismatch/);
  assert.throws(() => prepareObservations(oldCatalog, candidate, CANDIDATE_OBSERVATIONS_SHA), /revision mismatch/);
  assert.throws(() => prepareObservations(oldCatalog, prior, CANDIDATE_OBSERVATIONS_SHA), /revision mismatch/);
  assert.throws(() => prepareObservations(catalog, { ...candidate, catalogGitBlobSha1: '0'.repeat(40) }, CANDIDATE_OBSERVATIONS_SHA), /revision mismatch/);
});
