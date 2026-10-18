import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSeeds, scoreCandidate, blendCandidates } from "../src/ranking.js";

const close = (actual, expected) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) < 1e-12,
  `expected ${expected}, got ${actual}`,
);
const byId = (normalized) => Object.fromEntries(normalized.map((seed) => [seed.id, seed.weight]));
const game = { id: "candidate", evidenceCoverage: 1, affinities: { A: 0.8, B: 0.2 } };

// The public demo limits weights to integers 1–10. This separately verifies the
// exported ranking core's documented finite, non-negative input contract.
test("two huge finite weights retain equal proportions and finite scores", () => {
  const seeds = [{ id: "A", weight: 1e308 }, { id: "B", weight: 1e308 }];
  const values = byId(normalizeSeeds(seeds));
  close(values.A, 0.5);
  close(values.B, 0.5);
  const scores = scoreCandidate(game, seeds).scores;
  for (const value of Object.values(scores)) {
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, String(value));
  }
  close(scores.arithmetic, 0.5);
  close(scores.intersection, 0.32);
  const blended = blendCandidates([game], seeds, { lambda: 0.3 });
  assert.equal(blended.ranked.length, 1);
  assert.ok(Number.isFinite(blended.ranked[0].blend.objective));
});

test("duplicates are scaled before merging, not overflowed", () => {
  const values = byId(normalizeSeeds([
    { id: "A", weight: 1e308 }, { id: "A", weight: 1e308 },
    { id: "B", weight: 1e308 },
  ]));
  close(values.A, 2 / 3);
  close(values.B, 1 / 3);
});

test("maximum finite and smallest subnormal weights normalize", () => {
  for (const weight of [Number.MAX_VALUE, Number.MIN_VALUE]) {
    const result = normalizeSeeds(Array.from({ length: 5 }, (_, i) => ({ id: `seed:${i}`, weight })));
    assert.equal(result.length, 5);
    for (const value of result) close(value.weight, 0.2);
  }
});

test("invalid and all-zero weights remain errors", () => {
  for (const weight of [-1, NaN, Infinity, -Infinity]) {
    assert.throws(() => normalizeSeeds([{ id: "A", weight }]), RangeError);
  }
  assert.throws(() => normalizeSeeds([{ id: "A", weight: 0 }]), RangeError);
});

test("2,000 deterministic varied-exponent baskets preserve finite normalized total", () => {
  let state = 0x5eeda11;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  for (let iteration = 0; iteration < 2000; iteration++) {
    const count = 1 + Math.floor(random() * 5);
    const seeds = [];
    for (let i = 0; i < count; i++) {
      const exponent = Math.floor(random() * 617) - 308;
      const weight = iteration < 1000 ? 1 + Math.floor(random() * 10) : 10 ** exponent;
      seeds.push({ id: `seed:${Math.floor(random() * 4)}`, weight });
    }
    const normalized = normalizeSeeds(seeds);
    close(normalized.reduce((total, seed) => total + seed.weight, 0), 1);
    if (iteration < 1000) {
      const total = seeds.reduce((sum, seed) => sum + seed.weight, 0);
      const expected = new Map();
      for (const seed of seeds) expected.set(seed.id, (expected.get(seed.id) ?? 0) + seed.weight);
      for (const seed of normalized) close(seed.weight, expected.get(seed.id) / total);
    }
  }
});
