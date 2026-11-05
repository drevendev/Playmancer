import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareObservations, searchObservations, compareObservations,
  encodeObservationState, decodeObservationState, REVIEWED_OBSERVATIONS_SHA,
  REVIEWED_CATALOG_SHA, OBSERVATION_VERSION } from '../src/observations.js';

const bytes = name => readFileSync(new URL('../examples/' + name, import.meta.url));
const previousBytes = bytes('semantic-tags-reviewed-14.v1.json');
const currentBytes = bytes('semantic-tags-reviewed-16.v1.json');
const catalogBytes = bytes('catalog.multistore-30.real.json');
const previous = JSON.parse(previousBytes), current = JSON.parse(currentBytes), catalog = JSON.parse(catalogBytes);
const hash = value => createHash('sha1').update('blob ' + value.length + '\0').update(value).digest('hex');
const OLD_SHA = 'c2b94e8a9770261f07ba586bdb025c4d7afac049', NEW_SHA = '2e189156ebd7a2185bb5eb29c04c5ce9813a5c01';
const sources = new Map([
  ['wikidata:q109051201', { name: 'Inscryption', publisher: 'Daniel Mullins Games / Devolver Digital',
    url: 'https://www.inscryption.com/steam', tags: ['activity:escape-room-puzzles','mechanic:card-drafting','mechanic:deck-building','mood:psychological-horror'] }],
  ['wikidata:q14565978', { name: 'Papers, Please', publisher: 'Lucas Pope / 3909 LLC',
    url: 'https://papersplea.se/presskit/', tags: ['activity:border-inspection','mechanic:document-checking','mechanic:entry-decisions','mechanic:fingerprint-checks'] }],
]);

test('immutable sixteen-game snapshot extends the fourteen-game receipt set without altering it', () => {
  assert.equal(hash(previousBytes), OLD_SHA);
  assert.equal(hash(currentBytes), NEW_SHA);
  assert.equal(hash(catalogBytes), REVIEWED_CATALOG_SHA);
  assert.equal(REVIEWED_OBSERVATIONS_SHA, NEW_SHA);
  assert.equal(current.supersedes, 'semantic-tags-reviewed-14.v1.json');
  assert.equal(current.catalogGitBlobSha1, REVIEWED_CATALOG_SHA);
  assert.equal(current.catalogSnapshotId, previous.catalogSnapshotId);
  assert.equal(current.games.length, 16);
  assert.equal(current.receipts.length, 16);
  assert.equal(current.taxonomy.tags.length, 47);
  assert.equal(current.games.reduce((n,g)=>n+g.tags.length,0), 66);
  for (const entry of previous.games)
    assert.deepEqual(current.games.find(row=>row.id===entry.id), entry);
  for (const entry of previous.receipts)
    assert.deepEqual(current.receipts.find(row=>row.id===entry.id), entry);
  for (const entry of previous.taxonomy.tags)
    assert.deepEqual(current.taxonomy.tags.find(row=>row.id===entry.id), entry);
  assert.match(current.weightSemantics, /NOT game-wide importance/);
});

test('both new game identities and independent first-party receipts are bound to selected facts', () => {
  for (const [id, expected] of sources) {
    assert.equal(catalog.games.find(row=>row.id===id)?.name, expected.name);
    assert.deepEqual(current.receipts.find(row=>row.id===id),
      { id, publisher: expected.publisher, url: expected.url, reviewedOn: '2026-11-05' });
    const game = current.games.find(row=>row.id===id);
    assert.equal(game.tagCoverage, 'partial');
    assert.deepEqual(game.tags.map(tag=>tag.id), expected.tags);
    assert.ok(game.tags.every(tag=>tag.weight===0.25 && tag.source===expected.url));
  }
  assert.ok(!current.games.some(g=>g.tagCoverage==='complete'));
});

test('new source-backed search and cross-game facts preserve unknowns and refrain from fit scores', () => {
  const model = prepareObservations(catalog, current);
  assert.equal(model.factCount, 66);
  assert.equal(model.observedGames, 16);
  assert.equal(model.games.filter(g=>g.coverage==='unknown').length,14);
  assert.deepEqual(searchObservations(model,'fingerprints').map(g=>g.name),['Papers, Please']);
  assert.deepEqual(searchObservations(model,'card drafting').map(g=>g.name),['Inscryption']);
  assert.deepEqual(searchObservations(model,'','mechanic:deck-building').map(g=>g.name),
    ['Inscryption','Slay the Spire']);
  const comparison=compareObservations(model,'wikidata:q109051201','wikidata:q48078440');
  assert.equal(comparison.status,'partial');
  assert.deepEqual(comparison.shared.map(f=>f.id),['mechanic:deck-building']);
  assert.equal(comparison.shared[0].left.source,'https://www.inscryption.com/steam');
  assert.notEqual(comparison.shared[0].left.source,comparison.shared[0].right.source);
  for (const key of ['affinity','score','confidence','mismatches']) assert.equal(comparison[key],undefined);
  const unknown=compareObservations(model,'wikidata:q14565978','dreven:devmatch');
  assert.equal(unknown.status,'unknown');
  assert.deepEqual(unknown.shared,[]);
  assert.deepEqual(unknown.rightRecorded,[]);
});

test('old versioned comparison links reject the new digest; current links restore exactly', () => {
  const oldModel=prepareObservations(catalog, previous, OLD_SHA);
  const currentModel=prepareObservations(catalog, current);
  const state={ version: OBSERVATION_VERSION, catalog: currentModel.catalog,
    evidence: currentModel.evidence, pair: ['wikidata:q109051201','wikidata:q48078440'],
    query:'cards', tag:'mechanic:deck-building' };
  assert.deepEqual(decodeObservationState(currentModel,encodeObservationState(currentModel,state)),state);
  const oldState={...state,evidence:OLD_SHA,pair:['wikidata:q30591391','wikidata:q4308783']};
  assert.throws(()=>decodeObservationState(currentModel,encodeObservationState(oldModel,oldState)),/Incompatible/);
  const tampered=JSON.parse(JSON.stringify(current));
  tampered.games.find(g=>g.id==='wikidata:q109051201').tags[0].source='https://attacker.test/';
  assert.throws(()=>prepareObservations(catalog,tampered),/source does not match/);
  tampered.games.find(g=>g.id==='wikidata:q109051201').tags[0].source='https://www.inscryption.com/steam';
  tampered.games.find(g=>g.id==='wikidata:q109051201').tagCoverage='complete';
  assert.throws(()=>prepareObservations(catalog,tampered),/partial/);
});
