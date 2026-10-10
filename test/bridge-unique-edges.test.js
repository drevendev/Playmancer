import assert from "node:assert/strict";
import test from "node:test";
import { findBridgeRoute } from "../src/bridge.js";

const edge = (from, to, featureChanges) => ({ from, to, similarity: 0.8, featureChanges });

test("Bridge rejects parallel undirected edges with conflicting explanation metadata", () => {
  const edges = [edge("game:a", "game:b", ["combat"]), edge("game:b", "game:a", ["crafting"])];
  for (const order of [edges, [...edges].reverse()]) {
    assert.throws(() => findBridgeRoute({ nodes: ["game:a", "game:b"], edges: order }, "game:a", "game:b"),
      /duplicate undirected edge/);
  }
});

test("Bridge rejects repeated identical edges rather than allowing silent double-counted provenance", () => {
  const repeated = [edge("game:a", "game:b", ["combat"]), edge("game:a", "game:b", ["combat"])];
  assert.throws(() => findBridgeRoute({ nodes: ["game:a", "game:b"], edges: repeated }, "game:a", "game:b"),
    /duplicate undirected edge/);
});

test("Bridge edge identity does not collide for IDs containing punctuation or control delimiters", () => {
  const nodes = ["a", "b\u0000c", "a\u0000b", "c"];
  const edges = [edge("a", "b\u0000c", ["one"]), edge("a\u0000b", "c", ["two"])];
  assert.equal(findBridgeRoute({ nodes, edges }, "a", "b\u0000c").status, "route");
  assert.equal(findBridgeRoute({ nodes, edges }, "a\u0000b", "c").status, "route");
});

test("permuting valid distinct edges preserves route, score and feature-change evidence", () => {
  const nodes = ["game:a", "game:b", "game:c", "game:d"];
  const edges = [
    { from: "game:a", to: "game:b", similarity: 0.95, featureChanges: ["combat"] },
    { from: "game:b", to: "game:c", similarity: 0.95, featureChanges: ["crafting"] },
    { from: "game:a", to: "game:c", similarity: 0.10, featureChanges: ["far"] },
    { from: "game:b", to: "game:d", similarity: 0.50, featureChanges: ["story"] },
  ];
  const graph = { nodes, edges };
  const first = findBridgeRoute(graph, "game:a", "game:c");
  for (const permuted of [[...edges].reverse(), [edges[2], edges[0], edges[3], edges[1]]]) {
    assert.deepEqual(findBridgeRoute({ nodes, edges: permuted }, "game:a", "game:c"), first);
  }
  assert.deepEqual(first.edges.map((item) => item.featureChanges), [["combat"], ["crafting"]]);
});
