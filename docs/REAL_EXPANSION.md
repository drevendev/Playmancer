# Seven-game Wikidata CC0 expansion — candidate 2026-10-28

**Status: unpublished PR candidate, NOT `LIVE_VERIFIED`.** The prior 17-game JSON and its share-link version are preserved. New snapshot ID: `multi-store-genre-pilot-2026-10-28` (24 games: 19 Wikidata + five owner-associated).

## Source and rights

Source: [Wikidata structured statements (CC0)](https://www.wikidata.org/wiki/Wikidata:Licensing) and [data access guidance](https://www.wikidata.org/wiki/Wikidata:Data_access). All seven item pages below were inspected **2026-10-28** as video-game entities. Only English label, stated genre (`P136`), selected desktop platform (`P400`) and Steam application ID (`P1733`) enter this catalog. Genre labels map to the existing `themes` field; this is not evidence of gameplay mechanics. A Steam identifier in Wikidata is **not** an independent storefront availability audit. No source descriptions, artwork or ratings are copied.

| QID and item source | Captured `P136` genre labels | Selected desktop `P400` | Source `P1733` Steam ID |
| --- | --- | --- | --- |
| [Factorio](https://www.wikidata.org/wiki/Q16972008) · `Q16972008` | survival game | windows, mac, linux | [427520](https://store.steampowered.com/app/427520) |
| [RimWorld](https://www.wikidata.org/wiki/Q19581568) · `Q19581568` | construction and management simulation; hard science fiction; science fiction video game | windows, mac, linux | [294100](https://store.steampowered.com/app/294100) |
| [Into the Breach](https://www.wikidata.org/wiki/Q30591391) · `Q30591391` | turn-based strategy video game | windows, mac, linux | [590380](https://store.steampowered.com/app/590380) |
| [The Witness](https://www.wikidata.org/wiki/Q1711359) · `Q1711359` | puzzle video game; Metroidbrainia | windows, mac | [210970](https://store.steampowered.com/app/210970) |
| [Outer Wilds](https://www.wikidata.org/wiki/Q19631660) · `Q19631660` | action-adventure game; science fiction video game; Metroidbrainia | windows, mac | [753640](https://store.steampowered.com/app/753640) |
| [Dead Cells](https://www.wikidata.org/wiki/Q30639210) · `Q30639210` | Metroidvania; roguelike; platformer; roguelite | windows, mac, linux | [588650](https://store.steampowered.com/app/588650) |
| [To the Moon](https://www.wikidata.org/wiki/Q1711379) · `Q1711379` | adventure video game; role-playing video game | windows, mac, linux | [206440](https://store.steampowered.com/app/206440) |

## Immutable snapshot and limitations

- Candidate checked-in JSON: [`examples/catalog.multistore-24.real.json`](../examples/catalog.multistore-24.real.json). Git **blob SHA-1** of this exact projection: `e76103935d249c4b8f5941c77489b01a36bf1920`. This is a digest of the committed *projection*, not the raw Wikidata export. Per-claim external citation quality varies, upstream statements may change.
- The first 17 source records, their original order, and both source/rights declarations are unchanged. Existing 17-game release: `multi-store-genre-pilot-2026-10-27`. Old share links must fail visibly against a new snapshot; no silent migration.
- Added records contain no aliases, edition/DLC merges, inferred co-op flags, mechanics, copied descriptions or artwork. Unknown `coop`/features remain `null`; unavailable platform evidence is not a hard-constraint pass.
- Known genre fields: **23/24** (previously 16/17). Mechanics: **0/24**. Co-op: **0/24**. Descriptions: **0/24**. Selected desktop platforms are partial: unlisted systems are not independently disproven. No real-user evaluation has been performed.
- Genre-only matching retains the existing **30% comparable-evidence lane**, not an accuracy score. Single-genre Factorio or Into the Breach may have few/no overlap routes. CC0 data does not establish player usefulness, freshness or commercial availability.
- No API credentials, visitor-time Wikidata/Steam requests, paid feeds, embedded media or hidden promotion. User-activated store links are separate from ranking evidence.

## Verification and delivery gates

```sh
node scripts/validate-catalog.mjs examples/catalog.multistore-24.real.json --publishable
npm test
npm run build
python3 scripts/pages-preflight.py _site
python3 scripts/browser-real-catalog-acceptance.py
python3 scripts/browser-http-acceptance.py
```

New or altered catalog semantics must receive later independent exact-head PR acceptance, passing required CI, merge, then exact-SHA Pages deployment and actual hosted desktop/mobile browser inspection. This document is not deployment evidence.
