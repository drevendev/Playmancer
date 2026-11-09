import test from "node:test";
import assert from "node:assert/strict";
import { prepareEvidenceModel, compareEvidenceGames, rankEvidenceBasket,
  EVIDENCE_METHOD_VERSION } from "../src/evidence-similarity.js";
const tag = (id, weight, source = "authored-fixture") => ({ id, weight, source });
const field = value => ({ value, source: "authored-fixture" });
const a = { id: "demo:a", tags: [tag("genre:rpg", 0.7), tag("mood:cozy", 0.3)],
  metadata: { creator: field("A"), platforms: field(["windows"]) }, coop: true, coopSource: "authored-fixture" };
const b = { id: "demo:b", tags: [tag("genre:rpg", 0.3), tag("mood:cozy", 0.7)],
  metadata: { creator: field("A"), platforms: field(["windows", "linux"]) }, coop: null };
const c = { id: "demo:c", tags: [tag("genre:puzzle", 1)],
  metadata: { creator: field("B"), platforms: field(["linux"]) }, coop: false, coopSource: "authored-fixture" };
const d = { id: "demo:d", tags: [tag("genre:puzzle", 1)], metadata: {}, coop: null };
const model = (games = [a, b, c, d], relations = []) => prepareEvidenceModel({ games, relations });
const relation = (from, to, strength = 1, type = "similar") =>
  ({ from, to, strength, type, source: "https://example.org/receipt" });
// Evidence lane arithmetic is floating point (0.27 + 0.08 != 0.35 exactly).
// Verify the lane names exactly and each value within a tight numeric tolerance.
function assertCoverageLanes(actual, expected) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const [lane, value] of Object.entries(expected)) {
    assert.ok(Math.abs(actual[lane] - value) < 1e-12,
      `unexpected coverage for ${lane}: ${actual[lane]} vs ${value}`);
  }
}

test("weighted tags allocate exactly one unit per game", () => {
  assert.throws(() => model([{ ...a, tags: [tag("genre:rpg", .4)] }]), /sum to 1/);
  assert.throws(() => model([{ ...a, tags: [tag("genre:rpg", 1), tag("genre:rpg", .1)] }]), /duplicate tag/);
  assert.throws(() => model([{ ...a, tags: [tag("genre:rpg", NaN)] }]), /finite/);
  assert.throws(() => model([{ ...a, tags: [tag("genre:rpg", 1, "")] }]), /source/);
  assert.equal(model().version, EVIDENCE_METHOD_VERSION);
});
test("platform source observations must not disguise missing or noncanonical eligibility", () => {
  for (const value of [[], ["any"], ["Windows"], [" windows"], [""],
    ["windows", "Windows"], ["windows", "windows"], ["x".repeat(33)]]) {
    assert.throws(() => model([{ ...a, metadata: { platforms: field(value) } }]),
      /platforms must be nonempty unique canonical IDs/);
  }
  const canonical = model([{ ...a, metadata: { platforms: field(["windows", "linux"]) } }]);
  assert.deepEqual(canonical.profiles.get(a.id).metadata.platforms.value, ["linux", "windows"]);

  // Unknown platform evidence is different from an asserted empty (known-failing)
  // platform list: the former remains in the strict hard-filter abstention lane.
  const noPlatform = model([a, { ...b, metadata: {} }]);
  const opts = { seeds: [{ id: a.id, weight: 1 }], platform: "windows" };
  const partition = rankEvidenceBasket(noPlatform, opts);
  assert.ok(partition.uncertain.some(item =>
    item.id === b.id && item.reason === "hard-constraint-unknown"));
  for (const platform of ["Windows", " windows", "any ", "", "x".repeat(33)]) {
    assert.throws(() => rankEvidenceBasket(noPlatform, { ...opts, platform }), /invalid hard filters/);
  }
  // Unknown-but-canonical platform keys are allowed, and cannot become passes.
  const unknownPlatform = rankEvidenceBasket(noPlatform, { ...opts, platform: "future-console" });
  assert.ok(unknownPlatform.uncertain.some(item =>
    item.id === b.id && item.reason === "hard-constraint-unknown"));
});

test("weighted mass intersection respects unequal tag weights, not set size", () => {
  const ab = compareEvidenceGames(model(), a.id, b.id);
  assert.equal(ab.status, "rankable");
  assert.ok(Math.abs(ab.tags.similarity - 0.6) < 1e-10);
  assert.equal(ab.metadata.matches.length, 2);
  assert.ok(Math.abs(ab.metadata.coverage - 0.35) < 1e-10);
  assert.ok(ab.affinity > 0 && ab.affinity < 1);
  assert.deepEqual(ab.tags.shared.map(e => e.id), ["genre:rpg", "mood:cozy"]);
  assert.equal(compareEvidenceGames(model(), b.id, a.id).affinity, ab.affinity);
});
test("reports sourced residual weighted mass on both sides including emphasis gaps", () => {
  const pair = compareEvidenceGames(model(), a.id, b.id);
  assert.deepEqual(pair.tags.leftOnly.map(item => item.id), ["genre:rpg"]);
  assert.deepEqual(pair.tags.rightOnly.map(item => item.id), ["mood:cozy"]);
  assert.ok(Math.abs(pair.tags.leftOnly[0].mass - .4) < 1e-12);
  assert.ok(Math.abs(pair.tags.rightOnly[0].mass - .4) < 1e-12);
  assert.equal(pair.tags.leftOnly[0].source, "authored-fixture");
  assert.equal(pair.tags.rightOnly[0].source, "authored-fixture");
  for (const side of ["leftOnly", "rightOnly"]) {
    assert.ok(Math.abs(pair.tags.similarity +
      pair.tags[side].reduce((sum, item) => sum + item.mass, 0) - 1) < 1e-12);
  }
  const disjoint = compareEvidenceGames(model(), a.id, c.id);
  assert.equal(disjoint.tags.similarity, 0);
  for (const side of ["leftOnly", "rightOnly"]) {
    assert.ok(Math.abs(disjoint.tags[side].reduce((sum, item) => sum + item.mass, 0) - 1) < 1e-12);
  }
});
test("missing tags abstain instead of treating missing as a mismatch", () => {
  const m = model([a, { ...b, tags: null }]);
  const pair = compareEvidenceGames(m, a.id, b.id);
  assert.equal(pair.status, "uncertain");
  assert.equal(pair.affinity, null);
  assert.ok(pair.metadata.coverage > 0);
  assert.equal(pair.tags.leftOnly, null);
  assert.equal(pair.tags.rightOnly, null);
});
test("metadata is secondary: same common platform is a weak match", () => {
  const pair = compareEvidenceGames(model(), a.id, c.id);
  assert.equal(pair.tags.similarity, 0);
  assert.equal(pair.metadata.similarity, 0);
  const supported = compareEvidenceGames(model(), a.id, b.id);
  // Creator and shared platform are both independently observed; the platform
  // subweight remains only 0.08 inside the bounded 0.13 metadata lane.
  assert.ok(Math.abs(supported.metadata.similarity - .35) < 1e-12);
  assert.ok(Math.abs(supported.metadata.matches.find(item =>
    item.field === "platforms").contribution - .08) < 1e-12);
  assert.ok(.13 * supported.metadata.similarity < .76 * supported.tags.similarity);
});
test("sourced scalar metadata differences are evidence, never invented platform incompatibility", () => {
  const left = { ...a, metadata: {
    creator: { value: "A", source: "fixture:left-creator" },
    publisher: field("Left Publisher"), releaseYear: field(2020),
    platforms: field(["windows"]),
  } };
  const right = { ...c, metadata: {
    creator: { value: "B", source: "fixture:right-creator" },
    publisher: field("Right Publisher"), releaseYear: field(2021),
    platforms: field(["linux"]),
  } };
  const m = model([left, right]);
  const result = compareEvidenceGames(m, left.id, right.id);
  assert.deepEqual(result.metadata.matches, []);
  assert.equal(result.metadata.similarity, 0);
  assert.deepEqual(result.metadata.recordedDifferences.map(item => item.field),
    ["creator", "publisher", "releaseYear"]);
  assert.deepEqual(result.metadata.recordedDifferences[0], {
    field: "creator",
    left: { value: "A", source: "fixture:left-creator" },
    right: { value: "B", source: "fixture:right-creator" },
  });
  assert.deepEqual(result.metadata.recordedDifferences[2], {
    field: "releaseYear",
    left: { value: 2020, source: "authored-fixture" },
    right: { value: 2021, source: "authored-fixture" },
  });
  const reversed = compareEvidenceGames(m, right.id, left.id);
  assert.deepEqual(reversed.metadata.recordedDifferences[0], {
    field: "creator",
    left: { value: "B", source: "fixture:right-creator" },
    right: { value: "A", source: "fixture:left-creator" },
  });
  assert.equal(reversed.affinity, result.affinity);
  // A pair of positive-only platform lists is NOT a proved difference.
  assert.ok(!result.metadata.recordedDifferences.some(item => item.field === "platforms"));
  // Missing fields must not be reported as observed differences.
  const missing = compareEvidenceGames(model([left, { ...right, metadata: {} }]), left.id, right.id);
  assert.deepEqual(missing.metadata.recordedDifferences, []);
  assert.equal(missing.metadata.similarity, null);
  assert.equal(compareEvidenceGames(model([a,b]), a.id, b.id).metadata.recordedDifferences.length, 0);
});

test("positive platform receipts do not penalize additional documented platforms", () => {
  const seed = { ...a, metadata: { platforms: field(["windows"]) } };
  const narrow = { ...b, metadata: { platforms: field(["windows"]) } };
  const expanded = { ...b, metadata: { platforms: field(["linux", "windows"]) } };
  const extra = { ...b, metadata: { platforms: field(["linux"]) } };
  const missing = { ...b, metadata: {} };
  const compare = candidate => compareEvidenceGames(model([seed, candidate]), a.id, b.id);
  const shared = compare(narrow);
  const withExtraReceipts = compare(expanded);
  assert.equal(shared.metadata.similarity, .08);
  assert.equal(withExtraReceipts.metadata.similarity, shared.metadata.similarity);
  assert.equal(withExtraReceipts.metadata.coverage, .08);
  assert.deepEqual(withExtraReceipts.metadata.matches.map(item => item.field), ["platforms"]);
  assert.equal(withExtraReceipts.affinity, shared.affinity);
  assert.equal(compareEvidenceGames(model([seed, expanded]), b.id, a.id).affinity, shared.affinity);

  // No recorded common platform is not proof of incompatible hardware; this
  // secondary lane contributes no positive signal, not a strict-filter failure.
  const noRecordedOverlap = compare(extra);
  assert.equal(noRecordedOverlap.metadata.similarity, 0);
  assert.equal(noRecordedOverlap.metadata.coverage, .08);
  assert.deepEqual(noRecordedOverlap.metadata.matches, []);
  const noObservation = compare(missing);
  assert.equal(noObservation.metadata.similarity, null);
  assert.equal(noObservation.metadata.coverage, 0);
  assert.equal(noObservation.tags.similarity, withExtraReceipts.tags.similarity);
  const ranked = candidate => rankEvidenceBasket(model([seed, candidate]), { seeds: [{ id: a.id }] });
  assert.deepEqual(ranked(narrow).ranked.map(item => [item.id, item.scores.intersection]),
    ranked(expanded).ranked.map(item => [item.id, item.scores.intersection]));
});
test("disjoint positive platforms cannot win a taste-evidence tie", () => {
  const seed = { id: "demo:seed", tags: [tag("genre:rpg", 1)],
    metadata: { platforms: field(["windows"]) }, coop: null };
  const unknown = { ...seed, id: "demo:a-unknown", metadata: {} };
  const disjoint = { ...seed, id: "demo:z-disjoint",
    metadata: { platforms: field(["linux"]) } };
  const shared = { ...seed, id: "demo:shared",
    metadata: { platforms: field(["windows", "linux"]) } };
  const m = model([seed, unknown, disjoint]);
  const observed = compareEvidenceGames(m, seed.id, disjoint.id);
  const absent = compareEvidenceGames(m, seed.id, unknown.id);
  assert.equal(observed.status, "rankable");
  assert.equal(observed.metadata.coverage, .08);
  assert.equal(observed.metadata.tasteCoverage, 0);
  assert.equal(observed.metadata.similarity, 0);
  assert.ok(Math.abs(observed.evidenceCoverageByLane.metadata - .13 * .08) < 1e-12);
  assert.equal(observed.tasteEvidenceCoverageByLane.metadata, 0);
  assert.ok(observed.evidenceCoverage > absent.evidenceCoverage);
  assert.equal(observed.tasteEvidenceCoverage, absent.tasteEvidenceCoverage);
  assert.equal(observed.affinity, absent.affinity);
  const positive = compareEvidenceGames(model([seed, shared]), seed.id, shared.id);
  assert.equal(positive.metadata.tasteCoverage, .08);
  assert.equal(positive.metadata.coverage, .08);
  assert.ok(positive.affinity > observed.affinity);
  for (const mode of ["intersection", "arithmetic", "blend"]) {
    const ranked = rankEvidenceBasket(m, { seeds: [{ id: seed.id }], mode });
    assert.deepEqual(ranked.ranked.map(item => item.id),
      ["demo:a-unknown", "demo:z-disjoint"], mode);
    assert.equal(ranked.ranked[0].scores.intersection,
      ranked.ranked[1].scores.intersection);
  }
  // Strict platform eligibility is unaffected: missing support is unknown,
  // and a non-matching recorded list never passes a mandatory filter.
  const strict = rankEvidenceBasket(m, {
    seeds: [{ id: seed.id }], platform: "windows",
  });
  assert.ok(strict.uncertain.some(item => item.id === unknown.id));
  assert.ok(strict.excluded.some(item => item.id === disjoint.id));
});

test("editorial graph receipts require public HTTPS or an unmistakably fictional marker", () => {
  const base = relation("demo:a", "demo:b");
  const accepted = [
    "https://studio.example.org/games/relation",
    "https://www.example.org/story?section=gameplay",
    "https://studio.example.org./games/relation",
    "playmancer:authored-fictional-fixture",
    "playmancer:fictional-capacity-fixture",
    "fixture:curated-receipt",
  ];
  for (const source of accepted) {
    const m = model(undefined, [{ ...base, source }]);
    assert.equal(m.edges.get("demo:a").get("demo:b").source, source);
  }
  const rejected = [
    "notes-only", "authored-fixture", "http://example.org/claim",
    "javascript:alert(1)", "file:///tmp/receipt",
    "https://localhost/receipt", "https://localhost./receipt",
    "https://foo.localhost/receipt", "https://foo.localhost./receipt",
    "https://127.0.0.1/receipt",
    "https://service.local/receipt", "https://service.local./receipt",
    "https://service.local../receipt",
    "https://service.internal/receipt", "https://service.internal./receipt",
    "https://internal.local/receipt", "https://internal.internal/receipt",
    "https://someone:password@example.org/claim",
    "https://example.org/claim with whitespace",
    "fixture:", "fixture:unknown synthetic marker", "playmancer:unverified-source",
  ];
  for (const source of rejected) {
    assert.throws(() => model(undefined, [{ ...base, source }]),
      /relation.source must be a public HTTPS URL or an authored fictional fixture/,
      `unexpectedly accepted ${source}`);
  }
  // Non-graph synthetic tag/metadata receipts remain supported, and cannot
  // themselves be promoted to a public source-backed editorial relation.
  assert.equal(model().profiles.get("demo:a").tags[0].source, "authored-fixture");
});

test("sourced direct influence is symmetric as affinity but keeps its arrow", () => {
  const m = model(undefined, [relation("demo:c", "demo:a", .8, "inspired-by")]);
  const ac = compareEvidenceGames(m, a.id, c.id);
  const ca = compareEvidenceGames(m, c.id, a.id);
  assert.equal(ac.relations.direct.from, "demo:c");
  assert.equal(ac.relations.direct.to, "demo:a");
  assert.equal(ac.affinity, ca.affinity);
  assert.equal(ac.relations.twoHop, null);
  assert.equal(ac.relations.direct.source, "https://example.org/receipt");
});
test("reference and inspiration receipts are factual routes, not taste boosts", () => {
  const baseline = compareEvidenceGames(model(), a.id, c.id);
  for (const type of ["references", "inspired-by"]) {
    const withReceipt = compareEvidenceGames(model(undefined,
      [relation("demo:c", "demo:a", 1, type)]), a.id, c.id);
    assert.equal(withReceipt.status, "rankable");
    assert.equal(withReceipt.affinity, baseline.affinity);
    assert.equal(withReceipt.relations.direct.type, type);
    assert.equal(withReceipt.relations.direct.from, "demo:c");
    assert.equal(withReceipt.relations.direct.source, "https://example.org/receipt");
    assert.equal(withReceipt.evidenceCoverageByLane.direct, .08);
  }
  const similar = compareEvidenceGames(model(undefined,
    [relation("demo:c", "demo:a", 1, "similar")]), a.id, c.id);
  assert.ok(Math.abs(similar.affinity - baseline.affinity - .08) < 1e-12);
});
test("mixed two-hop reference routes do not masquerade as semantic affinity", () => {
  const baseline = compareEvidenceGames(model(), a.id, c.id);
  const mixed = compareEvidenceGames(model(undefined, [
    relation("demo:a", "demo:b", .8, "references"),
    relation("demo:b", "demo:c", .5, "similar"),
  ]), a.id, c.id);
  assert.equal(mixed.relations.direct, null);
  assert.equal(mixed.relations.twoHop.strength, .2);
  assert.deepEqual(mixed.relations.twoHop.hops.map(hop => hop.type),
    ["references", "similar"]);
  assert.equal(mixed.affinity, baseline.affinity);
  assert.equal(mixed.evidenceCoverageByLane.twoHop, .03);
  const bothSimilar = compareEvidenceGames(model(undefined, [
    relation("demo:a", "demo:b", .8, "similar"),
    relation("demo:b", "demo:c", .5, "similar"),
  ]), a.id, c.id);
  assert.ok(Math.abs(bothSimilar.affinity - baseline.affinity - .03 * .2) < 1e-12);
});

test("two hops decay, never claim that a transitive link is a direct source", () => {
  const m = model(undefined, [relation("demo:a", "demo:b", .8), relation("demo:b", "demo:c", .5)]);
  const ac = compareEvidenceGames(m, a.id, c.id);
  assert.equal(ac.relations.direct, null);
  assert.equal(ac.relations.twoHop.via, "demo:b");
  assert.equal(ac.relations.twoHop.strength, .2);
  assert.deepEqual(ac.relations.twoHop.hops.map(hop => [hop.from, hop.to, hop.type]),
    [["demo:a", "demo:b", "similar"], ["demo:b", "demo:c", "similar"]]);
  assert.deepEqual(ac.relations.twoHop.hops.map(hop => hop.source), ac.relations.twoHop.sources);
  assert.ok(ac.affinity > 0);
  assert.equal(compareEvidenceGames(m, a.id, d.id).relations.twoHop, null);
});
test("reverse traversal preserves both original authored direction/type claims", () => {
  const m = model(undefined, [
    relation("demo:b", "demo:a", .8, "inspired-by"),
    relation("demo:c", "demo:b", .5, "references"),
  ]);
  const forward = compareEvidenceGames(m, a.id, c.id).relations.twoHop;
  const reverse = compareEvidenceGames(m, c.id, a.id).relations.twoHop;
  assert.equal(forward.strength, reverse.strength);
  const edges = hops => hops.map(h => [h.from, h.to, h.type, h.strength, h.source]).sort();
  assert.deepEqual(edges(forward.hops), edges(reverse.hops));
  assert.deepEqual(edges(forward.hops).map(h => h.slice(0, 3)), [
    ["demo:b", "demo:a", "inspired-by"], ["demo:c", "demo:b", "references"]
  ]);
});
test("a stronger factual route cannot mask a weaker sourced similarity path", () => {
  const baseline = compareEvidenceGames(model(), a.id, c.id);
  const m = model(undefined, [
    relation("demo:a", "demo:b", 1, "references"),
    relation("demo:b", "demo:c", 1, "similar"),
    relation("demo:a", "demo:d", .6, "similar"),
    relation("demo:d", "demo:c", .6, "similar"),
  ]);
  const pair = compareEvidenceGames(m, a.id, c.id);
  assert.equal(pair.relations.twoHop.via, "demo:b");
  assert.deepEqual(pair.relations.twoHop.hops.map(h => h.type),
    ["references", "similar"]);
  assert.equal(pair.relations.fitTwoHop.via, "demo:d");
  assert.deepEqual(pair.relations.fitTwoHop.hops.map(h => h.type),
    ["similar", "similar"]);
  assert.ok(Math.abs(pair.affinity - baseline.affinity - .03 * .18) < 1e-12);
  const reversed = compareEvidenceGames(m, c.id, a.id);
  assert.equal(reversed.relations.fitTwoHop.via, "demo:d");
  assert.equal(reversed.affinity, pair.affinity);
});

test("direct similarity preserves an observed two-hop route without double-counting taste", () => {
  const direct = relation("demo:a", "demo:c", .4, "similar");
  const m = model(undefined, [relation("demo:a", "demo:b"), relation("demo:b", "demo:c"), direct]);
  const pair = compareEvidenceGames(m, a.id, c.id);
  const directOnly = compareEvidenceGames(model(undefined, [direct]), a.id, c.id);
  assert.equal(pair.relations.direct.type, "similar");
  assert.equal(pair.relations.twoHop.via, "demo:b");
  assert.equal(pair.relations.fitTwoHop, null);
  assert.equal(pair.evidenceCoverageByLane.twoHop, .03);
  assert.equal(pair.tasteEvidenceCoverageByLane.twoHop, 0);
  assert.equal(pair.affinity, directOnly.affinity);
  assert.equal(pair.tasteEvidenceCoverage, directOnly.tasteEvidenceCoverage);
  const reverse = compareEvidenceGames(m, c.id, a.id);
  assert.equal(reverse.relations.twoHop.via, "demo:b");
  const authoredHops = route => route.hops.map(hop =>
    [hop.from, hop.to, hop.type, hop.strength, hop.source]).sort();
  assert.deepEqual(authoredHops(reverse.relations.twoHop), authoredHops(pair.relations.twoHop));
});

test("direct similarity retains factual route receipts without improving basket fit", () => {
  const direct = relation("demo:a", "demo:c", .4, "similar");
  const m = model(undefined, [
    direct,
    relation("demo:a", "demo:d", 1, "references"),
    relation("demo:d", "demo:c", 1, "references"),
  ]);
  const pair = compareEvidenceGames(m, a.id, c.id);
  const baseline = compareEvidenceGames(model(undefined, [direct]), a.id, c.id);
  assert.equal(pair.relations.twoHop.via, "demo:d");
  assert.deepEqual(pair.relations.twoHop.hops.map(h => h.type), ["references", "references"]);
  assert.equal(pair.relations.fitTwoHop, null);
  assert.equal(pair.evidenceCoverageByLane.twoHop, .03);
  assert.equal(pair.tasteEvidenceCoverageByLane.twoHop, 0);
  assert.equal(pair.affinity, baseline.affinity);
  assert.equal(pair.tasteEvidenceCoverage, baseline.tasteEvidenceCoverage);
  const ranked = rankEvidenceBasket(m, { seeds: [{ id: a.id, weight: 1 }] });
  const item = ranked.ranked.find(result => result.id === c.id);
  assert.ok(item);
  assert.equal(item.evidence[0].relations.twoHop.via, d.id);
  assert.equal(item.evidence[0].relations.fitTwoHop, null);
  assert.equal(item.evidence[0].affinity, baseline.affinity);
});
test("duplicate, dangling and self referential connections are rejected", () => {
  assert.throws(() => model(undefined, [relation("demo:a", "demo:z")]), /endpoints/);
  assert.throws(() => model(undefined, [relation("demo:a", "demo:a")]), /endpoints/);
  assert.throws(() => model(undefined, [relation("demo:a", "demo:b"), relation("demo:b", "demo:a")]), /duplicate pair/);
  assert.throws(() => model(undefined, [{ ...relation("demo:a", "demo:b"), source: "" }]), /source/);
});
test("offline hard-filter evidence carries sourced co-op and positive-only platform receipts", () => {
  const m = model();
  assert.equal(m.profiles.get("demo:a").coopSource, "authored-fixture");
  assert.equal(m.profiles.get("demo:c").coopSource, "authored-fixture");
  assert.equal(m.profiles.get("demo:b").coopSource, null);

  for (const mode of ["intersection", "arithmetic", "blend"]) {
    const result = rankEvidenceBasket(m, {
      seeds: [{ id: "demo:a", weight: 1 }], platform: "windows", coopOnly: true, mode,
    });
    assert.deepEqual(result.ranked.map(item => item.id), [], mode);
    const b = result.uncertain.find(item => item.id === "demo:b");
    assert.equal(b.reason, "hard-constraint-unknown", mode);
    assert.deepEqual(b.hardConstraintEvidence, {
      excludedByUser: false,
      platform: { requested: "windows", status: "recorded-support",
        recorded: ["linux", "windows"], source: "authored-fixture" },
      coop: { requested: true, status: "unknown", source: null },
    });
    const c = result.excluded.find(item => item.id === "demo:c");
    assert.equal(c.reason, "hard-constraint-fail", mode);
    assert.equal(c.hardConstraintEvidence.platform.status, "no-matching-receipt");
    assert.deepEqual(c.hardConstraintEvidence.platform.recorded, ["linux"]);
    assert.equal(c.hardConstraintEvidence.platform.source, "authored-fixture");
    assert.deepEqual(c.hardConstraintEvidence.coop,
      { requested: true, status: "recorded-no", source: "authored-fixture" });
    assert.equal(c.evidence.length, 1, "excluded candidates retain provenance for inspection");
    const d = result.uncertain.find(item => item.id === "demo:d");
    assert.equal(d.hardConstraintEvidence.platform.status, "unknown");
    assert.equal(d.hardConstraintEvidence.platform.source, null);
    assert.equal(d.hardConstraintEvidence.coop.status, "unknown");
    const seed = result.excluded.find(item => item.id === "demo:a");
    assert.equal(seed.reason, "seed");
    assert.equal(seed.hardConstraintEvidence.coop.status, "recorded-yes");
  }

  const unconstrained = rankEvidenceBasket(m, { seeds: [{ id: "demo:a" }] });
  const included = unconstrained.ranked.find(item => item.id === "demo:b");
  assert.equal(included.hardConstraintEvidence.platform.status, "not-required");
  assert.equal(included.hardConstraintEvidence.coop.status, "not-required");
  const userExcluded = rankEvidenceBasket(m, {
    seeds: [{ id: "demo:a" }], excluded: ["demo:b"],
  }).excluded.find(item => item.id === "demo:b");
  assert.equal(userExcluded.hardConstraintEvidence.excludedByUser, true);
  // Returned evidence is not a mutable alias of the catalog's recorded metadata.
  const filtered = rankEvidenceBasket(m, {
    seeds: [{ id: "demo:a" }], platform: "windows",
  }).ranked.find(item => item.id === "demo:b");
  filtered.hardConstraintEvidence.platform.recorded.push("extra");
  assert.deepEqual(m.profiles.get("demo:b").metadata.platforms.value, ["linux", "windows"]);
});

test("hard filters remain strict for unknown platforms and cooperative support", () => {
  const result = rankEvidenceBasket(model(), { seeds: [{ id: "demo:a", weight: 1 }], platform: "windows", coopOnly: true });
  assert.deepEqual(result.ranked.map(item => item.id), []);
  assert.ok(result.uncertain.some(item => item.id === "demo:b"));
  assert.ok(result.excluded.some(item => item.id === "demo:c"));
});
test("exclusions, Intersection and Blend reuse existing ranker with per-seed evidence", () => {
  const m = model();
  const seeds = [{ id: "demo:a", weight: 2 }, { id: "demo:b", weight: 1 }];
  const scalar = rankEvidenceBasket(m, { seeds, excluded: ["demo:d"] });
  assert.ok(scalar.ranked.every(item => item.evidence.length === 2));
  assert.ok(scalar.excluded.some(item => item.id === "demo:d"));
  const blend = rankEvidenceBasket(m, { seeds, mode: "blend", lambda: 0.3 });
  assert.equal(blend.mode, "blend");
  assert.deepEqual(blend.ranked.map(item => item.id), ["demo:c", "demo:d"]);
});
test("input order and graph edge order do not change scores or ranks", () => {
  const edges = [relation("demo:a", "demo:b", .8), relation("demo:b", "demo:c", .5)];
  const first = model([a, b, c, d], edges);
  const second = model([d, c, b, a], edges.reverse());
  for (const x of ["demo:a", "demo:b", "demo:c", "demo:d"]) {
    for (const y of ["demo:a", "demo:b", "demo:c", "demo:d"]) {
      assert.equal(compareEvidenceGames(first, x, y).affinity, compareEvidenceGames(second, x, y).affinity);
    }
  }
  assert.deepEqual(rankEvidenceBasket(first, { seeds: [{ id: "demo:a" }] }).ranked.map(x => x.id),
    rankEvidenceBasket(second, { seeds: [{ id: "demo:a" }] }).ranked.map(x => x.id));
});

test("partial and missing tags retain independently sourced relation coverage without ranking", () => {
  const partial = { ...b, tagCoverage: "partial" };
  const directModel = model([a, partial, c],
    [relation("demo:b", "demo:a", .8, "inspired-by")]);
  const direct = compareEvidenceGames(directModel, a.id, b.id);
  assert.equal(direct.status, "uncertain");
  assert.equal(direct.reason, "partial-weighted-tags");
  assert.equal(direct.affinity, null);
  assert.equal(direct.tags.similarity, null);
  assert.equal(direct.relations.direct.from, "demo:b");
  assertCoverageLanes(direct.evidenceCoverageByLane, {
    tags: 0, metadata: .13 * .35, direct: .08, twoHop: 0,
  });
  assert.ok(Math.abs(direct.evidenceCoverage - (.13 * .35 + .08)) < 1e-12);
  const ranked = rankEvidenceBasket(directModel, {
    seeds: [{ id: a.id, weight: 1 }], mode: "intersection",
  });
  assert.ok(!ranked.ranked.some(item => item.id === b.id));
  assert.ok(ranked.uncertain.some(item => item.id === b.id));

  const unknown = { ...c, tags: null };
  const twoHopModel = model([a, b, unknown], [
    relation("demo:a", "demo:b", .8),
    relation("demo:b", "demo:c", .5),
  ]);
  const twoHop = compareEvidenceGames(twoHopModel, a.id, c.id);
  assert.equal(twoHop.status, "uncertain");
  assert.equal(twoHop.reason, "missing-weighted-tags");
  assert.equal(twoHop.affinity, null);
  assert.equal(twoHop.relations.twoHop.strength, .2);
  assertCoverageLanes(twoHop.evidenceCoverageByLane, {
    tags: 0, metadata: .13 * .35, direct: 0, twoHop: .03,
  });
  const noEdge = compareEvidenceGames(model([a, b, unknown]), a.id, c.id);
  assert.equal(noEdge.evidenceCoverageByLane.direct, 0);
  assert.equal(noEdge.evidenceCoverageByLane.twoHop, 0);
  assert.equal(noEdge.affinity, null);
});

test("complete-tag pairs retain the existing score and expose independent coverage lanes", () => {
  const unchanged = compareEvidenceGames(model(), a.id, b.id);
  const sourced = compareEvidenceGames(model(undefined,
    [relation("demo:a", "demo:b", .8)]), a.id, b.id);
  assert.equal(unchanged.status, "rankable");
  assert.ok(Math.abs(unchanged.evidenceCoverage -
    (.76 + .13 * .35)) < 1e-12);
  assertCoverageLanes(sourced.evidenceCoverageByLane, {
    tags: .76, metadata: .13 * .35, direct: .08, twoHop: 0,
  });
  assert.ok(Math.abs(sourced.affinity - unchanged.affinity - .08 * .8) < 1e-12);
  assert.ok(Math.abs(sourced.evidenceCoverage -
    Object.values(sourced.evidenceCoverageByLane).reduce((a, b) => a + b, 0)) < 1e-12);
});

test("factual receipts cannot reorder score ties through evidence-coverage tie-breaks", () => {
  const ids = ["demo:seed", "demo:other", "demo:b", "demo:c", "demo:z"];
  const games = ids.map(id => ({ id, tags: [tag("genre:rpg", 1)], metadata: {} }));
  const seeds = [{ id: "demo:seed", weight: 2 }];
  const rank = (m, chosenSeeds = seeds, mode = "intersection") =>
    rankEvidenceBasket(m, { seeds: chosenSeeds, mode, lambda: 0.3 })
      .ranked.map(item => item.id);
  const baseline = model(games);
  const original = rank(baseline);
  assert.deepEqual(original, ["demo:b", "demo:c", "demo:other", "demo:z"]);

  for (const type of ["references", "inspired-by"]) {
    const factual = model(games, [relation("demo:seed", "demo:c", 1, type)]);
    const pair = compareEvidenceGames(factual, "demo:seed", "demo:c");
    const noReceipt = compareEvidenceGames(baseline, "demo:seed", "demo:c");
    assert.equal(pair.affinity, noReceipt.affinity);
    assert.ok(pair.evidenceCoverage > noReceipt.evidenceCoverage);
    assert.equal(pair.tasteEvidenceCoverage, noReceipt.tasteEvidenceCoverage);
    assert.equal(pair.evidenceCoverageByLane.direct, 0.08);
    assert.equal(pair.tasteEvidenceCoverageByLane.direct, 0);
    assert.deepEqual(rank(factual), original);
    assert.deepEqual(rank(factual, seeds, "blend"), rank(baseline, seeds, "blend"));
  }

  const mixed = model(games, [
    relation("demo:seed", "demo:z", 1, "references"),
    relation("demo:z", "demo:c", 1, "similar"),
  ]);
  const mixedPair = compareEvidenceGames(mixed, "demo:seed", "demo:c");
  assert.equal(mixedPair.relations.twoHop.hops[0].type, "references");
  assert.equal(mixedPair.relations.fitTwoHop, null);
  assert.equal(mixedPair.evidenceCoverageByLane.twoHop, 0.03);
  assert.equal(mixedPair.tasteEvidenceCoverageByLane.twoHop, 0);
  assert.deepEqual(rank(mixed), original);
  assert.deepEqual(rank(mixed, seeds, "blend"), rank(baseline, seeds, "blend"));

  const twoSeeds = [{ id: "demo:seed", weight: 2 }, { id: "demo:other", weight: 1 }];
  const factualToBoth = model(games, [
    relation("demo:seed", "demo:c", 1, "references"),
    relation("demo:other", "demo:c", 1, "inspired-by"),
  ]);
  for (const mode of ["intersection", "arithmetic", "blend"]) {
    assert.deepEqual(rank(factualToBoth, twoSeeds, mode), rank(baseline, twoSeeds, mode));
  }

  const actuallySimilar = model(games, [relation("demo:seed", "demo:c", 1, "similar")]);
  const positive = compareEvidenceGames(actuallySimilar, "demo:seed", "demo:c");
  assert.equal(positive.tasteEvidenceCoverageByLane.direct, 0.08);
  assert.ok(positive.affinity > compareEvidenceGames(baseline, "demo:seed", "demo:c").affinity);
  assert.equal(rank(actuallySimilar)[0], "demo:c");

  const fitTwoHop = model(games, [
    relation("demo:seed", "demo:z", 1, "similar"),
    relation("demo:z", "demo:c", 1, "similar"),
  ]);
  assert.equal(compareEvidenceGames(fitTwoHop, "demo:seed", "demo:c").tasteEvidenceCoverageByLane.twoHop, 0.03);
  assert.ok(rank(fitTwoHop).indexOf("demo:c") < rank(fitTwoHop).indexOf("demo:b"));
});

test("factual direct receipts never mask independent two-hop taste evidence", () => {
  const legs = [
    relation("demo:a", "demo:b", .8, "similar"),
    relation("demo:b", "demo:c", .5, "similar"),
  ];
  const withoutDirect = compareEvidenceGames(model(undefined, legs), a.id, c.id);
  assert.ok(Math.abs(withoutDirect.affinity - .03 * .2) < 1e-12);

  for (const type of ["references", "inspired-by"]) {
    const enriched = model(undefined, [
      relation("demo:c", "demo:a", 1, type), ...legs,
    ]);
    const pair = compareEvidenceGames(enriched, a.id, c.id);
    const reverse = compareEvidenceGames(enriched, c.id, a.id);
    assert.equal(pair.relations.direct.type, type);
    assert.deepEqual([pair.relations.direct.from, pair.relations.direct.to],
      [c.id, a.id]);
    assert.equal(pair.relations.twoHop.via, b.id);
    assert.equal(pair.relations.fitTwoHop.via, b.id);
    assert.deepEqual(pair.relations.fitTwoHop.hops.map(hop => hop.type),
      ["similar", "similar"]);
    assert.deepEqual(pair.relations.fitTwoHop.sources,
      ["https://example.org/receipt", "https://example.org/receipt"]);
    assert.equal(pair.affinity, withoutDirect.affinity);
    assert.equal(reverse.affinity, pair.affinity);
    assert.equal(reverse.relations.direct.from, c.id);
    assert.equal(reverse.relations.fitTwoHop.via, b.id);
    assert.equal(pair.evidenceCoverageByLane.direct, .08);
    assert.equal(pair.evidenceCoverageByLane.twoHop, .03);
    assert.equal(pair.tasteEvidenceCoverageByLane.direct, 0);
    assert.equal(pair.tasteEvidenceCoverageByLane.twoHop, .03);
    assert.equal(pair.tasteEvidenceCoverage, withoutDirect.tasteEvidenceCoverage);
    const ranked = rankEvidenceBasket(enriched, {
      seeds: [{ id: a.id, weight: 1 }], mode: "intersection",
    });
    const candidate = ranked.ranked.find(item => item.id === c.id);
    assert.equal(candidate.evidence[0].affinity, withoutDirect.affinity);
  }

  // The strongest explanatory route may be a factual crossover while the
  // scoring route remains a different, weaker all-similar path.
  const competing = compareEvidenceGames(model(undefined, [
    ...legs,
    relation("demo:a", "demo:d", 1, "references"),
    relation("demo:d", "demo:c", 1, "references"),
    relation("demo:c", "demo:a", 1, "inspired-by"),
  ]), a.id, c.id);
  assert.equal(competing.relations.twoHop.via, d.id);
  assert.equal(competing.relations.fitTwoHop.via, b.id);
  assert.equal(competing.affinity, withoutDirect.affinity);

  // A sourced *direct similarity* does supersede a transitive similarity
  // and contributes only its direct lane (no graph double count).
  const directSimilar = compareEvidenceGames(model(undefined, [
    ...legs, relation("demo:a", "demo:c", .4, "similar"),
  ]), a.id, c.id);
  assert.equal(directSimilar.relations.fitTwoHop, null);
  assert.equal(directSimilar.relations.twoHop.via, b.id);
  assert.equal(directSimilar.evidenceCoverageByLane.twoHop, .03);
  assert.equal(directSimilar.tasteEvidenceCoverageByLane.twoHop, 0);
  assert.ok(Math.abs(directSimilar.affinity - .08 * .4) < 1e-12);

  // Even with sourced paths, missing required tags still abstain.
  const sparse = compareEvidenceGames(model([a, b, { ...c, tags: null }], [
    ...legs, relation("demo:c", "demo:a", 1, "references"),
  ]), a.id, c.id);
  assert.equal(sparse.status, "uncertain");
  assert.equal(sparse.affinity, null);
  assert.equal(sparse.relations.fitTwoHop.via, b.id);
  assert.equal(sparse.tasteEvidenceCoverageByLane.twoHop, .03);
});


test("basket two-hop taste paths cannot borrow excluded or unknown-hard-filter intermediates", () => {
  const games = ["seed", "candidate", "other", "via"].map(name => ({
    id: "demo:" + name,
    tags: [tag("genre:rpg", 1)],
    metadata: { platforms: field(name === "via" ? ["linux"] : ["windows"]) },
    coop: name === "via" ? null : true,
    ...(name === "via" ? {} : { coopSource: "authored-fixture" }),
  }));
  const edges = [relation("demo:seed", "demo:via"),
    relation("demo:via", "demo:candidate")];
  const sourced = model(games, edges);
  const withoutEdges = model(games);
  const basket = { seeds: [{ id: "demo:seed", weight: 1 }] };
  const candidate = (m, opts = {}) => rankEvidenceBasket(m, { ...basket, ...opts })
    .ranked.find(item => item.id === "demo:candidate");

  // The unconstrained fixture has one legitimate, fully sourced taste path.
  const admitted = candidate(sourced);
  const raw = compareEvidenceGames(sourced, "demo:seed", "demo:candidate");
  assert.equal(raw.relations.fitTwoHop.via, "demo:via");
  assert.equal(admitted.evidence[0].relations.fitTwoHop.via, "demo:via");
  assert.ok(candidate(sourced).scores.intersection > candidate(withoutEdges).scores.intersection);

  for (const [reason, opts] of Object.entries({
    "platform mismatch": { platform: "windows" },
    "explicit exclusion": { excluded: ["demo:via"] },
    "unknown coop": { coopOnly: true },
  })) {
    for (const mode of ["intersection", "arithmetic", "blend"]) {
      const actual = rankEvidenceBasket(sourced, { ...basket, ...opts, mode });
      const baseline = rankEvidenceBasket(withoutEdges, { ...basket, ...opts, mode });
      const item = actual.ranked.find(entry => entry.id === "demo:candidate");
      const plain = baseline.ranked.find(entry => entry.id === "demo:candidate");
      assert.ok(item && plain, reason + "/" + mode + ": candidate must stay eligible");
      assert.equal(item.evidence[0].relations.twoHop.via, "demo:via", reason);
      assert.equal(item.evidence[0].relations.fitTwoHop, null, reason);
      assert.equal(item.evidence[0].tasteEvidenceCoverageByLane.twoHop, 0, reason);
      assert.equal(item.evidence[0].evidenceCoverageByLane.twoHop, .03, reason);
      assert.ok(Math.abs(item.scores.intersection - plain.scores.intersection) < 1e-12,
        reason + "/" + mode + ": excluded via must not raise taste fit");
      assert.deepEqual(actual.ranked.map(entry => entry.id), baseline.ranked.map(entry => entry.id),
        reason + "/" + mode + ": ordering must not benefit from blocked via");
    }
  }

  // Unknown required platforms are abstentions, not implicit permission to
  // traverse via an unverified intermediate.
  const unknownVia = model(games.map(game => game.id === "demo:via"
    ? { ...game, metadata: {} } : game), edges);
  const unknown = candidate(unknownVia, { platform: "windows" });
  assert.equal(unknown.evidence[0].relations.twoHop.via, "demo:via");
  assert.equal(unknown.evidence[0].relations.fitTwoHop, null);
  assert.ok(Math.abs(unknown.scores.intersection -
    candidate(withoutEdges, { platform: "windows" }).scores.intersection) < 1e-12);
});
