import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBridgeRoute } from '../src/bridge.js';

// Deterministic differential regression for arbitrary IDs, including delimiters.
// A separate generic 2,000-graph oracle already covers ordinary game IDs.
const IDS = ['a', 'b', 'c', 'z', 'a\0b', 'a\0b\0c', 'Ω', '😸'];
let state = 0x12345678;
function random() {
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return (state >>> 0) / 0x100000000;
}
function pathOrder(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return a.length - b.length;
}
function oracle(nodes, edges, start, end, maxHops) {
  const adjacency = new Map(nodes.map(id => [id, []]));
  for (const { from, to, similarity } of edges) {
    const cost = Math.round(4 * (1 - similarity));
    adjacency.get(from).push([to, cost]);
    adjacency.get(to).push([from, cost]);
  }
  const candidates = [];
  function visit(node, path, cost) {
    if (node === end) { candidates.push({path, cost}); return; }
    if (path.length > maxHops) return;
    for (const [next, edgeCost] of adjacency.get(node)) {
      if (!path.includes(next)) visit(next, [...path, next], cost + edgeCost);
    }
  }
  visit(start, [start], 0);
  candidates.sort((a, b) => a.cost - b.cost || a.path.length - b.path.length || pathOrder(a.path, b.path));
  return candidates[0] ?? null;
}

test('control-delimiter and Unicode IDs preserve deterministic exact-cost routes', () => {
  for (let caseNumber = 0; caseNumber < 1500; caseNumber++) {
    const ids = [...IDS];
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const count = 4 + Math.floor(random() * 4);
    const nodes = ids.slice(0, count);
    const edges = [];
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
      if (random() < .44) {
        const similarity = Math.floor(random() * 5) / 4;
        edges.push({ from: nodes[i], to: nodes[j], similarity });
      }
    }
    const start = nodes[0], end = nodes[count - 1];
    const maxHops = 1 + Math.floor(random() * (count - 1));
    const expected = oracle(nodes, edges, start, end, maxHops);
    const actual = findBridgeRoute({nodes, edges}, start, end, {maxHops});
    assert.equal(actual.status === 'route', expected !== null, 'case ' + caseNumber);
    if (expected) {
      assert.deepEqual(actual.nodes, expected.path, 'case ' + caseNumber);
      assert.equal(actual.totalCost, expected.cost / 4, 'cost ' + caseNumber);
    }
    const reversed = findBridgeRoute({nodes: [...nodes].reverse(), edges: [...edges].reverse()},
      start, end, {maxHops});
    assert.equal(reversed.status, actual.status, 'reverse ' + caseNumber);
    if (expected) assert.deepEqual(reversed.nodes, expected.path, 'reverse ' + caseNumber);
  }
});
