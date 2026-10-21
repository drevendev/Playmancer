import test from 'node:test';
import assert from 'node:assert/strict';
import { findBridgeRoute } from '../src/bridge.js';
import { buildBridgePreview } from '../src/bridge-preview.js';

const nodeIds = ['demo:s','demo:a','demo:b','demo:c','demo:t'];
const isolated = {nodes:nodeIds,edges:[
  {from:'demo:s',to:'demo:a',similarity:0.6},
  {from:'demo:a',to:'demo:b',similarity:0.8},
  {from:'demo:c',to:'demo:t',similarity:0.9}
]};

test('no route across two non-empty disconnected components', () => {
  for (const edges of [isolated.edges, [...isolated.edges].reverse()]) {
    assert.deepEqual(findBridgeRoute({...isolated,edges},'demo:s','demo:t',{maxHops:8}), {
      status:'no-route', reason:'disconnected-or-hop-bound',
      startId:'demo:s', endId:'demo:t', maxHops:8
    });
  }
});

test('connected graph still respects exact hop constraint and chooses legal path', () => {
  const graph={nodes:['demo:s','demo:a','demo:t'],edges:[
    {from:'demo:s',to:'demo:a',similarity:0.9},
    {from:'demo:a',to:'demo:t',similarity:0.9}
  ]};
  assert.equal(findBridgeRoute(graph,'demo:s','demo:t',{maxHops:1}).status,'no-route');
  assert.deepEqual(findBridgeRoute(graph,'demo:s','demo:t',{maxHops:2}).nodes,
    ['demo:s','demo:a','demo:t']);
});

test('connectivity fast exit does not bypass complete graph validation', () => {
  const graph={nodes:['demo:s','demo:a','demo:t'],edges:[
    {from:'demo:s',to:'demo:a',similarity:0.9},
    {from:'demo:s',to:'demo:a',similarity:0.8}
  ]};
  assert.throws(()=>findBridgeRoute(graph,'demo:s','demo:t'), /duplicate undirected edge/);
  assert.throws(()=>findBridgeRoute({nodes:graph.nodes,edges:[{from:'demo:s',to:'demo:a',similarity:NaN}]},'demo:s','demo:t'), /similarity/);
});

test('synthetic preview retains evidence partitions when terminal is isolated', () => {
  const catalog=[
    {id:'demo:s',mechanics:['combat'],themes:['fantasy'],platforms:['linux'],coop:true},
    {id:'demo:a',mechanics:['combat'],themes:['fantasy'],platforms:['linux'],coop:true},
    {id:'demo:b',mechanics:['combat'],themes:['fantasy'],platforms:['linux'],coop:true},
    {id:'demo:t',mechanics:['puzzle'],themes:['space'],platforms:['linux'],coop:true}
  ];
  const result=buildBridgePreview({catalog,snapshotId:'synthetic-test',startId:'demo:s',endId:'demo:t',minSimilarity:0.1,maxHops:8});
  assert.equal(result.status,'no-route');
  assert.equal(result.edge_count,3);
  assert.deepEqual(result.pair_evidence,{insufficient:0,zero_support:3,below_threshold:0,connected:3});
});
