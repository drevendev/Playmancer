import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { appendReviewedMixedStore } from "../scripts/import-reviewed-mixed.mjs";
import { validateCatalogSnapshot } from "../src/catalog.js";

const read = file => JSON.parse(readFileSync(new URL("../examples/" + file, import.meta.url)));
const base = read("catalog.multistore-51.real.json");
const batch = read("reviewed-mixed-batch-2026-11-26.json");
const build = (games, extra = {}) => appendReviewedMixedStore(base, {...batch, games, ...extra});
const [mindustry, unciv, sparklite] = batch.games;

test("reviewed tranche is additive, deterministic, and counts games rather than links", () => {
  const result = build(batch.games);
  const original = validateCatalogSnapshot(base, {requirePublishable: true});
  assert.deepEqual(result.games.slice(0, 51), original.games);
  assert.deepEqual(result.sources.slice(0, original.sources.length), original.sources);
  assert.deepEqual(result, build([...batch.games].reverse().map(row => ({
    ...row, stores: [...row.stores].reverse(), identity: {...row.identity, redirectQids: [...row.identity.redirectQids].reverse()}
  }))));
  assert.equal(result.games.length, 54);
  assert.equal(result.games.filter(game => game.kind === "game" && game.storeLinks.length).length, 53);
  const counts = Object.fromEntries(["steam","googleplay","itch"].map(store =>
    [store, result.games.filter(game => game.storeLinks.some(link => link.store === store)).length]));
  assert.deepEqual(counts, {steam:46, googleplay:5, itch:7});
  for (const row of batch.games) {
    const game = result.games.find(game => game.name === row.name);
    assert.equal(game.kind, "game");
    assert.deepEqual(game.storeLinks, [...row.stores].sort((a,b) => a.store < b.store ? -1 : 1).map(({store,url}) => ({store,url})));
    for (const field of ["description","mechanics","themes","platforms","coop"]) assert.equal(game[field], null);
    const source = result.sources.find(source => source.id === game.sourceId);
    assert.match(source.attribution, /factual identifiers and links only/);
    assert.ok(source.attribution.includes(row.identity.reference));
    for (const store of row.stores) assert.ok(source.attribution.includes(store.url));
    assert.ok(!source.rights.fields.includes("themes"));
  }
  assert.equal(result.games.find(game => game.name === "Unciv").id, "github:yairm210.unciv");
  assert.ok(result.games.find(game => game.name === "Mindustry").externalIds.some(ext => ext.id === "Q97961885"));
});

test("fail closed on unreviewed receipts, extra fields, missing rights and collisions", () => {
  for (const row of [
    {...mindustry, reviewedBaseGame:false}, {...mindustry, kind:"dlc"}, {...mindustry, genres:["strategy"]},
    {...mindustry, name:base.games[0].name.toUpperCase()}, {...mindustry, stores:[]},
    {...mindustry, stores:[mindustry.stores[0], mindustry.stores[0]]},
    {...mindustry, stores:[{...mindustry.stores[0],url:mindustry.stores[0].url + "?tracking=1"}]},
    {...mindustry, stores:[{...mindustry.stores[2],id:"mindustry"}]},
    {...mindustry, stores:[{store:"steam",id:"413150",url:"https://store.steampowered.com/app/413150"}]},
    {...mindustry, identity:{...mindustry.identity, redirectQids:["Q23013817"]}},
    {...mindustry, identity:{...mindustry.identity, reference:"https://example.com/"}},
    {...unciv, identity:{...unciv.identity, reference:"https://github.com/other/Unciv"}},
    {...sparklite, releaseEvidence:"http://example.com/"}
  ]) assert.throws(() => build([row]));
  assert.throws(() => build([mindustry],{rightsBasis:"api-access"}));
  assert.throws(() => build([mindustry],{reviewedAt:"2026-02-30"}));
  assert.throws(() => build([mindustry, {...sparklite, stores:mindustry.stores}]));
  assert.throws(() => build([mindustry, {...sparklite, identity:{provider:"wikidata",id:"Q97961885",reference:"https://www.wikidata.org/wiki/Q97961885",redirectQids:[]}}]));
});

test("1,000 fabricated receipts exercise structural capacity only, without writing a snapshot", () => {
  const rows = Array.from({length:1000},(_,i) => {
    const n = i + 900000000, qid = "Q" + n;
    const id = i%2 ? "fixture" + n + ".itch.io/echoes" : "org.fixture.game" + n;
    return {identity:{provider:"wikidata",id:qid,reference:"https://www.wikidata.org/wiki/"+qid,redirectQids:[]},
      name:"Fictional capacity fixture " + n, reviewedBaseGame:true, releaseEvidence:"https://example.com/",
      stores:[i%2 ? {store:"itch",id,url:"https://"+id} : {store:"googleplay",id,url:"https://play.google.com/store/apps/details?id="+id}]};
  });
  const result = build(rows,{snapshotId:"test-only-mixed-capacity"});
  assert.equal(result.games.length,1051);
  assert.deepEqual(result,build([...rows].reverse(),{snapshotId:"test-only-mixed-capacity"}));
  assert.throws(() => build([...rows,...rows]));
});

test("CLI emits reproducible bytes, refuses overwrites, and agrees with validated projection", () => {
  const dir = mkdtempSync(join(tmpdir(),"playmancer-mixed-"));
  try {
    const run = output => spawnSync(process.execPath,[
      "scripts/import-reviewed-mixed.mjs","examples/catalog.multistore-51.real.json",
      "examples/reviewed-mixed-batch-2026-11-26.json",output],{encoding:"utf8"});
    const a=join(dir,"a.json"), b=join(dir,"b.json");
    for (const path of [a,b]) {
      const result=run(path);
      assert.equal(result.status,0,result.stderr);
      assert.equal(JSON.parse(result.stdout).linkedBaseGames,53);
    }
    assert.equal(readFileSync(a,"utf8"),readFileSync(b,"utf8"));
    assert.deepEqual(JSON.parse(readFileSync(a,"utf8")),build(batch.games));
    assert.notEqual(run(a).status,0);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
