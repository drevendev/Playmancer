import test from 'node:test';
import assert from 'node:assert/strict';
import { findBridgeRoute } from '../src/bridge.js';

// Regression for distinct sub-picosecond route costs: the earlier 1e-12
// integer-quantized candidate incorrectly chose the lexicographically smaller,
// *more expensive* route, conflating actual non-equal costs.
const graph = { nodes: ['demo:s','demo:a','demo:b','demo:t'], edges: [
  { from:'demo:s',to:'demo:a',similarity:0.5 },
  { from:'demo:a',to:'demo:t',similarity:0.4999999999996 },
  { from:'demo:s',to:'demo:b',similarity:0.5 },
  { from:'demo:b',to:'demo:t',similarity:0.5 },
]};
for (const edges of [graph.edges, [...graph.edges].reverse()]) {
  test(`distinct costs remain ordered, input ${edges === graph.edges ? 'forward' : 'reverse'}`, () => {
    const route = findBridgeRoute({ ...graph, edges },'demo:s','demo:t',{maxHops:2});
    assert.equal(route.status,'route');
    assert.deepEqual(route.nodes, ['demo:s','demo:b','demo:t']);
    assert.equal(route.totalCost,1);
  });
}

// Use one 1e-20-scale decimal component to expose any fixed quantization.
test('tiny positive decimal costs survive without rounding to a zero-cost tie',()=>{
  const g={nodes:['demo:s','demo:a','demo:b','demo:t'],edges:[
    {from:'demo:s',to:'demo:a',similarity:1},
    {from:'demo:a',to:'demo:t',similarity:0.9999999999999999},
    {from:'demo:s',to:'demo:b',similarity:1},
    {from:'demo:b',to:'demo:t',similarity:1}
  ]};
  const r=findBridgeRoute(g,'demo:s','demo:t',{maxHops:2});
  assert.deepEqual(r.nodes,['demo:s','demo:b','demo:t']);
  assert.equal(r.totalCost,0);
});
