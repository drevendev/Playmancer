import test from "node:test";
import assert from "node:assert/strict";
import { prepareEvidenceModel, compareEvidenceGames } from "../src/evidence-similarity.js";

const source = "authored-fixture";
const profile = id => ({
  id,
  tags: [{ id: "mechanic:puzzle", weight: 1, source }],
  metadata: {},
  coop: null,
});

test("a misspelled coverage key must not turn selected facts into complete evidence", () => {
  const game = profile("fixture:selected");
  assert.throws(() => prepareEvidenceModel({
    games: [{ ...game, tagCoverge: "partial" }],
  }), /unknown game field: tagCoverge/);
  assert.throws(() => prepareEvidenceModel({
    games: [{ ...game, tagcoverage: "partial" }],
  }), /unknown game field: tagcoverage/);
  assert.throws(() => prepareEvidenceModel({
    games: [{ ...profile("fixture:unknown"), tags: null, tagCoverge: "complete" }],
  }), /unknown game field: tagCoverge/);

  const explicitlyPartial = { ...game, tagCoverage: "partial" };
  const model = prepareEvidenceModel({
    games: [explicitlyPartial, profile("fixture:complete")],
  });
  const pair = compareEvidenceGames(model, "fixture:selected", "fixture:complete");
  assert.equal(pair.status, "uncertain");
  assert.equal(pair.affinity, null);
  assert.equal(pair.tags.coverage, "partial");
  assert.equal(pair.tags.observedOverlap, 1);
});

test("misspelled or unsupported game and tag fields fail closed", () => {
  const game = profile("fixture:game");
  assert.throws(() => prepareEvidenceModel({
    games: [{ ...game, coOp: true }],
  }), /unknown game field: coOp/);
  assert.throws(() => prepareEvidenceModel({
    games: [{ ...game, tags: [{ ...game.tags[0], confidnce: 0.95 }] }],
  }), /unknown fixture:game\.tag field: confidnce/);
  assert.throws(() => prepareEvidenceModel({
    games: [{ ...game, tags: [{ ...game.tags[0], complete: true }] }],
  }), /unknown fixture:game\.tag field: complete/);
});

test("existing explicit and legacy fictional vectors keep their scoring behavior", () => {
  const a = profile("fixture:a");
  const b = { ...profile("fixture:b"), tagCoverage: "complete" };
  const model = prepareEvidenceModel({ games: [a, b] });
  assert.equal(model.profiles.get(a.id).tagCoverage, "complete");
  assert.equal(model.profiles.get(b.id).tagCoverage, "complete");
  const pair = compareEvidenceGames(model, a.id, b.id);
  assert.equal(pair.status, "rankable");
  assert.equal(pair.tags.similarity, 1);
});
