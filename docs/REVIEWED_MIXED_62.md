# Reviewed mixed-store candidate: 62 games (2026-11-27)

Refs #268. Four distinct base games and seven official storefront links added to the immutable 58-profile catalog (blob 4b53da90a07cdefc57997a3233d0296c7f593298). The historical 62-game release remains reproducible using the explicit flag below.

| Game | Identity | Official storefronts |
| --- | --- | --- |
| Disco Elysium - The Final Cut | [Q127164835](https://www.wikidata.org/wiki/Q127164835) | [steam](https://store.steampowered.com/app/632470) |
| Suzerain | [Q106483475](https://www.wikidata.org/wiki/Q106483475) | [steam](https://store.steampowered.com/app/1207650), [googleplay](https://play.google.com/store/apps/details?id=com.torporgames.suzerain) |
| I Was a Teenage Exocolonist | [Q113622732](https://www.wikidata.org/wiki/Q113622732) | [steam](https://store.steampowered.com/app/1148760), [itch](https://finji.itch.io/exocolonist) |
| The Gardens Between | [Q56808989](https://www.wikidata.org/wiki/Q56808989) | [steam](https://store.steampowered.com/app/600990), [googleplay](https://play.google.com/store/apps/details?id=com.thevoxelagents.thegardensbetween) |

Reviewed 2026-11-27: each Steam page offers the independent base-game purchase. Disco Elysium's updated PC Final Cut on 632470 is counted once; mobile reimagining excluded. Suzerain's base Sordland release is separate from Rizia; its Android app includes the base. Finji/Northway's itch release offers a downloadable full game; The Voxel Agents' Android release offers purchase. No descriptions, artwork, tags, prices or ratings copied. Wikidata identity/title are CC0; links are factual references. Unreviewed features stay unknown. No claim of worldwide availability.

```sh
node scripts/import-reviewed-mixed.mjs examples/catalog.multistore-58.real.json examples/reviewed-mixed-batch-2026-11-27b.json /tmp/playmancer-62.json
node scripts/build-demo.mjs /tmp/playmancer-62 --catalog /tmp/playmancer-62.json
```

62 unique profiles, 61 linked; 54 Steam, 11 Google Play, 12 itch (overlap). The full historical release binds the exact catalog blob `9bb65478b0b8cc4853fd6f9f252be293bff44b47` and observation blob `1d02909f335531ede09db8cd1665c12cf6f0f404` without changing any of the 30 reviewed profiles, 30 receipts or 122 recorded facts. All four added profiles have unknown gameplay observations. Build and validate the five-file release:

```sh
node scripts/build-release.mjs _site-62 --candidate-62
python3 scripts/release-preflight.py _site-62 --candidate-62
```

Historical 58-version basket URLs remain incompatible with 62. Keep the original fragment and recover it unchanged on the matching local HTTP build created with `node scripts/build-release.mjs _site-58 --candidate-58`. A local origin is not public Pages storage; retain original exported backups. No historical hosted path is promised. Default promotion and hosted verification are separate gates.
