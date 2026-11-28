import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appendReviewedMixedStore } from "../scripts/import-reviewed-mixed.mjs";
import { validateCatalogSnapshot } from "../src/catalog.js";
const read = name => readFileSync(new URL("../examples/" + name, import.meta.url), "utf8");
const base = JSON.parse(read("catalog.multistore-62.real.json"));
const batch = JSON.parse(read("reviewed-mixed-batch-2026-11-28.json"));
test("66-profile candidate is a reproducible additive reviewed import", () => {
  const result = appendReviewedMixedStore(base, batch);
  assert.equal(JSON.stringify(result, null, 2) + "\n", read("catalog.multistore-66.real.json"));
  assert.deepEqual(result.games.slice(0, 62), validateCatalogSnapshot(base).games);
  assert.deepEqual(result.sources.slice(0, base.sources.length), base.sources);
  assert.equal(result.games.length, 66);
  assert.equal(result.games.filter(g => g.kind === "game" && g.storeLinks.length).length, 65);
  assert.deepEqual(Object.fromEntries(["steam","googleplay","itch"].map(store =>
    [store,result.games.filter(g=>g.storeLinks.some(s=>s.store===store)).length])), {steam:58,googleplay:15,itch:12});
  assert.deepEqual(result,appendReviewedMixedStore(base,{...batch,games:[...batch.games].reverse().map(row=>({...row,stores:[...row.stores].reverse()}))}));
  for(const row of batch.games) {
    const game=result.games.find(g=>g.id==="wikidata:"+row.identity.id.toLowerCase());
    assert.equal(game.name,row.name);
    assert.equal(game.storeLinks.length,row.stores.length);
    for (const redirect of row.identity.redirectQids) assert.ok(game.externalIds.some(e=>e.provider==="wikidata" && e.id===redirect));
    for(const key of ["description","mechanics","themes","platforms","coop"]) assert.equal(game[key],null);
    const source=result.sources.find(s=>s.id===game.sourceId);
    for(const url of [row.identity.reference,row.releaseEvidence,...row.stores.map(s=>s.url)]) assert.ok(source.attribution.includes(url));
    assert.ok(!source.rights.fields.includes("themes"));
  }
  assert.throws(()=>appendReviewedMixedStore(result,{...batch,snapshotId:"duplicate-receipt-regression"}));
});
