# Reviewed 51-profile candidate (2026-11-25)

Refs #268. This is an opt-in candidate, not a claim of publication. It extends the exact 35-profile catalog (blob `a994db70f4bdf9a02dfec2336fa768de255474e5`) with sixteen distinct base-game Steam references. The new catalog has 51 identities, 50 with a storefront, and 44 Steam-linked games. All existing Dreven Games records and the previous 30 reviewed partial Gameplay Facts profiles are preserved. New genre, platform, co-op and mechanics fields remain unknown; the 16 additions are discoverable by identity/title/store URL, not a claim of recommendation rankability.

Identity/title and Steam application IDs were checked against the individual Wikidata structured items ([CC0 policy](https://www.wikidata.org/wiki/Wikidata:Licensing)) and official Steam base-game pages on 2026-11-25. Only normalized title, identifiers and canonical links are added; no store descriptions, assets, prices or raw API data. Trackmania denotes the 2020 base game, not the 2003 release or a subscription.

| Game | Identity | Official link |
|---|---|---|
| Deep Rock Galactic | [Q55381944](https://www.wikidata.org/wiki/Q55381944) | [548430](https://store.steampowered.com/app/548430) |
| XCOM 2 | [Q20030150](https://www.wikidata.org/wiki/Q20030150) | [268500](https://store.steampowered.com/app/268500) |
| Civilization VI | [Q24050047](https://www.wikidata.org/wiki/Q24050047) | [289070](https://store.steampowered.com/app/289070) |
| Cities: Skylines | [Q18149274](https://www.wikidata.org/wiki/Q18149274) | [255710](https://store.steampowered.com/app/255710) |
| Euro Truck Simulator 2 | [Q29016907](https://www.wikidata.org/wiki/Q29016907) | [227300](https://store.steampowered.com/app/227300) |
| Kerbal Space Program | [Q1471545](https://www.wikidata.org/wiki/Q1471545) | [220200](https://store.steampowered.com/app/220200) |
| Subnautica | [Q21039915](https://www.wikidata.org/wiki/Q21039915) | [264710](https://store.steampowered.com/app/264710) |
| The Talos Principle | [Q18620506](https://www.wikidata.org/wiki/Q18620506) | [257510](https://store.steampowered.com/app/257510) |
| A Short Hike | [Q66035140](https://www.wikidata.org/wiki/Q66035140) | [1055540](https://store.steampowered.com/app/1055540) |
| Castle Crashers | [Q640567](https://www.wikidata.org/wiki/Q640567) | [204360](https://store.steampowered.com/app/204360) |
| Crypt of the NecroDancer | [Q16259371](https://www.wikidata.org/wiki/Q16259371) | [247080](https://store.steampowered.com/app/247080) |
| Total War: Warhammer III | [Q105427208](https://www.wikidata.org/wiki/Q105427208) | [1142710](https://store.steampowered.com/app/1142710) |
| Trackmania | [Q91573142](https://www.wikidata.org/wiki/Q91573142) | [2225070](https://store.steampowered.com/app/2225070) |
| Street Fighter 6 | [Q110999026](https://www.wikidata.org/wiki/Q110999026) | [1364780](https://store.steampowered.com/app/1364780) |
| Human: Fall Flat | [Q43541160](https://www.wikidata.org/wiki/Q43541160) | [477160](https://store.steampowered.com/app/477160) |
| Hades II | [Q115641620](https://www.wikidata.org/wiki/Q115641620) | [1145350](https://store.steampowered.com/app/1145350) |

```sh
node scripts/import-reviewed-steam.mjs examples/catalog.multistore-35.real.json examples/reviewed-steam-batch-2026-11-25.json /tmp/catalog51.json
node scripts/build-release.mjs /tmp/playmancer51 --candidate-51
python3 scripts/release-preflight.py /tmp/playmancer51 --candidate-51
node --test test/release-candidate-51.test.js
```

The exact catalog/evidence binding is independent of 30/31/35 historical bindings. The default remains 35 until independent acceptance and a later publication promotion. No synthetic records are counted.
