import assert from "node:assert/strict";
import test from "node:test";
import { findBridgeRoute } from "../src/bridge.js";

test("huge exact rational evidence cannot contradict the displayed edge", () => {
  const giant = 10n ** 400n;
  const edge = { from: "s", to: "t", similarity: 0.25,
    exactSimilarity: { numerator: giant, denominator: giant } };
  const graph = { nodes: ["s", "t"], edges: [edge] };
  assert.throws(() => findBridgeRoute(graph, "s", "t", { maxHops: 1 }),
    /agree with displayed similarity/);
  const valid = { ...edge, similarity: 1 };
  assert.deepEqual(findBridgeRoute({ ...graph, edges: [valid] }, "s", "t",
    { maxHops: 1 }).nodes, ["s", "t"]);
});

test("lexical tie order compares complete IDs despite embedded separators", () => {
  // Both three-edge routes cost exactly 1.0, and their joined sentinel
  // encodings collide. The path via "a" is lexicographically first.
  const nodes = ["s", "a\u0000b", "c", "a", "b\u0000c", "t"];
  const edges = [
    { from: "s", to: "a\u0000b", similarity: 0.9 },
    { from: "a\u0000b", to: "c", similarity: 0.9 },
    { from: "c", to: "t", similarity: 0.2 },
    { from: "s", to: "a", similarity: 0.7 },
    { from: "a", to: "b\u0000c", similarity: 0.7 },
    { from: "b\u0000c", to: "t", similarity: 0.6 },
  ];
  const expected = ["s", "a", "b\u0000c", "t"];
  for (const [nodeOrder, edgeOrder] of [
    [nodes, edges], [[...nodes].reverse(), edges],
    [nodes, [...edges].reverse()], [[...nodes].reverse(), [...edges].reverse()]
  ]) {
    assert.deepEqual(findBridgeRoute({ nodes: nodeOrder, edges: edgeOrder },
      "s", "t", { maxHops: 3 }).nodes, expected);
  }
});


test('denominator-only Number overflow preserves valid exact evidence', () => {
  const numerator = 10n ** 308n;
  const denominator = 10n ** 309n;
  const graph = { nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b',
    similarity: 0.1, exactSimilarity: { numerator, denominator } }] };
  assert.deepEqual(findBridgeRoute(graph, 'a', 'b').nodes, ['a', 'b']);
  assert.throws(() => findBridgeRoute({ ...graph, edges: [{ ...graph.edges[0], similarity: 0 }] }, 'a', 'b'), /must agree/);
});

test('huge valid ratios retain exact ordering and bounded tolerance', () => {
  const denominator = 10n ** 400n;
  const graph = { nodes: ['a', 'b'], edges: [{ from: 'a', to: 'b',
    similarity: 0.5, exactSimilarity: { numerator: denominator / 2n, denominator } }] };
  assert.deepEqual(findBridgeRoute(graph, 'a', 'b').nodes, ['a', 'b']);
  assert.throws(() => findBridgeRoute({ ...graph, edges: [{ ...graph.edges[0], similarity: 0.50001 }] }, 'a', 'b'), /must agree/);
});
