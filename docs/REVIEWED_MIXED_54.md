# Reviewed mixed-store receipt tranche — 2026-11-26

Refs #286 and #268. This is an offline candidate, not a published release. The
exact immutable 51-profile base is retained. Three additional released game
identities yield 54 profiles / 53 with storefronts, seven additional links
(two Steam, three Google Play, two itch.io). Each game is counted once.

| Game | Identity and release evidence | Reviewed storefronts |
| --- | --- | --- |
| Mindustry | [Q57206016](https://www.wikidata.org/wiki/Q57206016), [Q97961885 redirects to it](https://www.wikidata.org/wiki/Q97961885), [developer](https://mindustrygame.github.io/) | [Steam](https://store.steampowered.com/app/1127400), [Play](https://play.google.com/store/apps/details?id=io.anuke.mindustry), [itch](https://anuke.itch.io/mindustry) |
| Unciv | [independent developer project](https://github.com/yairm210/Unciv), [released build](https://yairm210.itch.io/unciv); not a Civilization V edition | [Play](https://play.google.com/store/apps/details?id=com.unciv.app), [itch](https://yairm210.itch.io/unciv); no released Steam link asserted |
| Sparklite | [Q110878640](https://www.wikidata.org/wiki/Q110878640), [mobile publisher confirms same Red Blue Games title](https://playdigious.com/games/sparklite) | [Steam](https://store.steampowered.com/app/943140), [Play](https://play.google.com/store/apps/details?id=com.playdigious.sparklite) (full game unlock available, not a demo-only listing) |

Identity and title from reviewed structured CC0 or developer-project factual
identifiers; each store ID/link is recorded against that store's first-party
page. The field allowlist contains only id/kind/name/sourceId/externalIds/storeLinks.
No store content is licensed by this process; no descriptions, images, price,
ratings, reviews or raw API data are copied. All gameplay fields remain null.
Receipt assertions are human review inputs, not automatic proof of legal rights
or release status. Redirect QIDs are reserved as external identities to stop
reimport. Publisher-qualified itch IDs are mandatory for new receipts.

```sh
node scripts/import-reviewed-mixed.mjs examples/catalog.multistore-51.real.json examples/reviewed-mixed-batch-2026-11-26.json /tmp/catalog54.json
node scripts/build-demo.mjs /tmp/playmancer54 --catalog /tmp/catalog54.json
python3 scripts/pages-preflight.py /tmp/playmancer54
node --test test/import-reviewed-mixed.test.js
python scripts/browser-mixed-candidate-acceptance.py
```

The CLI refuses overwrites and sorts games and links independently of input
order. The structural 1,000-row fixture exists only in memory, never counts
as real games. A subsequent release PR must pin the actual candidate snapshot
and exact observation binding, expose the new per-game receipt sources in the
player (the current released UI has historical source-specific routing), pass
strict release preflight and hosted tests, and independently verify publication.
No default catalog, ranking method or historical snapshot was changed here.
