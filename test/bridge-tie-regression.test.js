import test from 'node:test';
import assert from 'node:assert/strict';
import { findBridgeRoute } from '../src/bridge.js';

// Two routes have equal mathematical cost and hop count. Binary floating-point
// accumulates the prefixes as 1.2000000000000002 and 1.2, respectively.
// The route contract's lexicographic tie-break should select the c path.
const nodes = ['demo:a','demo:b','demo:c','demo:d','demo:f'];
const edges = [
  {from:'demo:a',to:'demo:c',similarity:0.6},
  {from:'demo:a',to:'demo:d',similarity:0},
  {from:'demo:c',to:'demo:f',similarity:0.2},
  {from:'demo:d',to:'demo:f',similarity:0.8},
  {from:'demo:f',to:'demo:b',similarity:0.2},
];
for (const order of [edges, [...edges].reverse()]) {
  test(`feature graph tie is stable for ${order===edges?'forward':'reverse'} edge order`, () => {
    const route = findBridgeRoute({nodes,edges:order},'demo:a','demo:b',{maxHops:3});
    assert.equal(route.status,'route');
    assert.deepEqual(route.nodes, ['demo:a','demo:c','demo:f','demo:b']);
    assert.equal(route.totalCost, 2);
  });
}
