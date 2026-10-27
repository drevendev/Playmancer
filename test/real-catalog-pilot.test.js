import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { catalogCoverage, resolveCatalogIdentity, validateCatalogSnapshot } from "../src/catalog.js";

const original = JSON.parse(await readFile(new URL("../examples/catalog.wikidata.real.json", import.meta.url), "utf8"));

test("real pilot passes exact publishable identity and CC0 field gates", () => {
  const catalog = validateCatalogSnapshot(original, { requirePublishable: true });
  assert.equal(catalog.kind, "real");
  assert.equal(catalog.snapshotId, "wikidata-genre-pilot-2026-10-27");
  assert.equal(catalog.games.length, 12);
  assert.equal(catalog.sources.length, 1);
  assert.equal(catalog.sources[0].kind, "licensed");
  assert.equal(catalog.sources[0].rights.status, "approved");
  assert.equal(catalog.sources[0].rights.reference, "https://www.wikidata.org/wiki/Wikidata:Licensing");
  assert.deepEqual(catalog.sources[0].rights.fields.sort?.() ?? [...catalog.sources[0].rights.fields].sort(),
    ["id", "kind", "name", "sourceId", "themes", "platforms", "externalIds"].sort());
});

test("QIDs remain unique canonical identities without guessed aliases or merges", () => {
  const catalog = validateCatalogSnapshot(original, { requirePublishable: true });
  const qids = new Set();
  for (const game of catalog.games) {
    assert.match(game.id, /^wikidata:q[0-9]+$/);
    assert.equal(game.kind, "game");
    assert.equal(game.parentId, null);
    assert.deepEqual(game.aliases, []);
    assert.equal(game.externalIds.length, 1);
    const qid = game.externalIds[0].id;
    assert.equal(game.id, "wikidata:" + qid.toLowerCase());
    assert.equal(game.externalIds[0].provider, "wikidata");
    assert.equal(resolveCatalogIdentity(catalog, game.id), game.id);
    assert.equal(qids.has(qid), false);
    qids.add(qid);
  }
});

test("sparse real coverage is explicit: genres only, no manufactured mechanics or co-op", () => {
  const catalog = validateCatalogSnapshot(original, { requirePublishable: true });
  const coverage = catalogCoverage(catalog);
  assert.deepEqual(coverage.mechanics, { known: 0, total: 12 });
  assert.deepEqual(coverage.themes, { known: 12, total: 12 });
  assert.deepEqual(coverage.platforms, { known: 11, total: 12 });
  assert.deepEqual(coverage.coop, { known: 0, total: 12 });
  for (const game of catalog.games) {
    assert.equal(game.mechanics, null);
    assert.equal(game.description, null);
    assert.equal(game.coop, null);
    assert.ok(game.themes.length > 0);
    assert.equal(Object.hasOwn(game, "artwork"), false);
  }
});

test("real pilot has a source-supported genre overlap for initial sample basket", () => {
  const catalog = validateCatalogSnapshot(original);
  const [stardew, terraria] = catalog.games;
  assert.equal(stardew.name, "Stardew Valley");
  assert.equal(terraria.name, "Terraria");
  assert.ok(stardew.themes.includes("role-playing video game"));
  assert.ok(terraria.themes.includes("role-playing video game"));
});

test("partial external rights record cannot masquerade as a publishable real snapshot", () => {
  const modified = structuredClone(original);
  modified.sources[0].rights.status = "unreviewed";
  assert.throws(() => validateCatalogSnapshot(modified, { requirePublishable: true }), /Publication rights not approved/);
  const removed = structuredClone(original);
  removed.sources[0].rights.fields = ["id", "kind", "name", "sourceId", "externalIds"];
  assert.throws(() => validateCatalogSnapshot(removed, { requirePublishable: true }), /Field not cleared for publication/);
});
