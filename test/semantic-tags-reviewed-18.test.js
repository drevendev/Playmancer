import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareObservations, compareObservations, searchObservations,
  encodeObservationState, decodeObservationState, REVIEWED_OBSERVATIONS_SHA,
  REVIEWED_CATALOG_SHA, OBSERVATION_VERSION } from '../src/observations.js';
const read = name => readFileSync(new URL('../examples/' + name, import.meta.url));
const originalBytes=read('semantic-tags-reviewed-16.v1.json');
const latestBytes=read('semantic-tags-reviewed-18.v1.json');
const catalogBytes=read('catalog.multistore-30.real.json');
const old=JSON.parse(originalBytes), now=JSON.parse(latestBytes), catalog=JSON.parse(catalogBytes);
const sha = b => createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const dwarf='wikidata:q248810', sekiro='wikidata:q54906424', terra='wikidata:q332697';
const added=new Map([
  [dwarf,{name:'Dwarf Fortress',publisher:'Bay 12 Games',
    url:'https://www.bay12games.com/dwarves/features.html',
    tags:['activity:colony-management','mechanic:building','mechanic:digging','mechanic:farming']}],
  [sekiro,{name:'Sekiro: Shadows Die Twice',publisher:'FromSoftware / Activision',
    url:'https://www.sekirothegame.com/',
    tags:['mechanic:action-combat','mechanic:prosthetic-tools','mechanic:stealth','mechanic:vertical-traversal']}]
]);
test('immutable new inventory preserves all earlier observed identities and fields',()=>{
  assert.equal(sha(originalBytes),'2e189156ebd7a2185bb5eb29c04c5ce9813a5c01');
  assert.equal(sha(latestBytes),REVIEWED_OBSERVATIONS_SHA);
  assert.equal(REVIEWED_OBSERVATIONS_SHA,'fb69cf0c834812509fe979e4a8f2380bd7930e0b');
  assert.equal(sha(catalogBytes),REVIEWED_CATALOG_SHA);
  assert.equal(now.supersedes,'semantic-tags-reviewed-16.v1.json');
  assert.equal(now.catalogSnapshotId,old.catalogSnapshotId);
  assert.equal(now.catalogGitBlobSha1,old.catalogGitBlobSha1);
  assert.equal(now.games.length,18);assert.equal(now.receipts.length,18);
  assert.equal(now.taxonomy.tags.length,50);
  assert.equal(now.games.reduce((n,g)=>n+g.tags.length,0),74);
  assert.ok(now.games.every(g=>g.tagCoverage==='partial'));
  for(const group of ['games','receipts'])for(const entry of old[group])
    assert.deepEqual(now[group].find(x=>x.id===entry.id),entry);
  for(const entry of old.taxonomy.tags)
    assert.deepEqual(now.taxonomy.tags.find(x=>x.id===entry.id),entry);
  assert.match(now.weightSemantics,/NOT game-wide importance/);
});
test('source-bound Dwarf Fortress and Sekiro facts are dated and independently identified',()=>{
  for(const [id,e] of added){
    assert.equal(catalog.games.find(x=>x.id===id)?.name,e.name);
    assert.deepEqual(now.receipts.find(x=>x.id===id),
      {id,publisher:e.publisher,url:e.url,reviewedOn:'2026-11-06'});
    const game=now.games.find(x=>x.id===id);
    assert.deepEqual(game.tags.map(t=>t.id),e.tags);
    assert.ok(game.tags.every(t=>t.weight===.25&&t.source===e.url));
  }
  for(const id of added.get(sekiro).tags.slice(1))
    assert.equal(now.taxonomy.tags.filter(t=>t.id===id).length,1);
});
test('facts search, shared positive observations and unknowns never fabricate fit',()=>{
  const model=prepareObservations(catalog,now);
  assert.equal(model.observedGames,18);assert.equal(model.factCount,74);
  assert.equal(model.games.filter(g=>g.coverage==='unknown').length,12);
  assert.deepEqual(searchObservations(model,'vertical traversal').map(g=>g.name),['Sekiro: Shadows Die Twice']);
  assert.deepEqual(searchObservations(model,'digging').map(g=>g.name),['Dwarf Fortress','Terraria']);
  const pair=compareObservations(model,dwarf,terra);
  assert.equal(pair.status,'partial');
  assert.deepEqual(pair.shared.map(f=>f.id),['mechanic:building','mechanic:digging']);
  assert.equal(pair.shared[0].left.source,added.get(dwarf).url);
  assert.notEqual(pair.shared[0].left.source,pair.shared[0].right.source);
  assert.deepEqual(compareObservations(model,sekiro,'wikidata:q29300592').shared.map(f=>f.id),['mechanic:action-combat']);
  const unknown=compareObservations(model,sekiro,'dreven:devmatch');
  assert.equal(unknown.status,'unknown');assert.deepEqual(unknown.shared,[]);
  assert.equal(pair.affinity,undefined);assert.equal(pair.mismatches,undefined);
});
test('versioned comparisons restore exact IDs and reject incompatible source digests',()=>{
  const oldModel=prepareObservations(catalog,old,'2e189156ebd7a2185bb5eb29c04c5ce9813a5c01');
  const current=prepareObservations(catalog,now);
  const state={version:OBSERVATION_VERSION,catalog:current.catalog,evidence:current.evidence,
    pair:[dwarf,terra],query:'digging',tag:'mechanic:building'};
  assert.deepEqual(decodeObservationState(current,encodeObservationState(current,state)),state);
  const historical={...state,evidence:oldModel.evidence,pair:['wikidata:q109051201','wikidata:q48078440']};
  assert.throws(()=>decodeObservationState(current,encodeObservationState(oldModel,historical)),/Incompatible/);
  const tampered=JSON.parse(JSON.stringify(now));
  tampered.games.find(g=>g.id===sekiro).tags[0].source='https://example.invalid/';
  assert.throws(()=>prepareObservations(catalog,tampered),/source does not match/);
  tampered.games.find(g=>g.id===sekiro).tags[0].source=added.get(sekiro).url;
  tampered.games.find(g=>g.id===sekiro).tagCoverage='complete';
  assert.throws(()=>prepareObservations(catalog,tampered),/partial/);
});
