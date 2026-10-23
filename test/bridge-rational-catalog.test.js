import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBridgePreview, BRIDGE_ROUTE_METHOD_VERSION } from '../src/bridge-preview.js';

const game = (id, mechanics, themes) => ({ id:`test:${id}`,
  mechanics, themes, platforms:['linux'], coop:false });
const catalog = [
  game('g6',['survival'],['fantasy']),
  game('g1',['action'],['fantasy','war']),
  game('g4',['puzzle','survival'],['fantasy','nature']),
  game('g2',['action','farming'],['nature','war']),
];
test('real feature-derived rational tie keeps lexicographically first path', () => {
  const settings={catalog,snapshotId:'synthetic-rational-regression',
    startId:'test:g6', endId:'test:g2',minSimilarity:.05,maxHops:3};
  const route=buildBridgePreview(settings);
  assert.equal(route.route_method_version,'bridge-features-preview-3');
  assert.deepEqual(route.nodes,['test:g6','test:g1','test:g2']);
  assert.equal(route.total_cost,1.4);
  assert.deepEqual(buildBridgePreview({...settings,catalog:[...catalog].reverse()}).nodes,route.nodes);
});
test('rational equality to a strict threshold is eligible; strict higher bound abstains',()=>{
  const games=[game('left',['action'],['fantasy','war']),
    game('right',['action','farming'],['nature','war'])];
  const settings={catalog:games,snapshotId:'synthetic-threshold-regression',
    startId:'test:left',endId:'test:right',maxHops:1,minSimilarity:.45};
  const pass=buildBridgePreview(settings);
  assert.equal(pass.status,'route');
  assert.equal(pass.steps[0].affinity,.45);
  assert.equal(pass.route_method_version,BRIDGE_ROUTE_METHOD_VERSION);
  const fail=buildBridgePreview({...settings,minSimilarity:.450001});
  assert.equal(fail.status,'no-route');
  assert.equal(fail.pair_evidence.below_threshold,1);
});
