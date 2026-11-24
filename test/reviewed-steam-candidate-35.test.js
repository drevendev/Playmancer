import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appendReviewedSteam } from "../scripts/import-reviewed-steam.mjs";
import { validateCatalogSnapshot } from "../src/catalog.js";
const load = name => JSON.parse(readFileSync(new URL("../examples/" + name, import.meta.url)));
test("35-game candidate replays reviewed receipts and preserves the prior catalog", () => {
  const base = validateCatalogSnapshot(load("catalog.multistore-31.real.json"), { requirePublishable: true });
  const batch = load("reviewed-steam-batch-2026-11-24.json");
  const candidate = load("catalog.multistore-35.real.json");
  const replay = appendReviewedSteam(base, batch);
  assert.deepEqual(replay, candidate);
  assert.deepEqual(replay, appendReviewedSteam(base, { ...batch, games: [...batch.games].reverse() }));
  assert.deepEqual(replay.games.slice(0, 31), base.games);
  assert.equal(replay.games.length, 35);
  assert.equal(replay.games.filter(g => g.kind === "game" && g.storeLinks.length).length, 34);
  assert.equal(replay.games.filter(g => g.id.startsWith("dreven:")).length, 6);
  for (const g of replay.games.slice(31)) {
    assert.equal(g.mechanics, null);
    assert.equal(g.platforms, null);
    assert.equal(g.coop, null);
    assert.equal(g.description, null);
    assert.equal(g.storeLinks.length, 1);
  }
});
