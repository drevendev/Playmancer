import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  prepareObservations, searchObservations, compareObservations,
  encodeObservationState, decodeObservationState,
  REVIEWED_OBSERVATIONS_SHA, REVIEWED_CATALOG_SHA, OBSERVATION_VERSION,
} from '../src/observations.js';

const bytes = name => readFileSync(new URL('../examples/' + name, import.meta.url));
const previousBytes = bytes('semantic-tags-reviewed-13.v1.json');
const currentBytes = bytes('semantic-tags-reviewed-14.v1.json');
const catalogBytes = bytes('catalog.multistore-30.real.json');
const previous = JSON.parse(previousBytes);
const current = JSON.parse(currentBytes);
const catalog = JSON.parse(catalogBytes);
const sha = value => createHash('sha1').update('blob ' + value.length + '\0').update(value).digest('hex');
const OLD_SHA = '426fa34e432bcb10fc96dd48462f0b6d7dc62c9d';
const NEW_SHA = 'c2b94e8a9770261f07ba586bdb025c4d7afac049';
const ID = 'wikidata:q30591391';
const SOURCE = 'https://subsetgames.com/itb.html';

test('four official, short Into the Breach facts ship as a new immutable version', () => {
  assert.equal(sha(previousBytes), OLD_SHA);
  assert.equal(sha(currentBytes), NEW_SHA);
  assert.equal(sha(catalogBytes), REVIEWED_CATALOG_SHA);
  assert.equal(REVIEWED_OBSERVATIONS_SHA, NEW_SHA);
  assert.equal(current.catalogGitBlobSha1, REVIEWED_CATALOG_SHA);
  assert.equal(current.catalogSnapshotId, previous.catalogSnapshotId);
  assert.equal(current.supersedes, 'semantic-tags-reviewed-13.v1.json');
  assert.equal(current.reviewedOn, '2026-11-05');
  assert.equal(current.games.length, 14);
  assert.equal(current.receipts.length, 14);
  assert.equal(current.taxonomy.tags.length, 40);
  assert.equal(current.games.reduce((n, game) => n + game.tags.length, 0), 58);
  const old = new Map(previous.games.map(row => [row.id, row]));
  for (const row of current.games) if (old.has(row.id)) assert.deepEqual(row, old.get(row.id));
  for (const row of previous.receipts) assert.deepEqual(current.receipts.find(item => item.id === row.id), row);
  for (const row of previous.taxonomy.tags) assert.deepEqual(current.taxonomy.tags.find(item => item.id === row.id), row);
  const matches = catalog.games.filter(game => game.id === ID);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, 'Into the Breach');
  const game = current.games.find(row => row.id === ID);
  assert.equal(game.tagCoverage, 'partial');
  assert.deepEqual(game.tags.map(row => row.id), [
    'activity:city-defense', 'mechanic:telegraphed-attacks',
    'mechanic:turn-based-tactics', 'structure:repeatable-runs',
  ]);
  assert.ok(game.tags.every(row => row.source === SOURCE && row.weight === 0.25));
  assert.deepEqual(current.receipts.find(row => row.id === ID),
    { id: ID, publisher: 'Subset Games', url: SOURCE, reviewedOn: '2026-11-05' });
  assert.equal(current.weightSemantics.includes('NOT game-wide importance'), true);
});

test('player-facing explorer discovers Into the Breach while keeping unseen evidence unknown', () => {
  const model = prepareObservations(catalog, current);
  assert.equal(model.version, OBSERVATION_VERSION);
  assert.equal(model.evidence, NEW_SHA);
  assert.equal(model.factCount, 58);
  assert.equal(model.observedGames, 14);
  assert.equal(model.games.filter(game => game.coverage === 'unknown').length, 16);
  assert.deepEqual(searchObservations(model, 'telegraphed').map(row => row.id), [ID]);
  assert.deepEqual(searchObservations(model, '', 'mechanic:turn-based-tactics').map(row => row.id), [ID]);
  assert.ok(!searchObservations(model, 'Into the Breach')[0].facts.some(row => Object.hasOwn(row, 'weight')));
  const pair = compareObservations(model, ID, 'wikidata:q4308783');
  assert.equal(pair.status, 'partial');
  assert.deepEqual(pair.shared.map(row => row.id), ['structure:repeatable-runs']);
  assert.equal(pair.shared[0].left.source, SOURCE);
  assert.notEqual(pair.shared[0].right.source, SOURCE);
  const uncertain = compareObservations(model, ID, 'dreven:devmatch');
  assert.equal(uncertain.status, 'unknown');
  assert.deepEqual(uncertain.rightRecorded, []);
});

test('link compatibility remains fingerprinted; source, identity and coverage fail closed', () => {
  const model = prepareObservations(catalog, current);
  const oldModel = prepareObservations(catalog, previous, OLD_SHA);
  const state = { version: OBSERVATION_VERSION, catalog: model.catalog, evidence: model.evidence,
    pair: [ID, 'wikidata:q4308783'], query: 'turn-based', tag: '' };
  assert.deepEqual(decodeObservationState(model, encodeObservationState(model, state)), state);
  const oldLink = encodeObservationState(oldModel, { ...state, evidence: OLD_SHA });
  assert.throws(() => decodeObservationState(model, oldLink), /Incompatible/);
  const clone = () => structuredClone(current);
  let bad = clone();
  bad.games.find(row => row.id === ID).tags[0].source = 'https://example.com/unsupported';
  assert.throws(() => prepareObservations(catalog, bad), /source does not match/);
  bad = clone();
  bad.games.find(row => row.id === ID).tagCoverage = 'complete';
  assert.throws(() => prepareObservations(catalog, bad), /distinct, receipted partial/);
  bad = clone();
  bad.games.find(row => row.id === ID).tags[0].id = 'mechanic:invented';
  assert.throws(() => prepareObservations(catalog, bad), /Invalid or duplicate per-game/);
  bad = clone();
  bad.games.push(structuredClone(bad.games.find(row => row.id === ID)));
  assert.throws(() => prepareObservations(catalog, bad), /Only distinct/);
});
