import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {prepareObservations,compareObservations,searchObservations,
 encodeObservationState,decodeObservationState,REVIEWED_OBSERVATIONS_SHA,
 REVIEWED_CATALOG_SHA,OBSERVATION_VERSION} from '../src/observations.js';
const read=name=>readFileSync(new URL('../examples/'+name,import.meta.url));
const prevBytes=read('semantic-tags-reviewed-18.v1.json'),nowBytes=read('semantic-tags-reviewed-20.v1.json'),catBytes=read('catalog.multistore-30.real.json');
const prev=JSON.parse(prevBytes),now=JSON.parse(nowBytes),catalog=JSON.parse(catBytes);
const sha=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const portal='wikidata:q279446',witness='wikidata:q1711359';
const purl='https://store.steampowered.com/app/620/Portal_2/',wurl='https://www.playstation.com/en-us/games/the-witness/';
test('source revisions are immutable and all older records are preserved',()=>{
 assert.equal(sha(prevBytes),'fb69cf0c834812509fe979e4a8f2380bd7930e0b');
 assert.equal(sha(nowBytes),REVIEWED_OBSERVATIONS_SHA);
 assert.equal(REVIEWED_OBSERVATIONS_SHA,'8d667a7c67b028e0f4f550ce22f8e333eb93c58a');
 assert.equal(sha(catBytes),REVIEWED_CATALOG_SHA);
 assert.equal(now.supersedes,'semantic-tags-reviewed-18.v1.json');
 assert.equal(now.games.length,20);assert.equal(now.receipts.length,20);
 assert.equal(now.taxonomy.tags.length,56);
 assert.equal(now.games.reduce((s,g)=>s+g.tags.length,0),82);
 for(const name of ['games','receipts'])for(const row of prev[name])
  assert.deepEqual(now[name].find(x=>x.id===row.id),row);
 for(const t of prev.taxonomy.tags)assert.deepEqual(now.taxonomy.tags.find(x=>x.id===t.id),t);
 assert.ok(now.games.every(g=>g.tagCoverage==='partial'));
 assert.match(now.weightSemantics,/NOT game-wide importance/);
});
test('Portal 2 and The Witness have own dated receipts and selected positive facts',()=>{
 const examples=[
 [portal,'Portal 2','Valve',purl,['mechanic:cooperative-puzzles','mechanic:physics-puzzles','mechanic:puzzle-solving','structure:test-chambers']],
 [witness,'The Witness','Thekla, Inc.',wurl,['activity:exploration','mechanic:puzzle-solving','setting:island','structure:open-world']]
 ];
 for(const [id,name,publisher,url,tags] of examples){
  assert.equal(catalog.games.find(g=>g.id===id)?.name,name);
  assert.deepEqual(now.receipts.find(x=>x.id===id),{id,publisher,url,reviewedOn:'2026-11-06'});
  const game=now.games.find(g=>g.id===id);
  assert.deepEqual(game.tags.map(t=>t.id),tags);
  assert.ok(game.tags.every(t=>t.source===url&&t.weight===0.25));
 }
});
test('independent shared positive evidence is not fabricated taste or negative metadata',()=>{
 const m=prepareObservations(catalog,now);
 assert.equal(m.observedGames,20);assert.equal(m.factCount,82);
 assert.equal(m.games.filter(g=>g.coverage==='unknown').length,10);
 assert.deepEqual(searchObservations(m,'','mechanic:puzzle-solving').map(x=>x.name),['Portal 2','The Witness']);
 const pair=compareObservations(m,portal,witness);
 assert.equal(pair.status,'partial');
 assert.deepEqual(pair.shared.map(f=>f.id),['mechanic:puzzle-solving']);
 assert.equal(pair.shared[0].left.source,purl);assert.equal(pair.shared[0].right.source,wurl);
 assert.equal(pair.affinity,undefined);assert.equal(pair.mismatches,undefined);
 const unknown=compareObservations(m,portal,'dreven:devmatch');
 assert.equal(unknown.status,'unknown');assert.deepEqual(unknown.shared,[]);
});
test('version-pinned links reject old snapshots and borrowed source credentials',()=>{
 const old=prepareObservations(catalog,prev,'fb69cf0c834812509fe979e4a8f2380bd7930e0b');
 const current=prepareObservations(catalog,now);
 const state={version:OBSERVATION_VERSION,catalog:current.catalog,evidence:current.evidence,
 pair:[portal,witness],query:'puzzle',tag:'mechanic:puzzle-solving'};
 assert.deepEqual(decodeObservationState(current,encodeObservationState(current,state)),state);
 const oldState={...state,evidence:old.evidence,pair:['wikidata:q248810','wikidata:q54906424']};
 assert.throws(()=>decodeObservationState(current,encodeObservationState(old,oldState)),/Incompatible/);
 const tampered=JSON.parse(JSON.stringify(now));
 tampered.games.find(g=>g.id===portal).tags[0].source='https://example.invalid/';
 assert.throws(()=>prepareObservations(catalog,tampered),/source does not match/);
 tampered.games.find(g=>g.id===portal).tags[0].source=purl;
 tampered.games.find(g=>g.id===portal).tagCoverage='complete';
 assert.throws(()=>prepareObservations(catalog,tampered),/partial/);
});
