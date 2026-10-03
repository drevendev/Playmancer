import assert from "node:assert/strict";
import test from "node:test";
import { blendCandidates, normalizeSeeds, rankCandidates, scoreCandidate } from "../src/ranking.js";

const EPSILON = 1e-12;
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < EPSILON, `${actual} != ${expected}`);

const equalSeeds = [
  { id: "igdb:1", weight: 1 },
  { id: "igdb:2", weight: 1 },
  { id: "igdb:3", weight: 1 },
];

const candidate = (id, affinities, evidenceCoverage = 1, hardConstraintState = "pass") => ({
  id,
  affinities,
  evidenceCoverage,
  hardConstraintState,
});

test("duplicate seeds collapse and normalize deterministically", () => {
  assert.deepEqual(
    normalizeSeeds([
      { id: "igdb:2", weight: 3 },
      { id: "igdb:1", weight: 1 },
      { id: "igdb:1", weight: 2 },
      { id: "igdb:3", weight: 0 },
    ]),
    [
      { id: "igdb:1", weight: 0.5 },
      { id: "igdb:2", weight: 0.5 },
    ],
  );
});

test("one-seed scalar modes are equivalent", () => {
  const result = scoreCandidate(candidate("igdb:9", { "igdb:1": 0.73 }), [{ id: "igdb:1", weight: 5 }]);
  assert.equal(result.status, "rankable");
  for (const mode of ["union", "arithmetic", "leastMisery", "intersection"]) {
    close(result.scores[mode], 0.73);
  }
});

test("P03 synthetic example preserves distinct union, arithmetic, and intersection semantics", () => {
  const candidates = [
    candidate("balanced", { "igdb:1": 0.65, "igdb:2": 0.65, "igdb:3": 0.65 }),
    candidate("mixed", { "igdb:1": 0.75, "igdb:2": 0.55, "igdb:3": 0.20 }),
    candidate("s1", { "igdb:1": 0.95, "igdb:2": 0.15, "igdb:3": 0.15 }),
  ];
  const balanced = scoreCandidate(candidates[0], equalSeeds);
  const mixed = scoreCandidate(candidates[1], equalSeeds);
  close(balanced.scores.union, 0.65);
  close(balanced.scores.arithmetic, 0.65);
  close(balanced.scores.intersection, 0.65);
  close(mixed.scores.union, 0.75);
  close(mixed.scores.arithmetic, 0.5);
  close(mixed.scores.intersection, 1 / ((1 / 3) / 0.75 + (1 / 3) / 0.55 + (1 / 3) / 0.20));
  assert.equal(rankCandidates(candidates, equalSeeds, { mode: "intersection" }).ranked[0].id, "balanced");
  assert.equal(rankCandidates(candidates, equalSeeds, { mode: "union" }).ranked[0].id, "s1");
});

test("zero affinity to any positively weighted seed makes harmonic intersection zero", () => {
  const result = scoreCandidate(candidate("igdb:9", { "igdb:1": 1, "igdb:2": 0 }), [
    { id: "igdb:1", weight: 1 },
    { id: "igdb:2", weight: 1 },
  ]);
  assert.equal(result.scores.intersection, 0);
});

test("hard-constraint fail and unknown are separated and never silently relaxed", () => {
  const candidates = [
    candidate("fail", { "igdb:1": 1 }, 1, "fail"),
    candidate("unknown", { "igdb:1": 1 }, 1, "unknown"),
    candidate("pass", { "igdb:1": 0.5 }, 1, "pass"),
  ];
  const result = rankCandidates(candidates, [{ id: "igdb:1", weight: 1 }]);
  assert.deepEqual(result.ranked.map((item) => item.id), ["pass"]);
  assert.deepEqual(result.uncertain.map((item) => [item.id, item.reason]), [["unknown", "hard-constraint-unknown"]]);
  assert.deepEqual(result.excluded.map((item) => [item.id, item.reason]), [["fail", "hard-constraint-fail"]]);
});

test("missing per-seed affinity stays uncertain rather than becoming zero", () => {
  const result = rankCandidates([
    candidate("sparse", { "igdb:1": 0.9 }, 0.5),
    candidate("complete", { "igdb:1": 0.5, "igdb:2": 0.5 }, 0.8),
  ], [
    { id: "igdb:1", weight: 1 },
    { id: "igdb:2", weight: 1 },
  ]);
  assert.deepEqual(result.ranked.map((item) => item.id), ["complete"]);
  assert.equal(result.uncertain[0].reason, "missing-seed-affinity");
  assert.deepEqual(result.uncertain[0].missingSeedIds, ["igdb:2"]);
});

test("scalar ties use evidence coverage then canonical id", () => {
  const result = rankCandidates([
    candidate("igdb:z", { "igdb:1": 0.5 }, 0.8),
    candidate("igdb:b", { "igdb:1": 0.5 }, 0.9),
    candidate("igdb:a", { "igdb:1": 0.5 }, 0.9),
  ], [{ id: "igdb:1", weight: 1 }], { mode: "arithmetic" });
  assert.deepEqual(result.ranked.map((item) => item.id), ["igdb:a", "igdb:b", "igdb:z"]);
});

test("exact seed ids are excluded from next-game results", () => {
  const result = rankCandidates([
    candidate("igdb:1", { "igdb:1": 1 }, 1),
    candidate("igdb:2", { "igdb:1": 0.8 }, 1),
  ], [{ id: "igdb:1", weight: 1 }]);
  assert.deepEqual(result.ranked.map((item) => item.id), ["igdb:2"]);
  assert.deepEqual(result.excluded.map((item) => [item.id, item.reason]), [["igdb:1", "seed"]]);
});

test("Blend first selects the balanced candidate then adds distinct uncovered strands deterministically", () => {
  const result = blendCandidates([
    candidate("balanced", { "igdb:1": 0.65, "igdb:2": 0.65, "igdb:3": 0.65 }),
    candidate("s1", { "igdb:1": 0.95, "igdb:2": 0.15, "igdb:3": 0.15 }),
    candidate("s2", { "igdb:1": 0.15, "igdb:2": 0.95, "igdb:3": 0.15 }),
    candidate("s3", { "igdb:1": 0.15, "igdb:2": 0.15, "igdb:3": 0.95 }),
  ], equalSeeds, { lambda: 0.30, limit: 4 });
  assert.deepEqual(result.ranked.map((item) => item.id), ["balanced", "s1", "s2", "s3"]);
  close(result.ranked[0].blend.objective, 0.65);
  close(result.ranked[1].blend.gain, 0.1);
});

test("malformed scores and Blend parameters fail fast", () => {
  assert.throws(() => scoreCandidate(candidate("igdb:9", { "igdb:1": 1.1 }), [{ id: "igdb:1", weight: 1 }]), RangeError);
  assert.throws(() => blendCandidates([], [{ id: "igdb:1", weight: 1 }], { lambda: -0.01 }), RangeError);
  assert.throws(() => normalizeSeeds([{ id: "igdb:1", weight: -1 }]), RangeError);
});
