import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBridgePreview } from '../src/bridge-preview.js';
const g=(id,mechanics,themes=['fantasy'],platforms=['linux'],coop=true)=>({id:`demo:${id}`,mechanics,themes,platforms,coop});
const catalog=[g('a',['crafting','farming'],['spring']),g('b',['farming','combat'],['summer']),g('c',['combat','puzzle'],['autumn']),g('d',['puzzle','strategy'],['winter']),g('unknown',null,null,null,null)];
const params=()=>({catalog,snapshotId:'bridge-fictional-fixture-1',startId:'demo:a',endId:'demo:d',maxHops:4,minSimilarity:.05});
test('routes explicit favorites through shared feature evidence, never UI coordinates',()=>{
  const original=buildBridgePreview(params());
  assert.equal(original.status,'route');
  assert.deepEqual(original.nodes,['demo:a','demo:b','demo:c','demo:d']);
  assert.equal(original.steps.length,3);
  assert.deepEqual(original.steps[0].groups.find(g=>g.group==='mechanics').gained,['combat']);
  assert.deepEqual(original.steps[0].groups.find(g=>g.group==='mechanics').lost,['crafting']);
  assert.equal(original.route_method_version,'bridge-features-preview-3');
  const changed=catalog.map((g,i)=>({...g,x:i*1000000,y:-i*7777777}));
  assert.deepEqual(buildBridgePreview({...params(),catalog:changed}),original);
});
test('hard filters and exclusions are never silently relaxed',()=>{
  assert.equal(buildBridgePreview({...params(),excluded:['demo:b']}).status,'no-route');
  assert.deepEqual(buildBridgePreview({...params(),coopOnly:true}).nodes,buildBridgePreview(params()).nodes);
  const fail=buildBridgePreview({...params(),platform:'mac'});
  assert.equal(fail.status,'unavailable-endpoint'); assert.equal(fail.reason,'fail');
  const unknown=buildBridgePreview({...params(),startId:'demo:unknown',platform:'linux'});
  assert.equal(unknown.status,'unavailable-endpoint'); assert.equal(unknown.reason,'unknown');
});
test('hop cap abstains instead of inventing a direct edge',()=>{
  const r=buildBridgePreview({...params(),maxHops:2});
  assert.equal(r.status,'no-route');
});
test('reversing route reverses signed gains/losses and preserves evidence coverage',()=>{
  const fw=buildBridgePreview(params());
  const bw=buildBridgePreview({...params(),startId:'demo:d',endId:'demo:a'});
  assert.deepEqual(bw.nodes,[...fw.nodes].reverse());
  const f=fw.steps[0].groups.find(x=>x.group==='mechanics');
  const b=bw.steps.at(-1).groups.find(x=>x.group==='mechanics');
  assert.deepEqual(f.gained,b.lost);assert.deepEqual(f.lost,b.gained);
  assert.equal(fw.steps[0].evidence_coverage,bw.steps.at(-1).evidence_coverage);
});
test('independent eligibility of missing metadata is explicit and covered in counts',()=>{
  const r=buildBridgePreview({...params(),platform:'linux'});
  assert.equal(r.eligibility.unknown,1);
  assert.equal(r.eligibility.pass,4);
});
test('malformed metadata, duplicate identities and unknown exclusions fail closed',()=>{
  assert.throws(()=>buildBridgePreview({...params(),catalog:[...catalog,catalog[0]]}),/duplicate game ID/);
  assert.throws(()=>buildBridgePreview({...params(),catalog:catalog.map((g,i)=>i===0?{...g,mechanics:['x','x']}:g)}),/duplicate mechanics/);
  assert.throws(()=>buildBridgePreview({...params(),excluded:['demo:missing']}),/Unknown excluded/);
  assert.throws(()=>buildBridgePreview({...params(),maxHops:999}),/maxHops/);
});
test('generic shared theme creates a direct-edge shortcut: documented negative result, not a quality claim',()=>{
  const sameTheme=catalog.map(game=>game.id==='demo:unknown'?game:{...game,themes:['common-theme']});
  const route=buildBridgePreview({...params(),catalog:sameTheme});
  assert.equal(route.status,'route');
  assert.deepEqual(route.nodes,['demo:a','demo:d']);
  assert.equal(route.steps[0].affinity,.3);
  assert.deepEqual(buildBridgePreview({...params(),catalog:sameTheme,minSimilarity:.31}).nodes,['demo:a','demo:b','demo:c','demo:d']);
  assert.equal(buildBridgePreview({...params(),catalog:sameTheme,minSimilarity:.54}).status,'no-route');
});
test('catalog/version provenance must not be invented by the caller wrapper',()=>{
  assert.throws(()=>buildBridgePreview({...params(),snapshotId:undefined}),/snapshotId/);
});
