# Reviewed mixed-store candidate: 74 games (2026-11-28)

Refs #268. Four additional distinct base games extend the immutable 70-profile snapshot (blob `ea7f0dbf799351ad37085504dcfc10e2e2e8e994`). The default remains 70; this candidate is not published.

| Game | Identity | Official storefront |
| --- | --- | --- |
| Europa Universalis IV | [Q2625075](https://www.wikidata.org/wiki/Q2625075) | [steam](https://store.steampowered.com/app/236850) |
| Victoria II | [Q1366277](https://www.wikidata.org/wiki/Q1366277) | [steam](https://store.steampowered.com/app/42960) |
| Victoria 3 | [Q106928099](https://www.wikidata.org/wiki/Q106928099) | [steam](https://store.steampowered.com/app/529340) |
| The Life and Suffering of Sir Brante | [Q110740273](https://www.wikidata.org/wiki/Q110740273) | [steam](https://store.steampowered.com/app/1272160), [googleplay](https://play.google.com/store/apps/details?id=com.xp101.rpg.fearless.fantasy.game) |

Reviewed 2026-11-28: the four Steam pages show separate base-game purchase actions. Victoria II and Victoria 3 are separate releases, not editions; Europa Universalis IV is not its starter edition or subscription. Sir Brante's [publisher announcement](https://corp.101xp.com/news/mobile-version) links its Android release, whose Google Play page offers installation; both stores describe the same base game. Region/device availability is not guaranteed. No DLC, bundles, descriptions, ratings, reviews, artwork, prices or unsupported gameplay metadata are imported. Wikidata structured identity is CC0; only factual official identifiers and links are recorded. Renowned Explorers remains outside this batch because its direct structured identity could not be independently retrieved.

```sh
node scripts/import-reviewed-mixed.mjs examples/catalog.multistore-70.real.json examples/reviewed-mixed-batch-2026-11-28c.json /tmp/playmancer-74.json
node scripts/build-demo.mjs /tmp/playmancer-74 --catalog /tmp/playmancer-74.json
```

74 unique profiles, 73 storefront-linked; 66 Steam, 16 Google Play, 12 itch (overlap). All 70 existing games and sources remain unchanged. New gameplay fields remain unknown. Full release evidence binding and default promotion are separate gates. Historical 70 shares remain replayable on the matching build; never rewrite the fragment.
