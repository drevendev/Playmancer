# Reviewed Steam candidate: 70 games (2026-11-28)

Refs #268. Four additional distinct base games extend the immutable 66-profile snapshot (blob `f23f2bbb56e82e772d5c26c27e3e412e5a7c8300`). The release default remains 66. This is not a published expansion.

| Game | Identity | Official storefront |
| --- | --- | --- |
| Mount & Blade II: Bannerlord | [Q18361009](https://www.wikidata.org/wiki/Q18361009) | [Steam](https://store.steampowered.com/app/261550) |
| Crusader Kings III | [Q71701894](https://www.wikidata.org/wiki/Q71701894) | [Steam](https://store.steampowered.com/app/1158310) |
| Stellaris | [Q20829312](https://www.wikidata.org/wiki/Q20829312) | [Steam](https://store.steampowered.com/app/281990) |
| Thea 2: The Shattering | [Q88802315](https://www.wikidata.org/wiki/Q88802315) | [Steam](https://store.steampowered.com/app/606230) |

Reviewed 2026-11-28: the named Steam base-game pages expose individual purchase actions; no bundle, demo, DLC or deluxe edition is counted separately. Availability is limited to the observed storefront region. Bannerlord's Q6004466 redirects to Q18361009 and is reserved as an alternate external identity. Thea 2 is distinct from Thea: The Awakening; the Steam release is the full base game, not its separate demo. No store descriptions, images, tags, reviews or price data are imported. The Wikidata identities and factual official links are the only new data. Unreviewed genres, platforms, mechanics and co-op remain unknown.

```sh
node scripts/import-reviewed-mixed.mjs examples/catalog.multistore-66.real.json examples/reviewed-mixed-batch-2026-11-28b.json /tmp/playmancer-70.json
node scripts/build-demo.mjs /tmp/playmancer-70 --catalog /tmp/playmancer-70.json
```

70 unique profiles, 69 storefront-linked; 62 Steam, 15 Google Play, 12 itch (overlap). All 66 previous games and sources remain unchanged. The opt-in five-file release pins catalog blob `ea7f0dbf799351ad37085504dcfc10e2e2e8e994` and observation blob `bf459c7e6b9c417d4a9c91e91142f7b474a04ad0`. It retains 30 reviewed profiles, 30 receipts and 122 positive facts without alteration. The four added games have unknown gameplay observations; no new ranking evidence is inferred. Default promotion and exact hosted verification are separate gates. Preserve old basket fragments and restore them with the matching historical build, including `--candidate-66`.

```sh
node scripts/build-release.mjs _site-70 --candidate-70
python3 scripts/release-preflight.py _site-70 --candidate-70
```

The previous 66 release remains the default, and `--candidate-66` and `--candidate-62` remain available. Restore historical links unchanged using the matching local HTTP build; local storage is origin-scoped. The 70-profile explorer pages through 24/24/22 cards and tests exact identity coverage, comparison filters and an unknown-versus-observed comparison.
