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
