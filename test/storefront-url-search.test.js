import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateCatalogSnapshot } from "../src/catalog.js";
import { matchesRecordedStorefrontUrl } from "../src/demo.js";

const snapshot = validateCatalogSnapshot(
  JSON.parse(readFileSync("examples/catalog.multistore-30.real.json", "utf8")),
  { requirePublishable: true }
);
const links = snapshot.games.flatMap(game => game.storeLinks.map(link => ({ game, link })));

test("every recorded 30-game official store URL locates only its owning game", () => {
  assert.ok(links.length > 0);
  for (const { game, link } of links) {
    assert.equal(matchesRecordedStorefrontUrl(game, link.url), true, link.url);
    for (const other of snapshot.games) {
      if (other.id !== game.id) assert.equal(matchesRecordedStorefrontUrl(other, link.url), false, other.id);
    }
  }
});

test("pasted Steam, itch.io and Google Play URLs tolerate ordinary store sharing variants", () => {
  for (const store of ["steam", "itch", "googleplay"]) {
    const entry = links.find(item => item.link.store === store);
    assert.ok(entry, `Missing recorded ${store} link in the real snapshot`);
    const { game, link } = entry;
    const query = store === "steam" ? link.url + "/My-Game/?utm_source=friend"
      : store === "itch" ? link.url + "/?ref=friend"
      : link.url + "&hl=en&gl=US";
    assert.equal(matchesRecordedStorefrontUrl(game, query), true, query);
    assert.equal(matchesRecordedStorefrontUrl(game, " " + query + " "), true);
  }
});

test("official-host identity checking rejects lookalikes and never guesses missing links", () => {
  const steam = links.find(item => item.link.store === "steam");
  const google = links.find(item => item.link.store === "googleplay");
  assert.ok(steam && google);
  const steamPath = new URL(steam.link.url).pathname;
  assert.equal(matchesRecordedStorefrontUrl(steam.game, "https://store.steampowered.com.evil.test" + steamPath), false);
  assert.equal(matchesRecordedStorefrontUrl(steam.game, "http://store.steampowered.com" + steamPath), false);
  assert.equal(matchesRecordedStorefrontUrl(steam.game, steam.link.url + "0"), false);
  assert.equal(matchesRecordedStorefrontUrl(steam.game, "https://store.steampowered.com@evil.test" + steamPath), false);
  assert.equal(matchesRecordedStorefrontUrl(steam.game, "not a store URL"), false);
  assert.equal(matchesRecordedStorefrontUrl(steam.game, steam.link.url + "?id=another"), true,
    "Steam tracking query must not change the recorded app identity");
  assert.equal(matchesRecordedStorefrontUrl(google.game, google.link.url + "&id=com.example.second"), false);
  assert.equal(matchesRecordedStorefrontUrl({ storeLinks: [], externalIds: steam.game.externalIds }, steam.link.url), false,
    "An external ID without a recorded storefront link is not sufficient evidence");
});


// Test-only URLs are never fetched or included in the published catalog.
function itchFixture(first = "echoes", second = "echoes") {
  const input = structuredClone(snapshot);
  const owners = ["playmancer-fixture-a.itch.io", "playmancer-fixture-b.itch.io"];
  for (const [i, id] of [first, second].entries()) {
    input.games.push({
      id: "fixture:echoes-" + i, kind: "game", name: "Test-only Echoes " + i,
      sourceId: "dreven-owned", externalIds: [{ provider: "itch", id }],
      storeLinks: [{ store: "itch", url: "https://" + owners[i] + "/echoes" }]
    });
  }
  return input;
}
test("same itch slug on two publisher hosts resolves independently, with stable serialization", () => {
  for (const ids of [
    ["echoes", "echoes"],
    ["playmancer-fixture-a.itch.io/echoes", "echoes"],
    ["playmancer-fixture-a.itch.io/echoes", "playmancer-fixture-b.itch.io/echoes"]
  ]) {
    const raw = itchFixture(...ids);
    const valid = validateCatalogSnapshot(raw, { requirePublishable: true });
    const pair = valid.games.slice(-2);
    assert.deepEqual(pair.map(g => g.externalIds[0].id), ids);
    assert.deepEqual(valid.games.slice(0, -2), snapshot.games);
    assert.deepEqual(validateCatalogSnapshot(JSON.parse(JSON.stringify(valid)), { requirePublishable: true }), valid);
    for (const game of pair) {
      assert.deepEqual(valid.games.filter(g => matchesRecordedStorefrontUrl(g, game.storeLinks[0].url)).map(g => g.id), [game.id]);
    }
  }
});
test("itch rejects ambiguous, unbound and mismatched identities in either legacy or qualified form", () => {
  const cases = [
    g => { g[1].storeLinks[0].url = g[0].storeLinks[0].url; },
    g => { g[1].externalIds[0].id = "playmancer-fixture-a.itch.io/echoes"; },
    g => { g[1].externalIds[0].id = "different-slug"; },
    g => { g[1].storeLinks = []; },
    g => { g[1].externalIds[0].id = "playmancer-fixture-b.itch.io/echoes"; g[1].storeLinks = []; },
    g => { g[1].storeLinks[0].url = "https://playmancer-fixture-b.itch.io.invalid/echoes"; },
    g => { g[1].storeLinks[0].url = "http://playmancer-fixture-b.itch.io/echoes"; },
    g => { g[1].externalIds.push({provider: "itch", id: "playmancer-fixture-b.itch.io/echoes"}); },
    g => { g[1].externalIds = []; },
    g => { g[1].storeLinks.push(structuredClone(g[1].storeLinks[0])); }
  ];
  for (const mutate of cases) {
    const raw = itchFixture();
    mutate(raw.games.slice(-2));
    assert.throws(() => validateCatalogSnapshot(raw, { requirePublishable: true }));
  }
});
test("all historical multistore catalogs preserve canonical IDs and stored itch IDs", () => {
  for (const suffix of ["", "-24", "-30", "-31", "-35", "-51"]) {
    const raw = JSON.parse(readFileSync("examples/catalog.multistore" + suffix + ".real.json", "utf8"));
    const valid = validateCatalogSnapshot(raw, {requirePublishable:true});
    assert.deepEqual(valid.games.map(g => g.id), raw.games.map(g => g.id));
    for (const game of valid.games) {
      const original = raw.games.find(g => g.id === game.id);
      assert.deepEqual(game.externalIds, original.externalIds ?? []);
      assert.deepEqual(game.storeLinks, original.storeLinks ?? []);
    }
  }
});
