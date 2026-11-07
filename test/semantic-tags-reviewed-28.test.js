import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareObservations,compareObservations,searchObservations,encodeObservationState,decodeObservationState,REVIEWED_OBSERVATIONS_SHA,REVIEWED_CATALOG_SHA,OBSERVATION_VERSION} from '../src/observations.js';
const read=x=>readFileSync(new URL('../examples/'+x,import.meta.url));
const oldBytes=read('semantic-tags-reviewed-22.v1.json'),nowBytes=read('semantic-tags-reviewed-28.v1.json'),catalogBytes=read('catalog.multistore-30.real.json');
const before=JSON.parse(oldBytes),after=JSON.parse(nowBytes),catalog=JSON.parse(catalogBytes);
const blob=b=>createHash('sha1').update('blob '+b.length+String.fromCharCode(0)).update(b).digest('hex');
const added=[["wikidata:q96991833","Mortal Shell","Playstack / Cold Symmetry","https://news.xbox.com/en-us/2020/08/18/mortal-shell-is-now-available-for-xbox-one/",["activity:exploration","mechanic:action-combat","mechanic:deliberate-combat","mechanic:shell-possession"]],["wikidata:q24300","Infamous 2","Sony Computer Entertainment / Sucker Punch","https://sony.mediaroom.com/2011-06-07-PlayStation-3-Exclusive-inFAMOUS-2-Powers-Up-North-America-With-Breathtaking-Cinematics-and-Epic-Open-World-Superhero-Adventure",["activity:exploration","mechanic:action-combat","mechanic:elemental-powers","mechanic:karma-choices"]],["wikidata:q75493248","Tell Me Why","DONTNOD Entertainment / Xbox Game Studios","https://www.tellmewhygame.com/about/",["activity:character-stories","activity:memory-exploration","mechanic:branching-choices","structure:story-driven"]],["wikidata:q112430705","Minecraft Legends","Mojang Studios / Xbox Game Studios","https://www.minecraft.net/en-us/about-legends",["activity:strategic-battles","activity:village-defense","mechanic:army-command","mechanic:building"]],["dreven:shadow-runner","Shadow Runner","Dreven Games","https://drevengames.itch.io/shadow-runner",["mechanic:light-magic","mechanic:platforming","mechanic:ranged-attacks","structure:procedural-levels"]],["dreven:hunter-adventure","Hunter Adventure","Dreven Games","https://drevengames.itch.io/hunter-adventure",["activity:exploration","activity:hunting","mechanic:choice-events","mechanic:survival-management"]]];
test('immutable 28-profile source retains all 22 prior records and tags',()=>{
 assert.equal(blob(oldBytes),'73a40215d2ad77668a68d7a2aa4c43e2bdcfb4f9');assert.equal(blob(nowBytes),REVIEWED_OBSERVATIONS_SHA);
 assert.notEqual(REVIEWED_OBSERVATIONS_SHA,'73a40215d2ad77668a68d7a2aa4c43e2bdcfb4f9');assert.equal(blob(catalogBytes),REVIEWED_CATALOG_SHA);
 assert.equal(after.supersedes,'semantic-tags-reviewed-22.v1.json');
 assert.equal(after.games.length,28);assert.equal(after.receipts.length,28);
 assert.equal(after.taxonomy.tags.length,76);assert.equal(after.games.reduce((s,g)=>s+g.tags.length,0),114);
 for(const key of ['games','receipts'])for(const x of before[key])assert.deepEqual(after[key].find(y=>y.id===x.id),x);
 for(const x of before.taxonomy.tags)assert.deepEqual(after.taxonomy.tags.find(y=>y.id===x.id),x);
 assert.ok(after.games.every(g=>g.tagCoverage==='partial'));
 assert.match(after.weightSemantics,/NOT game-wide importance/);
});
test('each new canonical profile has four sourced dated positive facts',()=>{
 for(const [id,name,publisher,url,ids] of added){
  assert.equal(catalog.games.find(x=>x.id===id)?.name,name);
  assert.deepEqual(after.receipts.find(x=>x.id===id),{id,publisher,url,reviewedOn:'2026-11-07'});
  const entries=after.games.find(x=>x.id===id).tags;
  assert.deepEqual(entries.map(x=>x.id),ids);
  assert.ok(entries.every(x=>x.weight===.25&&x.source===url&&after.taxonomy.tags.some(y=>y.id===x.id)));
 }
});
test('partial factual overlaps are visible, missing profiles are unknown, no fit fabricated',()=>{
 const model=prepareObservations(catalog,after);
 assert.equal(model.observedGames,28);assert.equal(model.factCount,114);
 assert.deepEqual(model.games.filter(x=>x.coverage==='unknown').map(x=>x.name),['Circlanoid','DevMatch']);
 for(const [a,b,common] of [
 ['wikidata:q96991833','wikidata:q54906424',['mechanic:action-combat']],
 ['wikidata:q24300','wikidata:q96991833',['activity:exploration','mechanic:action-combat']],
 ['wikidata:q75493248','wikidata:q1711379',['activity:character-stories','structure:story-driven']],
 ['wikidata:q112430705','wikidata:q248810',['mechanic:building']],
 ['dreven:shadow-runner','wikidata:q28451532',['mechanic:platforming']]
 ]){
 const pair=compareObservations(model,a,b);
 assert.equal(pair.status,'partial');assert.deepEqual(pair.shared.map(x=>x.id),common);
 assert.equal(pair.affinity,undefined);assert.equal(pair.mismatches,undefined);
 }
 assert.equal(compareObservations(model,'dreven:hunter-adventure','dreven:devmatch').status,'unknown');
 assert.deepEqual(searchObservations(model,'','mechanic:shell-possession').map(x=>x.name),['Mortal Shell']);
});
test('old evidence shares, borrowed sources and false complete coverage fail visibly',()=>{
 const previous=prepareObservations(catalog,before,'73a40215d2ad77668a68d7a2aa4c43e2bdcfb4f9'),current=prepareObservations(catalog,after);
 const state={version:OBSERVATION_VERSION,catalog:current.catalog,evidence:current.evidence,pair:['dreven:shadow-runner','wikidata:q28451532'],query:'',tag:'mechanic:platforming'};
 assert.deepEqual(decodeObservationState(current,encodeObservationState(current,state)),state);
 const obsolete={...state,evidence:previous.evidence,pair:['wikidata:q1711379','wikidata:q59756366'],tag:'activity:character-stories'};
 assert.throws(()=>decodeObservationState(current,encodeObservationState(previous,obsolete)),/Incompatible/);
 const changed=JSON.parse(JSON.stringify(after));changed.games.find(g=>g.id==='wikidata:q24300').tags[0].source='https://example.invalid';
 assert.throws(()=>prepareObservations(catalog,changed),/source does not match/);
 changed.games.find(g=>g.id==='wikidata:q24300').tags[0].source=added[1][3];
 changed.games.find(g=>g.id==='wikidata:q24300').tagCoverage='complete';
 assert.throws(()=>prepareObservations(catalog,changed),/partial/);
});
