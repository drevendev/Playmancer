# Reviewed mixed-store candidate: 66 games (2026-11-28)

Refs #268. Four distinct released base games and eight official links are added to the immutable 62-profile catalog (blob 9bb65478b0b8cc4853fd6f9f252be293bff44b47). The default release configuration selects 66; public delivery requires exact hosted verification.

| Game | Identity | Official storefronts |
| --- | --- | --- |
| Melvor Idle | [Q93395906](https://www.wikidata.org/wiki/Q93395906) | [steam](https://store.steampowered.com/app/1267910), [googleplay](https://play.google.com/store/apps/details?id=com.malcs.melvoridle) |
| Realm Grinder | [Q31605829](https://www.wikidata.org/wiki/Q31605829) | [steam](https://store.steampowered.com/app/610080), [googleplay](https://play.google.com/store/apps/details?id=com.kongregate.mobile.realmgrinder.google) |
| Vampire Survivors | [Q110726215](https://www.wikidata.org/wiki/Q110726215) | [steam](https://store.steampowered.com/app/1794680), [googleplay](https://play.google.com/store/apps/details?id=com.poncle.vampiresurvivors) |
| Graveyard Keeper | [Q56278431](https://www.wikidata.org/wiki/Q56278431) | [steam](https://store.steampowered.com/app/599140), [googleplay](https://play.google.com/store/apps/details?id=com.tinybuild.graveyardkeeper) |

Reviewed 2026-11-28: all four Steam pages show the named base release with a purchase or play action, and each Google Play listing shows an install or buy action. Availability is observed for the returned storefront region, not guaranteed for every device or region. Melvor Idle is distinct from its sequel. Graveyard Keeper DLC is not counted as separate games. Vampire Survivors uses the first-party store title; the Wikidata item currently displays the subtitle First Survivaton but records the exact title and Steam identifier, and Q130721351 redirects to it. The itch web demo is excluded. Only factual identity/title/link fields are projected; no media, store descriptions, prices, reviews or tags are copied. All unreviewed features remain unknown.

```sh
node scripts/import-reviewed-mixed.mjs examples/catalog.multistore-62.real.json examples/reviewed-mixed-batch-2026-11-28.json /tmp/playmancer-66.json
node scripts/build-demo.mjs /tmp/playmancer-66 --catalog /tmp/playmancer-66.json
```

66 unique profiles, 65 linked; 58 Steam, 15 Google Play, 12 itch (overlap). The full default release pins catalog blob `f23f2bbb56e82e772d5c26c27e3e412e5a7c8300` and observation blob `99cfc494fb1f5e6bffd5b57476d1259358f7651c`. It retains all 30 reviewed profiles, 30 receipts and 122 recorded facts; the four new games have unknown gameplay observations.

```sh
node scripts/build-release.mjs _site-66 --candidate-66
python3 scripts/release-preflight.py _site-66 --candidate-66
```

Historical 62-version basket URLs remain incompatible with 66. Preserve the original fragment and recover it unchanged on the matching local HTTP build (`node scripts/build-release.mjs _site-62 --candidate-62`); 58 remains available via `--candidate-58`. Local origin storage is distinct from public Pages; retain exported backups. Default promotion and hosted verification remain separate gates.
