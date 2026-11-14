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

test("unexpected model or relation fields cannot silently drop sourced graph evidence", () => {
  const a = profile("fixture:source");
  const b = profile("fixture:target");
  const receipt = { from: a.id, to: b.id, type: "inspired-by", strength: 0.8,
    source: "https://example.org/relations/1" };
  assert.throws(() => prepareEvidenceModel({ games: [a, b], relatons: [receipt] }),
    /unknown evidence model field: relatons/);
  assert.throws(() => prepareEvidenceModel({ games: [a, b], relations: [
    { ...receipt, direction: "reverse" },
  ] }), /unknown relation field: direction/);
  const valid = prepareEvidenceModel({ games: [a, b], relations: [receipt] });
  const pair = compareEvidenceGames(valid, a.id, b.id);
  assert.equal(pair.relations.direct.from, a.id);
  assert.equal(pair.relations.direct.to, b.id);
  assert.equal(pair.relations.direct.type, "inspired-by");
  assert.equal(pair.relations.direct.source, receipt.source);
  assert.equal(pair.affinity, compareEvidenceGames(
    prepareEvidenceModel({ games: [a, b] }), a.id, b.id).affinity,
    "a factual relation must not boost taste similarity");
});

test("unknown fields inside metadata receipts fail closed instead of asserting coverage", () => {
  const game = profile("fixture:fields");
  const platforms = { value: ["windows"], source };
  assert.throws(() => prepareEvidenceModel({ games: [
    { ...game, metadata: { platforms: { ...platforms, exhaustive: true } } },
  ] }), /unknown fixture:fields.platforms field: exhaustive/);
  assert.throws(() => prepareEvidenceModel({ games: [
    { ...game, metadata: { platforms: { ...platforms, tagCoverage: "complete" } } },
  ] }), /unknown fixture:fields.platforms field: tagCoverage/);
  const valid = prepareEvidenceModel({ games: [
    { ...game, metadata: { platforms } }, profile("fixture:other"),
  ] });
  assert.deepEqual(valid.profiles.get(game.id).metadata.platforms, platforms);
});

test("co-op receipts must be attached to a known co-op observation", () => {
  const unknown = profile("fixture:unknown-coop");
  const detached = { ...unknown, coopSource: "fixture:unattached" };
  assert.throws(() => prepareEvidenceModel({ games: [detached] }),
    /coopSource requires a recorded co-op value/);
  const omitted = { ...detached };
  delete omitted.coop;
  assert.throws(() => prepareEvidenceModel({ games: [omitted] }),
    /coopSource requires a recorded co-op value/);

  // Unknown without a receipt remains unknown; an explicitly recorded
  // negative observation retains its independent source.
  assert.equal(prepareEvidenceModel({ games: [unknown] })
    .profiles.get(unknown.id).coopSource, null);
  const negative = { ...unknown, coop: false, coopSource: "fixture:negative-coop" };
  const retained = prepareEvidenceModel({ games: [negative] }).profiles.get(negative.id);
  assert.equal(retained.coop, false);
  assert.equal(retained.coopSource, "fixture:negative-coop");
});

test("externally sourced tags require an explicit whole-game coverage claim", () => {
  const receipt = "https://example.org/verified-observation";
  const observed = { ...profile("wikidata:q12345"),
    tags: [{ id: "mechanic:puzzle", weight: 1, source: receipt }] };
  // Normalized mass 1 is not proof of complete whole-game semantics.
  assert.throws(() => prepareEvidenceModel({ games: [observed] }),
    /tagCoverage must explicitly be complete or partial for sourced tags/);
  const mixed = { ...observed, tags: [
    { id: "mechanic:puzzle", weight: 0.5, source },
    { id: "mood:cozy", weight: 0.5, source: receipt },
  ] };
  assert.throws(() => prepareEvidenceModel({ games: [mixed] }),
    /tagCoverage must explicitly/);
  const complete = profile("fixture:complete");
  const partial = prepareEvidenceModel({ games: [
    { ...observed, tagCoverage: "partial" }, complete,
  ] });
  assert.equal(partial.profiles.get(observed.id).tagCoverage, "partial");
  assert.equal(compareEvidenceGames(partial, observed.id, complete.id).status, "uncertain");
  const explicitlyComplete = prepareEvidenceModel({ games: [
    { ...observed, tagCoverage: "complete" }, complete,
  ] });
  assert.equal(compareEvidenceGames(explicitlyComplete, observed.id, complete.id).status, "rankable");
  // Preserve the documented legacy behavior only for explicit fixture sources.
  assert.equal(prepareEvidenceModel({ games: [profile("fixture:legacy")] })
    .profiles.get("fixture:legacy").tagCoverage, "complete");
});

test("sourced co-op values need an inspectable receipt before affecting hard filters", () => {
  const yes = { ...profile("demo:coop-yes"), coop: true,
    coopSource: "https://studio.example.org/game/coop-faq" };
  const no = { ...profile("demo:coop-no"), coop: false,
    coopSource: "https://studio.example.org/game/no-coop" };
  const valid = prepareEvidenceModel({ games: [yes, no] });
  assert.equal(valid.profiles.get(yes.id).coopSource, yes.coopSource);
  assert.equal(valid.profiles.get(no.id).coopSource, no.coopSource);
  // Fictional benchmark receipts remain valid, but must not be confused with
  // a source-backed production claim.
  for (const fixture of ["authored-fixture", "fixture:curated-receipt",
    "playmancer:authored-fictional-fixture", "playmancer:fictional-capacity-fixture"]) {
    const synthetic = prepareEvidenceModel({ games: [
      { ...yes, coopSource: fixture },
    ] });
    assert.equal(synthetic.profiles.get(yes.id).coopSource, fixture);
  }
  for (const source of ["private spreadsheet", "authored-research-note",
    "http://studio.example.org/coop", "https://localhost/coop",
    "https://127.0.0.1/coop", "https://someone:password@studio.example.org/coop",
    "https://studio.example.org/coop with spaces", "fixture:unverified notes"]) {
    for (const coop of [true, false]) {
      assert.throws(() => prepareEvidenceModel({ games: [
        { ...yes, coop, coopSource: source },
      ] }), /coopSource must be a public HTTPS URL or an authored fictional fixture/,
      `opaque co-op evidence was accepted: ${source}`);
    }
  }
});

test("sourced tags and metadata require inspectable receipts, including frozen proxy provenance", () => {
  const external = { ...profile("wikidata:q12345"), tagCoverage: "complete",
    tags: [{ id: "mechanic:puzzle", weight: 1,
      source: "https://studio.example.org/gameplay/puzzle" }] };
  const platforms = { value: ["windows"], source: "https://studio.example.org/platforms" };
  const valid = prepareEvidenceModel({ games: [
    { ...external, metadata: { platforms } }, profile("fixture:peer"),
  ] });
  assert.equal(valid.profiles.get(external.id).tags[0].source, external.tags[0].source);
  assert.equal(valid.profiles.get(external.id).metadata.platforms.source, platforms.source);

  for (const bad of ["internal spreadsheet", "editorial-note",
    "http://studio.example.org/claim", "https://localhost/claim",
    "https://127.0.0.1/claim", "https://reader:secret@studio.example.org/claim",
    "https://studio.example.org/claim extra notes"]) {
    assert.throws(() => prepareEvidenceModel({ games: [
      { ...external, tags: [{ ...external.tags[0], source: bad }] },
    ] }), /source must be a public HTTPS URL or an authored fictional fixture/,
    `uninspectable tag evidence was accepted: ${bad}`);
    assert.throws(() => prepareEvidenceModel({ games: [
      { ...external, metadata: { platforms: { ...platforms, source: bad } } },
    ] }), /source must be a public HTTPS URL or an authored fictional fixture/,
    `uninspectable platform receipt was accepted: ${bad}`);
    assert.throws(() => prepareEvidenceModel({ games: [
      { ...external, metadata: { creator: { value: "Example", source: bad } } },
    ] }), /source must be a public HTTPS URL or an authored fictional fixture/,
    `uninspectable scalar metadata receipt was accepted: ${bad}`);
  }

  // The frozen genre proxy stores a clickable URL plus an explicit source-scope
  // annotation. Validate the URL without erasing the version/field provenance.
  const frozen = "https://www.wikidata.org/wiki/Q12345#P136 " +
    "(frozen multi-store-genre-pilot-30-2026-10-28 / wikidata:q12345 / themes)";
  const snapshot = prepareEvidenceModel({ games: [
    { ...external, tags: [{ ...external.tags[0], source: frozen }] },
  ] });
  assert.equal(snapshot.profiles.get(external.id).tags[0].source, frozen);
  const frozenPlatform = frozen.replace("#P136", "#P400").replace("/ themes)", "/ platforms)");
  const platformSnapshot = prepareEvidenceModel({ games: [
    { ...external, metadata: { platforms: { ...platforms, source: frozenPlatform } } },
  ] });
  assert.equal(platformSnapshot.profiles.get(external.id).metadata.platforms.source, frozenPlatform);
  assert.throws(() => prepareEvidenceModel({ games: [
    { ...external, tags: [{ ...external.tags[0],
      source: "https://studio.example.org/claim (unreviewed spreadsheet)" }] },
  ] }), /source must be a public HTTPS URL or an authored fictional fixture/);
  // Fictional offline vectors retain the established provenance markers.
  assert.equal(prepareEvidenceModel({ games: [profile("fixture:legacy")] })
    .profiles.get("fixture:legacy").tags[0].source, source);
});
