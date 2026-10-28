import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { catalogCoverage, validateCatalogSnapshot } from "../src/catalog.js";

const prior = JSON.parse(readFileSync("examples/catalog.multistore-24.real.json", "utf8"));
const proposed = JSON.parse(readFileSync("examples/catalog.multistore-30.real.json", "utf8"));
const newIds = ["wikidata:q248810", "wikidata:q4308783", "wikidata:q1784048",
  "wikidata:q14565978", "wikidata:q109051201", "wikidata:q54906424"];

test("30-game CC0 snapshot preserves all 24 prior source records and rights", () => {
  const valid = validateCatalogSnapshot(proposed, { requirePublishable: true });
  assert.equal(valid.snapshotId, "multi-store-genre-pilot-30-2026-10-28");
  assert.equal(valid.kind, "real");
  assert.equal(valid.games.length, 30);
  assert.deepEqual(proposed.sources, prior.sources);
  assert.deepEqual(proposed.games.slice(0, prior.games.length), prior.games);
  assert.equal(valid.games.filter(g => g.sourceId === "wikidata-cc0").length, 25);
  assert.equal(valid.games.filter(g => g.sourceId === "dreven-owned").length, 5);
  assert.equal(catalogCoverage(valid).themes.known, 29);
  for (const field of ["mechanics", "coop"]) {
    assert.equal(catalogCoverage(valid)[field].known, 0);
  }
  assert.deepEqual(valid.games.slice(24).map(g => g.id), newIds);
});

test("six new entries use unique source identities and safe Steam links without invented traits", () => {
  const valid = validateCatalogSnapshot(proposed, { requirePublishable: true });
  const keys = valid.games.flatMap(game => game.externalIds.map(x => JSON.stringify([x.provider, x.id])));
  assert.equal(keys.length, new Set(keys).size);
  const urls = valid.games.flatMap(game => game.storeLinks.map(x => x.url));
  assert.equal(urls.length, new Set(urls).size);
  for (const game of valid.games.slice(24)) {
    assert.equal(game.kind, "game");
    assert.equal(game.sourceId, "wikidata-cc0");
    assert.deepEqual(game.aliases, []);
    assert.equal(game.parentId, null);
    assert.equal(game.mechanics, null);
    assert.equal(game.coop, null);
    assert.equal(game.description, null);
    assert.ok(game.themes.length > 0 && game.platforms.length > 0);
    const qid = game.externalIds.find(x => x.provider === "wikidata");
    assert.equal(game.id, "wikidata:" + qid.id.toLowerCase());
    const steam = game.externalIds.find(x => x.provider === "steam");
    assert.deepEqual(game.storeLinks, [{ store: "steam", url: "https://store.steampowered.com/app/" + steam.id }]);
  }
});

test("new static build contains the 30-game catalog and source receipt without external media", () => {
  const directory = mkdtempSync(join(tmpdir(), "playmancer-real-30-"));
  try {
    const run = spawnSync(process.execPath, ["scripts/build-demo.mjs", directory, "--catalog",
      "examples/catalog.multistore-30.real.json"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const html = readFileSync(join(directory, "index.html"), "utf8");
    assert.match(html, /name="playmancer-catalog" content="multi-store-genre-pilot-30-2026-10-28"/);
    assert.match(html, /"kind":"real"/);
    for (const game of proposed.games.slice(24)) assert.ok(html.includes(game.name), game.name);
    assert.match(html, /REAL_EXPANSION_30\.md/);
    assert.doesNotMatch(html, /<script[^>]+src=/i);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
