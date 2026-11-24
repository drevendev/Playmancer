import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appendReviewedSteam } from "../scripts/import-reviewed-steam.mjs";
import { validateCatalogSnapshot } from "../src/catalog.js";

const base = JSON.parse(readFileSync(new URL("../examples/catalog.multistore-31.real.json", import.meta.url)));
const row = n => ({
  qid: "Q" + (900000000 + n), name: "Fictional capacity fixture " + n,
  steamAppId: String(900000000 + n),
  storeUrl: "https://store.steampowered.com/app/" + (900000000 + n),
  reviewedBaseGame: true, genres: null
});
// Fabricated receipts test structural capacity only. Never write them to a real snapshot file.
const batch = games => ({ schemaVersion: 1, snapshotId: "test-only-capacity",
  reviewedAt: "2026-11-24", games });

test("reviewed import preserves existing profiles and Dreven entries, with deterministic 1000-row projection", () => {
  const receipts = Array.from({ length: 1000 }, (_, i) => row(i + 1));
  const snapshot = appendReviewedSteam(base, batch(receipts));
  assert.deepEqual(snapshot, appendReviewedSteam(base, batch([...receipts].reverse())));
  const original = validateCatalogSnapshot(base, { requirePublishable: true });
  assert.deepEqual(snapshot.games.slice(0, original.games.length), original.games);
  assert.deepEqual(snapshot.sources.slice(0, original.sources.length), original.sources);
  assert.equal(snapshot.games.length, original.games.length + 1000);
  for (const game of snapshot.games.slice(original.games.length)) {
    assert.equal(game.description, null);
    assert.equal(game.mechanics, null);
    assert.equal(game.themes, null);
    assert.equal(game.platforms, null);
    assert.equal(game.coop, null);
    assert.equal(game.kind, "game");
    assert.equal(game.storeLinks.length, 1);
  }
});

test("reject missing review, DLC-like extra fields, invalid dates, and noncanonical links", () => {
  for (const change of [{ reviewedBaseGame: false }, { kind: "dlc" },
    { storeUrl: row(1).storeUrl + "?tracking=1" }, { genres: [] },
    { qid: "q1" }, { steamAppId: 123 }])
    assert.throws(() => appendReviewedSteam(base, batch([{ ...row(1), ...change }])));
  assert.throws(() => appendReviewedSteam(base, { ...batch([row(1)]), reviewedAt: "2026-02-30" }));
  assert.throws(() => appendReviewedSteam(base, { ...batch([row(1)]), snapshotId: base.snapshotId }));
});

test("reject duplicate identity, normalized title, alias and Steam ID against the whole snapshot", () => {
  const existing = base.games[0];
  const external = existing.externalIds.find(id => id.provider === "steam").id;
  for (const receipts of [
    [row(1), { ...row(2), qid: row(1).qid }],
    [row(1), { ...row(2), name: row(1).name.toUpperCase() }],
    [{ ...row(1), name: existing.name.toUpperCase() }],
    [{ ...row(1), steamAppId: external, storeUrl: "https://store.steampowered.com/app/" + external }]
  ]) assert.throws(() => appendReviewedSteam(base, batch(receipts)));
});

test("literal CC0 genre evidence stays separate from unknown mechanics and platforms", () => {
  const result = appendReviewedSteam(base, batch([{ ...row(1), genres: ["platform game"] }]));
  assert.deepEqual(result.games.at(-1).themes, ["platform game"]);
  assert.equal(result.games.at(-1).mechanics, null);
  assert.throws(() => appendReviewedSteam(base, batch([{ ...row(1), genres: ["duplicate", "duplicate"] }])));
});
