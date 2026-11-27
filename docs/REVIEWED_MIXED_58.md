# Reviewed mixed-store candidate: 58 games (2026-11-27)

Refs #268. This opt-in candidate adds four distinct base games to the exact 54-profile catalog (blob ce7c193254894f6cd633a01e290c2e4a693bd984). It is not the default release and has no separately bound observation explorer yet.

| Game | Identity | Steam | Google Play | itch.io |
| --- | --- | --- | --- | --- |
| Peglin | [Q119802718](https://www.wikidata.org/wiki/Q119802718) | [1296610](https://store.steampowered.com/app/1296610) | [com.RedNexusGamesInc.Peglin](https://play.google.com/store/apps/details?id=com.RedNexusGamesInc.Peglin) | [gedig.itch.io/peglin](https://gedig.itch.io/peglin) |
| Baba Is You | [Q62061666](https://www.wikidata.org/wiki/Q62061666) | [736260](https://store.steampowered.com/app/736260) | [org.hempuli.baba](https://play.google.com/store/apps/details?id=org.hempuli.baba) | [hempuli.itch.io/baba](https://hempuli.itch.io/baba) |
| Dicey Dungeons | [Q66311564](https://www.wikidata.org/wiki/Q66311564) | [861540](https://store.steampowered.com/app/861540) | [com.terrycavanaghgames.diceydungeons](https://play.google.com/store/apps/details?id=com.terrycavanaghgames.diceydungeons) | [terrycavanagh.itch.io/dicey-dungeons](https://terrycavanagh.itch.io/dicey-dungeons) |
| A Dance of Fire and Ice | [Q104762097](https://www.wikidata.org/wiki/Q104762097) | [977950](https://store.steampowered.com/app/977950) | [com.fizzd.connectedworlds](https://play.google.com/store/apps/details?id=com.fizzd.connectedworlds) | [fizzd.itch.io/a-dance-of-fire-and-ice](https://fizzd.itch.io/a-dance-of-fire-and-ice) |

Reviewed 2026-11-27: the itch pages offer full downloadable games; A Dance of Fire and Ice also has a browser demo on its same page. Dicey Dungeons uses the publisher's **terrycavanagh.itch.io** hostname, not the unverified terrycavanaghgames hostname. Peglin's Android listing is the same base game, not a separate identity. No copied descriptions, tags, screenshots, reviews, ratings, prices or license claims about store assets. Wikidata identity/title are CC0; the storefront identifiers and links are factual references checked against the named listings. Unreviewed features remain null. The same existing positive-platform/genre-pilot policy is explicitly applied to this snapshot, without adding evidence.

Reproduce without overwriting:
```sh
node scripts/import-reviewed-mixed.mjs examples/catalog.multistore-54.real.json examples/reviewed-mixed-batch-2026-11-27.json /tmp/playmancer-58.json
node scripts/build-demo.mjs /tmp/playmancer-58 --catalog /tmp/playmancer-58.json
```
Expected candidate: 58 distinct profiles, 57 linked, 50 Steam, 9 Google Play, 11 itch (overlap). The public 54-profile snapshot and release workflow remain unchanged. Separate production observation binding, historical 54 replay/recovery, strict release preflight and live validation are required before promotion.
