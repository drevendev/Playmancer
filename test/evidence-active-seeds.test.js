import test from "node:test";
import assert from "node:assert/strict";
import { prepareEvidenceModel, rankEvidenceBasket } from "../src/evidence-similarity.js";

const source = "authored-regression-fixture";
function game(id, tags = [{ id: "mechanic:building", weight: 1, source }]) {
  return {
    id,
    tags,
    metadata: tags === null ? {} : { platforms: { value: ["windows"], source } },
    coop: null,
  };
}

const model = prepareEvidenceModel({
  games: [
    game("demo:a"),
    game("demo:b"),
    game("demo:c"),
    game("demo:unknown", null),
  ],
});

test("zero-weight and duplicate input seeds do not dilute evidence coverage or duplicate explanations", () => {
  const canonical = [{ id: "demo:a", weight: 2 }, { id: "demo:b", weight: 1 }];
  const withZero = [...canonical, { id: "demo:unknown", weight: 0 }];
  const withDuplicate = [
    { id: "demo:a", weight: 1 },
    { id: "demo:a", weight: 1 },
    { id: "demo:b", weight: 1 },
  ];

  for (const mode of ["intersection", "blend"]) {
    for (const platform of ["any", "windows"]) {
      const options = { mode, platform, limit: 5 };
      const expected = rankEvidenceBasket(model, { ...options, seeds: canonical });
      const zero = rankEvidenceBasket(model, { ...options, seeds: withZero });
      const duplicate = rankEvidenceBasket(model, { ...options, seeds: withDuplicate });

      // Includes ranked, uncertain and excluded partitions, seed weights,
      // coverage, and detailed evidence, not just the leading game IDs.
      assert.deepEqual(zero, expected, `zero-weight seed changed ${mode}/${platform}`);
      assert.deepEqual(duplicate, expected, `duplicate seed changed ${mode}/${platform}`);

      const candidate = expected.ranked.find(item => item.id === "demo:c");
      assert.ok(candidate, "the known candidate should be rankable");
      assert.ok(candidate.evidenceCoverage > 0.75, "coverage must ignore an inactive unknown profile");
      assert.deepEqual(candidate.evidence.map(pair => pair.seedId), ["demo:a", "demo:b"]);
      assert.equal(new Set(candidate.evidence.map(pair => pair.seedId)).size, 2);
      assert.ok(expected.uncertain.some(item => item.id === "demo:unknown"),
        "missing source evidence remains uncertain, not excluded by a zero-weight seed");
    }
  }
});

test("an entirely zero-weight basket must fail rather than invent an effective favorite", () => {
  assert.throws(() => rankEvidenceBasket(model, {
    seeds: [{ id: "demo:a", weight: 0 }],
  }), /at least one seed must have positive weight/);
});
