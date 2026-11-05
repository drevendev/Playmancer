import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareObservations, searchObservations, compareObservations,
  encodeObservationState, decodeObservationState, OBSERVATION_VERSION,
  REVIEWED_OBSERVATIONS_SHA } from '../src/observations.js';

const bytes = name => readFileSync(new URL('../examples/' + name, import.meta.url));
const oldBytes = bytes('semantic-tags-reviewed-12.v1.json');
const newBytes = bytes('semantic-tags-reviewed-13.v1.json');
const catalogBytes = bytes('catalog.multistore-30.real.json');
const previous = JSON.parse(oldBytes), reviewed = JSON.parse(newBytes), catalog = JSON.parse(catalogBytes);
const blob = b => createHash('sha1').update('blob ' + b.length + '\0').update(b).digest('hex');
const id = 'dreven:idle-fantasy-shop', oldSHA = 'cd79f729d960f5c495c2d1e16448ff8058f582dd', newSHA = '426fa34e432bcb10fc96dd48462f0b6d7dc62c9d';
const copy = x => JSON.parse(JSON.stringify(x));

test('immutable source revisions and existing game identity remain exact', () => {
  assert.equal(blob(oldBytes), oldSHA);
  assert.equal(blob(newBytes), newSHA);
  assert.equal(blob(catalogBytes), '0570fd610b14fb336c0de65e6cc3062892abe301');
  assert.notEqual(REVIEWED_OBSERVATIONS_SHA, newSHA);
  assert.equal(reviewed.supersedes, 'semantic-tags-reviewed-12.v1.json');
  assert.equal(reviewed.games.length, 13);
  assert.equal(reviewed.receipts.length, 13);
  assert.equal(reviewed.taxonomy.tags.length, 37);
  const oldById = new Map(previous.games.map(game => [game.id, game]));
  const oldReceipts = new Map(previous.receipts.map(row => [row.id, row]));
  for (const game of reviewed.games) if (oldById.has(game.id)) assert.deepEqual(game, oldById.get(game.id));
  for (const receipt of reviewed.receipts) if (oldReceipts.has(receipt.id)) assert.deepEqual(receipt, oldReceipts.get(receipt.id));
  for (const tag of previous.taxonomy.tags)
    assert.deepEqual(reviewed.taxonomy.tags.find(row => row.id === tag.id), tag);
  const entry = catalog.games.filter(game => game.id === id);
  assert.equal(entry.length, 1);
  assert.deepEqual(entry[0].externalIds, [{provider:'itch', id:'idle-fantasy-shop'}]);
  assert.equal(entry[0].storeLinks[0].url, 'https://drevengames.itch.io/idle-fantasy-shop');
});

test('six original short labels are source-backed, partial, and deliberately unweighted in UI', () => {
  const g = reviewed.games.find(game => game.id === id);
  assert.equal(g.tagCoverage, 'partial');
  assert.equal(g.tags.length, 6);
  assert.ok(Math.abs(g.tags.reduce((s,t)=>s+t.weight,0)-1)<1e-9);
  const expected = [
    'activity:resource-extraction','activity:worker-management','mechanic:crafting',
    'mechanic:customer-preferences','mechanic:repeat-jobs','mechanic:shelf-stocking'
  ];
  assert.deepEqual(g.tags.map(t=>t.id),expected);
  assert.equal(reviewed.receipts.find(r=>r.id===id).reviewedOn,'2026-11-04');
  for(const t of g.tags) {
    assert.ok(t.source.startsWith('https://drevengames.itch.io/idle-fantasy-shop/devlog/'));
    assert.equal(t.weight,1/6);
    assert.ok(reviewed.taxonomy.tags.some(row=>row.id===t.id));
    assert.ok(!t.id.startsWith('genre:'));
  }
  assert.ok(!g.tags.some(t=>t.id==='mechanic:automation'||t.id==='mood:cozy'));
  assert.match(reviewed.weightSemantics,/NOT game-wide importance/);
});

test('new static explorer exposes 54 facts, preserves unknowns and rejects old links', () => {
  const model = prepareObservations(catalog, reviewed);
  assert.equal(OBSERVATION_VERSION,'observations-2');
  assert.equal(model.factCount,54);
  assert.equal(model.observedGames,13);
  assert.equal(model.games.filter(g=>g.coverage==='unknown').length,17);
  assert.ok(model.games.filter(g=>g.coverage==='partial').length===13);
  const owned = searchObservations(model,'Idle Fantasy Shop');
  assert.equal(owned.length,1);
  assert.equal(owned[0].id,id);
  assert.equal(owned[0].facts.length,6);
  assert.ok(!owned[0].facts.some(f=>Object.hasOwn(f,'weight')));
  const pair=compareObservations(model,id,'dreven:devmatch');
  assert.equal(pair.status,'unknown');
  assert.equal(pair.shared.length,0);
  assert.equal(pair.leftRecorded.length,6);
  const state={version:OBSERVATION_VERSION,catalog:model.catalog,evidence:model.evidence,pair:[id,'wikidata:q16972008'],query:'shelves',tag:''};
  assert.deepEqual(decodeObservationState(model,encodeObservationState(model,state)),state);
  const oldLink='#facts='+encodeURIComponent(JSON.stringify({...state,version:'observations-1',evidence:oldSHA}));
  assert.throws(()=>decodeObservationState(model,oldLink),/Incompatible/);
});

test('unknown, duplicate and borrowed-source facts are rejected without profile substitution', () => {
  const broken=copy(reviewed);
  broken.games.find(g=>g.id===id).tags[0].source='https://example.org/fake';
  assert.throws(()=>prepareObservations(catalog,broken),/source does not match/);
  const absent=copy(reviewed);
  absent.games.find(g=>g.id===id).tags[0].id='mechanic:imaginary';
  assert.throws(()=>prepareObservations(catalog,absent),/Invalid or duplicate per-game/);
  const duplicated=copy(reviewed);
  duplicated.games.push(copy(duplicated.games.find(g=>g.id===id)));
  assert.throws(()=>prepareObservations(catalog,duplicated),/Only distinct/);
  assert.equal(catalog.games.find(g=>g.id===id).mechanics,null);
  assert.equal(catalog.games.find(g=>g.id===id).coop,null);
});
