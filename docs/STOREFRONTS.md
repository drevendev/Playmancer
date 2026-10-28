# Multi-store Playmancer catalog — curated 27 October 2026

**Release evidence:** The historical 17-game snapshot was live-verified at [`dfb5f668`](https://github.com/drevendev/Playmancer/actions/runs/40540951449). Its five Dreven Games entries were retained in the later 24-game snapshot, live-verified at [`e20941f`](https://github.com/drevendev/Playmancer/actions/runs/40620507170). These are revision-specific results, not proof of the currently served revision. See [seven additional Wikidata receipts](REAL_EXPANSION.md).
**Snapshot ID:** `multi-store-genre-pilot-2026-10-27`.
**Source JSON:** [`examples/catalog.multistore.real.json`](../examples/catalog.multistore.real.json).
The existing [12-title CC0 pilot](REAL_PILOT.md) stays in the repo as a
different immutable version. Old share links fail visibly, never silently
substitute editions or another game's ID.

## What is and is not imported

- The original 12 games retain [Wikidata CC0 structured data](https://www.wikidata.org/wiki/Wikidata:Licensing)
  for identity, genre (`P136`) and partial desktop platforms (`P400`).
  Official Steam pages have been inspected for 11 corresponding game IDs.
  Only verified **store URLs and identifiers** are recorded; Steam's
  descriptions, ratings, reviews, prices, cover images and copyrighted
  promotional materials are **not copied**. A public [Steamworks API](https://partner.steamgames.com/doc/webapi_overview)
  endpoint is not a blanket license to redistribute every field.
- Five Dreven Games games were confirmed by the publisher's
  [itch.io page](https://drevengames.itch.io/),
  [DevMatch page](https://drevengames.itch.io/devmatch) and
  [Google Play developer profile](https://play.google.com/store/apps/developer?id=Dreven+Games).
  The owner authorized including their games. We manually map broad genre
  descriptors from **owner-authored storefront listings**, rather than
  generating unsupported mechanics, narrative descriptions or quality ratings.
  `browser` means a confirmed HTML5 listing; `android` means a confirmed
  Google Play listing. This is not a guarantee of availability on every device.
- No visitor-time store calls, key discovery, automated scraping, login,
  unauthorized resale of metadata, image/CDN hotlinks or undisclosed tracking.
  Clicking a visible link is the only step that navigates to an external store.

## Dreven Games (creator association disclosed, no ranking preference)

| Game | Verified destination(s) | Observed source, conservative genre mapping |
| --- | --- | --- |
| Idle Fantasy Shop | [itch.io](https://drevengames.itch.io/idle-fantasy-shop) | Simulation, Management, Idle → simulation + management |
| Shadow Runner | [itch.io](https://drevengames.itch.io/shadow-runner), [Google Play](https://play.google.com/store/apps/details?id=com.TrilobytesStudio.ShadowRunner) | Platformer, 2D, Runner → platformer + action |
| Hunter Adventure | [itch.io](https://drevengames.itch.io/hunter-adventure) | Adventure + Roguelike → adventure + roguelike |
| DevMatch | [itch.io](https://drevengames.itch.io/devmatch) | HTML5 listing exists, genre **unknown** → affinity abstains |
| Circlanoid | [Google Play](https://play.google.com/store/apps/details?id=com.drevengames.circlanoid) | Arcade category and publisher-described circular action → arcade + action |

These are independent `dreven:` canonical IDs, not collapsed into
similarly named third-party games. The publisher relationship and storefronts
are metadata **excluded from ranking inputs**; owner titles receive no
hidden boost. Mechanics, co-op, source descriptions, artwork and popularity
are unavailable and not inferred. Co-op hard constraints still abstain.

## Verified Steam product pages for existing Wikidata identities

| Game | Steam App ID |
| --- | ---: |
| Stardew Valley | [413150](https://store.steampowered.com/app/413150) |
| Terraria | [105600](https://store.steampowered.com/app/105600) |
| Mortal Shell | [1110910](https://store.steampowered.com/app/1110910) |
| Hades | [1145360](https://store.steampowered.com/app/1145360) |
| Slay the Spire | [646570](https://store.steampowered.com/app/646570) |
| Spiritfarer | [972660](https://store.steampowered.com/app/972660) |
| Hollow Knight | [367520](https://store.steampowered.com/app/367520) |
| Celeste | [504230](https://store.steampowered.com/app/504230) |
| Portal 2 | [620](https://store.steampowered.com/app/620) |
| Tell Me Why | [1180660](https://store.steampowered.com/app/1180660) |
| Minecraft Legends | [1928870](https://store.steampowered.com/app/1928870) |

Infamous 2 has no confirmed Steam game storefront in this release;
do not manufacture a game page or silently link to another edition.

## Future automatic updates: specific access gate

- [itch.io authenticated `profile/games`](https://itch.io/docs/api/serverside)
  requires a developer's `profile:games` scope. A public profile page
  is not a substitute for this API permission.
- [Google Play Developer API](https://developers.google.com/android-publisher/getting_started)
  requires authorized API access to the developer account.
- Steam storefront data should only be adopted at scale after checking the
  exact endpoint terms, publishable field rights and update limits, not by
  circumventing provider restrictions.
- For any future import: retrieve on an authorized CI server, validate
  source/field rights, canonical identity and collisions, then publish a
  new immutable static snapshot. Never ship credentials in Pages or logs.

The current browser consumes a frozen, rights-gated snapshot, checks
HTTPS/host/path/ID consistency for every storefront and makes no external
requests during normal ranking. All external pages are user-activated only.
