> Historical 12-game Wikidata-only snapshot and evidence. The next
> multistore pilot is a separate immutable catalog:
> [Storefront sources and five Dreven Games entries](STOREFRONTS.md).
> The 12-game receipt remains here for provenance; it must not be
> confused with the later 17- or 24-game releases.

# Real-game Wikidata pilot — frozen 2026-10-27

## What this release actually supports

This is **twelve real, identifiable games** in a **small, incomplete CC0 dataset**,
not a licensed game-art library or a claim that this recommender is already
effective for all players. The player uses the exact versioned
`wikidata-genre-pilot-2026-10-27` snapshot for search, basket ranking,
genre-driven Intersection/Blend/Bridge, explanation and share-link restoration.
The repository keeps a separate fictional fixture for validation and regressions.

## Source and redistribution

- Primary source: [Wikidata structured items](https://www.wikidata.org/wiki/Wikidata:Licensing).
  **Structured entity labels/claims are CC0**. Content in other Wikimedia namespaces
  and third-party media are not automatically CC0.
- Access guidance: [Wikidata data access](https://www.wikidata.org/wiki/Wikidata:Data_access).
  This pilot is a **manually reviewed static projection**, not a live API
  integration; visitors make no Wikidata requests.
- Canonical `wikidata:qN` IDs and external IDs are grounded in the referenced
  item QIDs; selected games are labeled as video games in their source items.
- Fields: `name` from the item English label, `themes` from genre claims
  (`P136`, displayed under genre labels, not factual narrative themes),
  `platforms` from selected platform claims (`P400`) mapped to Windows/macOS/Linux
  when recorded. Genre display terms may be normalized; this is not an exhaustive
  original-statement dump and the source items are the authority.
- `mechanics: null`, `coop: null`, `description: null`, empty aliases, absent
  artwork: **unknown/unavailable, never manufactured**. The pilot's 30%-coverage
  genre-only lane is explicitly separate from full synthetic mechanic+theme
  scoring. Genre overlap is a *weak exploratory signal* rather than preference
  measurement. `P400` lists may be incomplete; an unlisted platform is not
  independent proof of incompatibility.
- The checked-in publishable projection is
  [`examples/catalog.wikidata.real.json`](../examples/catalog.wikidata.real.json);
  receipt: git **blob SHA-1** `5c922a23cc0954414c2b0fe46732669198b7b345`. This SHA identifies the exact
  reviewed **file**, *not* a raw Wikidata dump or primary source digest.
  Re-collecting/revising claims requires a new immutable snapshot ID.
- Retrieval/inspection date: **2026-10-27** for the QID pages cited below and
  the licensing/data-access policies. Per-statement primary-source references
  and full completeness assessments are **not established** by this lightweight
  pilot; do not market this as comprehensive game metadata.

## Per-item identification and field receipts

Each link provides the current source item and its `instance of`, genre and platform
statements for inspection. Counts describe fields in the committed snapshot,
not Wikidata completeness or supported platform coverage.

| Wikidata item | QID | Captured genre labels | Recorded mapped desktop platforms |
| --- | --- | ---: | --- |
| [Stardew Valley](https://www.wikidata.org/wiki/Q23013817) | `Q23013817` | 4 | windows, mac, linux |
| [Terraria](https://www.wikidata.org/wiki/Q332697) | `Q332697` | 3 | windows, mac, linux |
| [Mortal Shell](https://www.wikidata.org/wiki/Q96991833) | `Q96991833` | 3 | windows |
| [Hades](https://www.wikidata.org/wiki/Q59756366) | `Q59756366` | 3 | windows, mac |
| [Slay the Spire](https://www.wikidata.org/wiki/Q48078440) | `Q48078440` | 2 | windows, mac, linux |
| [Spiritfarer](https://www.wikidata.org/wiki/Q80533334) | `Q80533334` | 2 | windows, mac, linux |
| [Hollow Knight](https://www.wikidata.org/wiki/Q29300592) | `Q29300592` | 2 | windows, mac, linux |
| [Celeste](https://www.wikidata.org/wiki/Q28451532) | `Q28451532` | 1 | windows, mac, linux |
| [Portal 2](https://www.wikidata.org/wiki/Q279446) | `Q279446` | 4 | windows, mac, linux |
| [Infamous 2](https://www.wikidata.org/wiki/Q24300) | `Q24300` | 2 | unknown |
| [Tell Me Why](https://www.wikidata.org/wiki/Q75493248) | `Q75493248` | 1 | windows |
| [Minecraft Legends](https://www.wikidata.org/wiki/Q112430705) | `Q112430705` | 1 | windows |

**Coverage in the shipped projection:** 12/12 identifiable
names and canonical IDs; 12/12 genre lists;
11/12 mapped platform lists;
0/12 observed mechanics; 0/12 reviewed co-op flags;
0/12 descriptions or cleared images.
Known genre tags can be sparse or misleading; no artwork/text was copied.

## Build and acceptance

```sh
npm test
node scripts/build-demo.mjs _site-wikidata --catalog examples/catalog.wikidata.real.json
python3 scripts/pages-preflight.py _site-wikidata
node scripts/build-demo.mjs _site-fictional
```

These commands reproduce the historical twelve-game catalog separately from the
current 24-game Pages default selected by `npm run build`; the last command builds
the synthetic sample. The release workflow tests the current selected catalog and
keeps the older snapshots available for explicit validation.
A green PR build is **not** a deployed release: `master`, Pages revision
and public desktop/mobile screenshots must be independently verified after merge.

## Known user-facing limitations

This initial catalog is intentionally tiny, excludes DLC/edition variants, and
has no authorized cover art or authored descriptions. Finding unrelated games
may yield zero overlap or zero-score candidates; the product must explain that
rather than claim a strong whole-basket match. `coopOnly` must abstain because
all co-op flags are unknown. Exact game availability/platforms are not validated
against current storefronts. Source metadata and rights do not prove user
satisfaction; issue #10 remains the evaluation gate. Keep this provenance
visible and add richer rights-cleared features before claiming meaningful
recommendation accuracy.
