import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validateCatalogSnapshot, catalogCoverage } from "../src/catalog.js";
import { buildBridgePreview } from "../src/bridge-preview.js";

const source = JSON.parse(readFileSync("examples/catalog.wikidata.real.json", "utf8"));

test("real pilot has identifiable CC0-sourced items with honest missing metadata", () => {
  const snapshot = validateCatalogSnapshot(source, { requirePublishable: true });
  assert.equal(snapshot.kind, "real");
  assert.equal(snapshot.snapshotId, "wikidata-genre-pilot-2026-10-27");
  assert.equal(snapshot.games.length, 12);
  const ids = new Set();
  for (const game of snapshot.games) {
    assert.match(game.id, /^wikidata:q[0-9]+$/);
    assert.ok(game.externalIds.some(external =>
      external.provider === "wikidata" && external.id.toLowerCase() === game.id.slice(9)));
    assert.ok(!ids.has(game.id));
    ids.add(game.id);
    assert.ok(game.name.length > 2 && Array.isArray(game.themes) && game.themes.length > 0);
    assert.equal(game.mechanics, null);
    assert.equal(game.coop, null);
    assert.equal(game.description, null);
    assert.equal(game.parentId, null);
  }
  assert.equal(catalogCoverage(snapshot).mechanics.known, 0);
  assert.equal(catalogCoverage(snapshot).themes.known, 12);
});

test("real pilot Bridge uses only known genre features", () => {
  const snapshot = validateCatalogSnapshot(source, { requirePublishable: true });
  const route = buildBridgePreview({ catalog: snapshot.games, snapshotId: snapshot.snapshotId,
    startId: "wikidata:q23013817", endId: "wikidata:q332697", minSimilarity: 0.05 });
  assert.equal(route.status, "route");
  assert.ok(route.steps.length > 0);
  for (const step of route.steps) {
    assert.equal(step.evidence_coverage, 0.3);
    assert.ok(step.affinity > 0);
    assert.deepEqual(step.groups.find(group => group.group === "mechanics") ?? null, null);
  }
  const unknown = buildBridgePreview({ catalog: snapshot.games, snapshotId: snapshot.snapshotId,
    startId: "wikidata:q23013817", endId: "wikidata:q332697", coopOnly: true, minSimilarity: 0.05 });
  assert.equal(unknown.status, "unavailable-endpoint");
  assert.equal(unknown.reason, "unknown");
});

test("Pages release build publishes real games without embedding fictional profile names", () => {
  const directory = mkdtempSync(join(tmpdir(), "playmancer-real-"));
  try {
    const result = spawnSync(process.execPath, ["scripts/build-demo.mjs", directory,
      "--catalog", "examples/catalog.wikidata.real.json"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const html = readFileSync(join(directory, "index.html"), "utf8");
    assert.match(html, /name="playmancer-catalog" content="wikidata-genre-pilot-2026-10-27"/);
    assert.match(html, /"kind":"real"/);
    assert.match(html, /Stardew Valley/);
    assert.match(html, /Wikidata CC0 genre pilot/);
    assert.doesNotMatch(html, /Ember Circuit|Cloud Harvest|Grove Keepers/);
    assert.doesNotMatch(html, /<script[^>]+src=/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
