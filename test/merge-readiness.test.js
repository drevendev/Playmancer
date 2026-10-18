import assert from "node:assert/strict";
import test from "node:test";
import { blendCandidates, normalizeSeeds, rankCandidates } from "../src/ranking.js";

const seeds = [
  { id: "seed:ä", weight: 1e308 },
  { id: "seed:z", weight: 1e308 },
];
const item = (id, coverage = 0.9, a = 0.65, z = 0.65) => ({
  id, evidenceCoverage: coverage,
  affinities: { "seed:ä": a, "seed:z": z },
});
const ids = (items) => items.map(({ id }) => id);

test("PR #3 combined repair: huge weights and locale-independent ties survive Blend endpoints", () => {
  const candidates = [item("game:ä"), item("game:z"), item("game:low", 0.5)];
  assert.deepEqual(normalizeSeeds(seeds), [
    { id: "seed:z", weight: 0.5 },
    { id: "seed:ä", weight: 0.5 },
  ]);
  const canonical = ["game:z", "game:ä", "game:low"];
  for (const mode of ["intersection", "arithmetic", "leastMisery", "union"]) {
    assert.deepEqual(ids(rankCandidates(candidates, seeds, { mode }).ranked), canonical);
  }
  for (const lambda of [0, 0.5, 1]) {
    assert.deepEqual(ids(blendCandidates(candidates, seeds, { lambda }).ranked), canonical);
  }
  assert.deepEqual(ids(blendCandidates([...candidates].reverse(), seeds, { lambda: 1 }).ranked), canonical);
});

test("lambda=1 uses the arithmetic tie-breaker without consuming evidence gain", () => {
  const candidates = [
    item("game:A", 0.2, 0.7, 0.7),
    item("game:B", 0.99, 0.7, 0.7),
    item("game:C", 0.5, 0.7, 0.7),
  ];
  const expected = ids(rankCandidates(candidates, seeds, { mode: "arithmetic" }).ranked);
  assert.deepEqual(expected, ["game:B", "game:C", "game:A"]);
  assert.deepEqual(ids(blendCandidates(candidates, seeds, { lambda: 1 }).ranked), expected);
  assert.deepEqual(ids(blendCandidates(candidates.reverse(), seeds, { lambda: 1 }).ranked), expected);
});
