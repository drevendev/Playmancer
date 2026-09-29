import assert from "node:assert/strict";
import test from "node:test";
import { blendCandidates, rankCandidates } from "../src/ranking.js";

const candidate = (id, affinities, evidenceCoverage = 1, hardConstraintState = "pass") => ({
  id,
  affinities,
  evidenceCoverage,
  hardConstraintState,
});

test("no eligible candidates never relax hard constraints", () => {
  const result = rankCandidates([
    candidate("fail", { s1: 1 }, 1, "fail"),
    candidate("unknown", { s1: 1 }, 1, "unknown"),
    candidate("s1", { s1: 1 }, 1, "pass"),
  ], [{ id: "s1", weight: 1 }], { mode: "intersection" });

  assert.deepEqual(result.ranked, []);
  assert.deepEqual(result.uncertain.map((item) => item.id), ["unknown"]);
  assert.deepEqual(result.excluded.map((item) => item.id), ["fail", "s1"]);
});

test("conflicting seeds do not fall back from Intersection to Union", () => {
  const result = rankCandidates([
    candidate("specialist-a", { a: 0.99, b: 0.01 }),
    candidate("specialist-b", { a: 0.01, b: 0.99 }),
    candidate("balanced-low", { a: 0.12, b: 0.12 }),
  ], [
    { id: "a", weight: 1 },
    { id: "b", weight: 1 },
  ], { mode: "intersection" });

  assert.equal(result.ranked[0].id, "balanced-low");
  assert.ok(result.ranked[0].scores.intersection < 0.13);
  assert.equal(result.ranked.find((item) => item.id === "specialist-a").scores.union, 0.99);
});

test("explicit seed weights can flip arithmetic ordering predictably", () => {
  const candidates = [
    candidate("likes-a", { a: 0.9, b: 0.2 }),
    candidate("likes-b", { a: 0.2, b: 0.9 }),
  ];

  const favorA = rankCandidates(candidates, [
    { id: "a", weight: 4 },
    { id: "b", weight: 1 },
  ], { mode: "arithmetic" });

  const favorB = rankCandidates(candidates, [
    { id: "a", weight: 1 },
    { id: "b", weight: 4 },
  ], { mode: "arithmetic" });

  assert.equal(favorA.ranked[0].id, "likes-a");
  assert.equal(favorB.ranked[0].id, "likes-b");
});

test("catalog add/remove revisions are deterministic and stateless", () => {
  const seeds = [{ id: "s1", weight: 1 }];
  const base = [
    candidate("a", { s1: 0.8 }),
    candidate("b", { s1: 0.7 }),
  ];

  const before = rankCandidates(base, seeds, { mode: "arithmetic" }).ranked.map((item) => item.id);
  const added = rankCandidates([...base, candidate("c", { s1: 0.9 })], seeds, { mode: "arithmetic" })
    .ranked.map((item) => item.id);
  const restored = rankCandidates(base, seeds, { mode: "arithmetic" }).ranked.map((item) => item.id);

  assert.deepEqual(before, ["a", "b"]);
  assert.deepEqual(added, ["c", "a", "b"]);
  assert.deepEqual(restored, ["a", "b"]);
});

test("one-seed Blend reduces to the ordinary arithmetic ranked list", () => {
  const candidates = [
    candidate("a", { s1: 0.8 }, 0.9),
    candidate("b", { s1: 0.8 }, 1.0),
    candidate("c", { s1: 0.7 }, 1.0),
  ];
  const seeds = [{ id: "s1", weight: 3 }];

  const scalar = rankCandidates(candidates, seeds, { mode: "arithmetic" }).ranked.map((item) => item.id);
  const blend = blendCandidates(candidates, seeds, { lambda: 0.17, limit: 3 }).ranked.map((item) => item.id);

  assert.deepEqual(blend, scalar);
});
