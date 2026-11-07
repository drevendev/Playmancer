import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { prepareObservations, compareObservations, searchObservations,
  encodeObservationState, decodeObservationState, REVIEWED_OBSERVATIONS_SHA,
  REVIEWED_CATALOG_SHA, OBSERVATION_VERSION } from '../src/observations.js';
const bytes=name=>readFileSync(new URL('../examples/'+name,import.meta.url));
const oldBytes=bytes('semantic-tags-reviewed-20.v1.json');
const newBytes=bytes('semantic-tags-reviewed-22.v1.json');
const catalogBytes=bytes('catalog.multistore-30.real.json');
const old=JSON.parse(oldBytes), reviewed=JSON.parse(newBytes), catalog=JSON.parse(catalogBytes);
const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\\0').update(bytes).digest('hex');
const meat='wikidata:q1784048', moon='wikidata:q1711379';
const meatUrl='https://www.eastasiasoft.com/games/Super-Meat-Boy';
const moonUrl='https://freebirdgames.com/games/to-the-moon/';
const oldDigest='8d667a7c67b028e0f4f550ce22f8e333eb93c58a';

test('new immutable selected observations retain all 20 previous profiles and receipts',()=>{
  assert.equal(gitBlob(oldBytes), oldDigest);
  assert.equal(gitBlob(newBytes), REVIEWED_OBSERVATIONS_SHA);
  assert.equal(REVIEWED_OBSERVATIONS_SHA, '73a40215d2ad77668a68d7a2aa4c43e2bdcfb4f9');
  assert.equal(gitBlob(catalogBytes), REVIEWED_CATALOG_SHA);
  assert.equal(reviewed.supersedes, 'semantic-tags-reviewed-20.v1.json');
  assert.equal(reviewed.games.length,22);
  assert.equal(reviewed.receipts.length,22);
  assert.equal(reviewed.taxonomy.tags.length,61);
  assert.equal(reviewed.games.reduce((n,g)=>n+g.tags.length,0),90);
  for(const list of ['games','receipts'])for(const entry of old[list])
    assert.deepEqual(reviewed[list].find(x=>x.id===entry.id),entry);
  for(const entry of old.taxonomy.tags)
    assert.deepEqual(reviewed.taxonomy.tags.find(x=>x.id===entry.id),entry);
  assert.ok(reviewed.games.every(g=>g.tagCoverage==='partial'));
  assert.match(reviewed.weightSemantics,/NOT game-wide importance/);
});

test('the two new profiles contain independently receipted positive facts only',()=>{
  for(const [id,name,publisher,url,tags] of [
    [meat,'Super Meat Boy','Team Meat / eastasiasoft',meatUrl,
      ['activity:boss-fights','mechanic:platforming','mechanic:wall-jumping','structure:short-levels']],
    [moon,'To the Moon','Freebird Games',moonUrl,
      ['activity:character-stories','activity:memory-reconstruction','structure:story-driven','visual:rpg-aesthetics']]
  ]){
    assert.equal(catalog.games.find(g=>g.id===id)?.name,name);
    assert.deepEqual(reviewed.receipts.find(r=>r.id===id),
      {id,publisher,url,reviewedOn:'2026-11-07'});
    const profile=reviewed.games.find(g=>g.id===id);
    assert.deepEqual(profile.tags.map(t=>t.id),tags);
    assert.ok(profile.tags.every(t=>t.weight===0.25&&t.source===url));
    assert.ok(profile.tags.every(t=>reviewed.taxonomy.tags.some(d=>d.id===t.id)));
  }
});

test('comparisons show recorded shared facts without fabricating game-wide fit',()=>{
  const m=prepareObservations(catalog,reviewed);
  assert.equal(m.observedGames,22);
  assert.equal(m.factCount,90);
  assert.equal(m.games.filter(g=>g.coverage==='unknown').length,8);
  const celeste=compareObservations(m,meat,'wikidata:q28451532');
  assert.equal(celeste.status,'partial');
  assert.deepEqual(celeste.shared.map(t=>t.id),['mechanic:platforming','mechanic:wall-jumping']);
  assert.ok(celeste.shared.every(t=>t.left.source===meatUrl));
  const hades=compareObservations(m,moon,'wikidata:q59756366');
  assert.deepEqual(hades.shared.map(t=>t.id),['activity:character-stories']);
  assert.equal(hades.shared[0].left.source,moonUrl);
  assert.equal(hades.affinity,undefined);
  assert.equal(hades.mismatches,undefined);
  assert.equal(searchObservations(m,'','activity:memory-reconstruction').length,1);
  const unknown=compareObservations(m,moon,'dreven:devmatch');
  assert.equal(unknown.status,'unknown');
  assert.deepEqual(unknown.shared,[]);
});

test('obsolete evidence shares visibly fail; unrelated-origin receipts are rejected',()=>{
  const previous=prepareObservations(catalog,old,oldDigest);
  const current=prepareObservations(catalog,reviewed);
  const state={version:OBSERVATION_VERSION,catalog:current.catalog,evidence:current.evidence,
    pair:[meat,moon],query:'',tag:'mechanic:platforming'};
  assert.deepEqual(decodeObservationState(current,encodeObservationState(current,state)),state);
  const oldState={...state,evidence:previous.evidence,pair:['wikidata:q279446','wikidata:q1711359'],
    tag:'mechanic:puzzle-solving'};
  assert.throws(()=>decodeObservationState(current,encodeObservationState(previous,oldState)),
    /Incompatible/);
  const tampered=JSON.parse(JSON.stringify(reviewed));
  tampered.games.find(g=>g.id===meat).tags[0].source='https://example.invalid/borrowed';
  assert.throws(()=>prepareObservations(catalog,tampered),/source does not match/);
});
