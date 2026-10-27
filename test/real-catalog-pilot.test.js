import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validateCatalogSnapshot, catalogCoverage } from "../src/catalog.js";
import { buildBridgePreview } from "../src/bridge-preview.js";
import { rankCandidates } from "../src/ranking.js";

const source = JSON.parse(readFileSync("examples/catalog.multistore.real.json", "utf8"));
const copy = () => structuredClone(source);

test("multistore source has 12 Wikidata titles and all five real Dreven Games", () => {
  const snapshot = validateCatalogSnapshot(source, { requirePublishable: true });
  assert.equal(snapshot.kind, "real");
  assert.equal(snapshot.snapshotId, "multi-store-genre-pilot-2026-10-27");
  assert.equal(snapshot.games.length, 17);
  assert.equal(new Set(snapshot.games.map(game => game.id)).size, 17);
  assert.deepEqual(snapshot.games.filter(game => game.sourceId === "dreven-owned")
    .map(game => game.name), ["Idle Fantasy Shop", "Shadow Runner", "Hunter Adventure", "DevMatch", "Circlanoid"]);
  const stores = snapshot.games.flatMap(game => game.storeLinks);
  for (const [store, count] of [["steam", 11], ["itch", 4], ["googleplay", 2]]) {
    assert.equal(stores.filter(link => link.store === store).length, count);
  }
  for (const game of snapshot.games) {
    assert.equal(game.mechanics, null);
    assert.equal(game.coop, null);
    assert.equal(game.description, null);
    assert.equal(game.parentId, null);
    assert.ok(Object.isFrozen(game.storeLinks));
    for (const link of game.storeLinks) {
      assert.ok(Object.isFrozen(link));
      assert.match(link.url, /^https:\/\//);
    }
    if (game.id.startsWith("wikidata:")) {
      assert.ok(game.externalIds.some(e => e.provider === "wikidata" &&
        e.id.toLowerCase() === game.id.slice(9)));
    }
  }
  const sparse = snapshot.games.find(game => game.id === "dreven:devmatch");
  assert.equal(sparse.themes, null);
  assert.deepEqual(sparse.platforms, ["browser"]);
  assert.equal(catalogCoverage(snapshot).mechanics.known, 0);
  assert.equal(catalogCoverage(snapshot).themes.known, 16);
});

test("storefront allowlist rejects executable, lookalike and inconsistent destinations", () => {
  const mutate = action => { const x = copy(); action(x); return x; };
  const steam = x => x.games[0].storeLinks[0];
  const checkReject = (action, expected) =>
    assert.throws(() => validateCatalogSnapshot(mutate(action), { requirePublishable: true }), expected);
  checkReject(x => { steam(x).url = "javascript:alert(1)"; }, /Unsafe storefront|Invalid storefront/);
  checkReject(x => { steam(x).url = "https://store.steampowered.com.evil.invalid/app/413150"; }, /Invalid Steam/);
  checkReject(x => { steam(x).url = "https://store.steampowered.com/app/999"; }, /external ID mismatch/);
  checkReject(x => { steam(x).url += "?utm_source=secret"; }, /Invalid Steam/);
  checkReject(x => { x.games[0].storeLinks.push(structuredClone(steam(x))); }, /Duplicate storefront/);
  checkReject(x => { x.games[1].storeLinks[0].url = x.games[0].storeLinks[0].url; }, /Duplicate storefront/);
  checkReject(x => { x.sources[0].rights.fields = x.sources[0].rights.fields.filter(f => f !== "storeLinks"); },
    /Field not cleared for publication/);
  checkReject(x => { x.games[12].storeLinks[0].url = "https://drevengames.itch.io.evil.invalid/idle-fantasy-shop"; },
    /Invalid itch/);
  checkReject(x => { x.games[13].storeLinks[1].url += "&utm_campaign=leak"; }, /Invalid Google Play/);
  checkReject(x => { x.games[16].storeLinks[0].url = "http://play.google.com/store/apps/details?id=com.drevengames.circlanoid"; },
    /Unsafe storefront/);
  checkReject(x => { x.games[16].storeLinks[0].unexpected = "private"; }, /Unsupported storefront link/);
});

test("Bridge uses known genre-only evidence and hard co-op never passes unknown", () => {
  const snapshot = validateCatalogSnapshot(source, { requirePublishable: true });
  const route = buildBridgePreview({ catalog: snapshot.games, snapshotId: snapshot.snapshotId,
    startId: "wikidata:q23013817", endId: "wikidata:q332697", minSimilarity: 0.05 });
  assert.equal(route.status, "route");
  for (const step of route.steps) {
    assert.equal(step.evidence_coverage, 0.3);
    assert.ok(step.affinity > 0);
    assert.equal(step.groups.find(g => g.group === "mechanics"), undefined);
  }
  const unknown = buildBridgePreview({catalog:snapshot.games,snapshotId:snapshot.snapshotId,
    startId:"wikidata:q23013817",endId:"wikidata:q332697",coopOnly:true,minSimilarity:0.05});
  assert.equal(unknown.status, "unavailable-endpoint");
  assert.equal(unknown.reason, "unknown");
});

test("store links and author identities cannot boost equal feature affinities", () => {
  const seeds = [{id:"example:seed",weight:1}];
  const a = {id:"dreven:owner",affinities:{"example:seed":0.4},evidenceCoverage:0.3,hardConstraintState:"pass"};
  const b = {id:"wikidata:other",affinities:{"example:seed":0.4},evidenceCoverage:0.3,hardConstraintState:"pass"};
  const ranked = rankCandidates([b,a], seeds, {mode:"intersection"}).ranked;
  assert.equal(ranked[0].scores.intersection, ranked[1].scores.intersection);
  assert.deepEqual(ranked.map(g=>g.id),["dreven:owner","wikidata:other"]);
});

test("Pages build contains 17 real titles, link references and no fictional demo profiles", () => {
  const dir = mkdtempSync(join(tmpdir(),"playmancer-multistore-"));
  try {
    const run = spawnSync(process.execPath,["scripts/build-demo.mjs",dir,"--catalog",
      "examples/catalog.multistore.real.json"],{encoding:"utf8"});
    assert.equal(run.status,0,run.stderr);
    const html=readFileSync(join(dir,"index.html"),"utf8");
    assert.match(html,/name="playmancer-catalog" content="multi-store-genre-pilot-2026-10-27"/);
    assert.match(html,/"kind":"real"/);
    for (const name of ["Idle Fantasy Shop","DevMatch","Circlanoid","Hades","Stardew Valley"])
      assert.ok(html.includes(name),name);
    for (const url of ["https://drevengames.itch.io/idle-fantasy-shop",
      "https://store.steampowered.com/app/413150",
      "https://play.google.com/store/apps/details?id=com.drevengames.circlanoid"])
      assert.ok(html.includes(url),url);
    assert.doesNotMatch(html,/Ember Circuit|Cloud Harvest|Grove Keepers/);
    assert.doesNotMatch(html,/<script[^>]+src=/i);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
