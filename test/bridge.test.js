import assert from "node:assert/strict";
import test from "node:test";
import { findBridgeRoute } from "../src/bridge.js";

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test("Bridge chooses the lowest feature-derived route and preserves hop evidence", () => {
  const result = findBridgeRoute({
    nodes: ["game:a", "game:b", "game:c"],
    edges: [
      { from: "game:a", to: "game:b", similarity: 0.9, featureChanges: ["pace"] },
      { from: "game:b", to: "game:c", similarity: 0.8, featureChanges: ["theme"] },
      { from: "game:a", to: "game:c", similarity: 0.4, featureChanges: ["large jump"] },
    ],
  }, "game:a", "game:c");

  assert.equal(result.status, "route");
  assert.deepEqual(result.nodes, ["game:a", "game:b", "game:c"]);
  assert.equal(result.hops, 2);
  close(result.totalCost, 0.3);
  close(result.maxHopCost, 0.2);
  assert.deepEqual(result.edges.map((edge) => edge.featureChanges), [["pace"], ["theme"]]);
});

test("disconnected endpoints return an explicit no-route result", () => {
  const result = findBridgeRoute({
    nodes: ["game:a", "game:b", "game:c"],
    edges: [{ from: "game:a", to: "game:b", similarity: 0.9 }],
  }, "game:a", "game:c");

  assert.deepEqual(result, {
    status: "no-route",
    reason: "disconnected-or-hop-bound",
    startId: "game:a",
    endId: "game:c",
    maxHops: 8,
  });
});

test("equal-cost alternatives use deterministic canonical path ordering", () => {
  const result = findBridgeRoute({
    nodes: ["game:a", "game:b", "game:c", "game:d"],
    edges: [
      { from: "game:a", to: "game:b", similarity: 0.8 },
      { from: "game:b", to: "game:d", similarity: 0.8 },
      { from: "game:a", to: "game:c", similarity: 0.8 },
      { from: "game:c", to: "game:d", similarity: 0.8 },
    ],
  }, "game:a", "game:d");

  assert.deepEqual(result.nodes, ["game:a", "game:b", "game:d"]);
});

test("2-D coordinates never affect Bridge route selection", () => {
  const edges = [
    { from: "game:a", to: "game:b", similarity: 0.9 },
    { from: "game:b", to: "game:c", similarity: 0.9 },
    { from: "game:a", to: "game:c", similarity: 0.1 },
  ];

  const first = findBridgeRoute({
    nodes: [
      { id: "game:a", x: 0, y: 0 },
      { id: "game:b", x: 1000, y: 1000 },
      { id: "game:c", x: -1000, y: -1000 },
    ],
    edges,
  }, "game:a", "game:c");

  const second = findBridgeRoute({
    nodes: [
      { id: "game:a", x: 9999, y: -9999 },
      { id: "game:b", x: 0, y: 0 },
      { id: "game:c", x: 1, y: 1 },
    ],
    edges,
  }, "game:a", "game:c");

  assert.deepEqual(first.nodes, ["game:a", "game:b", "game:c"]);
  assert.deepEqual(second.nodes, first.nodes);
  close(second.totalCost, first.totalCost);
});

test("maxHops is a hard route bound rather than a request to invent a shortcut", () => {
  const graph = {
    nodes: ["game:a", "game:b", "game:c"],
    edges: [
      { from: "game:a", to: "game:b", similarity: 0.9 },
      { from: "game:b", to: "game:c", similarity: 0.9 },
    ],
  };

  assert.equal(findBridgeRoute(graph, "game:a", "game:c", { maxHops: 1 }).status, "no-route");
  assert.deepEqual(findBridgeRoute(graph, "game:a", "game:c", { maxHops: 2 }).nodes, ["game:a", "game:b", "game:c"]);
});
