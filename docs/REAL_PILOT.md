# Real-game genre pilot — source and limitations

**Status: opt-in integration slice, NOT the live Pages default.** Reviewed
2026-10-27. Snapshot ID: `wikidata-genre-pilot-2026-10-27`; source file:
`examples/catalog.wikidata.real.json`. This slice contains **12 real video-game
items**, not a sample representative of the game market. The currently published
Pages build still uses the fictional default. This document does not claim a
successful pull of the Wikidata JSON endpoint, player testing or measured accuracy.

## Rights and exact source

[Wikidata's structured data is CC0](https://www.wikidata.org/wiki/Wikidata:Licensing)
(main/entity/property namespace; policy inspected 2026-10-27). Each immutable
item QID below identifies a structured Wikidata statement source; manually
selected fields came from those human-readable item pages. Do **not** infer rights
to third-party artwork, review text, Wikipedia prose, or publisher descriptions.
All records omit artwork, descriptions and inferred descriptions. The source's
`approved` marker in the validator is the documented field-specific CC0
publication decision, not an independent authenticity or accuracy certification.

Selected only: English item label; genre (`P136`); platform (`P400`).
`instance of` video game was visually checked for selection; editions/DLC are
not silently merged. The QID is used both as the canonical ID and as an explicit
Wikidata external ID. `genres (P136)` are stored in the existing schema's
`themes` slot *as a compatibility adapter only*: they are **not narrative
themes** or verified gameplay mechanics. No `mechanics` data is asserted.
No `coop` evidence is asserted (`null`, never `false` or `true`).
Platform labels: `Microsoft Windows` -> `windows`, `macOS` -> `mac`,
`Linux` -> `linux`. Omitted ports and unreviewed platforms must not be
interpreted as confirmed unsupported; platform lists represent this pilot's
recorded subset, not exhaustive availability. InFamous 2 platform deliberately
remains unknown in this slice.

| Item source | Canonical QID | Selected P136 labels (verbatim) | Selected P400 platforms |
| --- | --- | --- | --- |
| [Stardew Valley](https://www.wikidata.org/wiki/Q23013817) | `Q23013817` | simulation video game; role-playing video game; life simulation game; farming simulation game | windows, mac, linux |
| [Terraria](https://www.wikidata.org/wiki/Q332697) | `Q332697` | action-adventure game; sandbox game; role-playing video game | windows, mac, linux |
| [Mortal Shell](https://www.wikidata.org/wiki/Q96991833) | `Q96991833` | action role-playing game; action game; role-playing video game | windows |
| [Hades](https://www.wikidata.org/wiki/Q59756366) | `Q59756366` | action role-playing game; roguelite; roguelike | windows, mac |
| [Slay the Spire](https://www.wikidata.org/wiki/Q48078440) | `Q48078440` | roguelite; roguelike deck-building game | windows, mac, linux |
| [Spiritfarer](https://www.wikidata.org/wiki/Q80533334) | `Q80533334` | construction and management simulation; platformer | windows, mac, linux |
| [Hollow Knight](https://www.wikidata.org/wiki/Q29300592) | `Q29300592` | Metroidvania; 2D platform game | windows, mac, linux |
| [Celeste](https://www.wikidata.org/wiki/Q28451532) | `Q28451532` | platformer | windows, mac, linux |
| [Portal 2](https://www.wikidata.org/wiki/Q279446) | `Q279446` | puzzle video game; first-person shooter; science fiction video game; post-apocalyptic video game | windows, mac, linux |
| [Infamous 2](https://www.wikidata.org/wiki/Q24300) | `Q24300` | action-adventure game; science fiction video game | unknown |
| [Tell Me Why](https://www.wikidata.org/wiki/Q75493248) | `Q75493248` | adventure video game | windows |
| [Minecraft Legends](https://www.wikidata.org/wiki/Q112430705) | `Q112430705` | strategy video game | windows |

## Measured completeness (this immutable fixture)

- 12/12 IDs/names and Wikidata item URLs.
- 12/12 non-null P136 lists (**genre coverage**); labels have inconsistent
  granularity, and lack of a statement is not proof of no genre.
- 11/12 non-null platform lists
  (possibly incomplete, source-claimed subset).
- 0/12 mechanics, 0/12 co-op, 0/12 descriptions, 0/12 artwork.
- Alias, edition, remake and DLC equivalence is not asserted. An absent alias
  does not justify title-based merging.

**Reproducibility caveat:** the committed snapshot bytes identify the exact
build input through their Git blob SHA. Wikidata's mutable item pages can change;
there is no archived raw Wikidata endpoint response hash or historic statement
revision for this manually transcribed slice. Do not call this an independently
replayable source API extraction. A later importer should capture per-item
statement revision IDs/digests and snapshot checksums before scaling.

## Honest algorithm boundary

The original weighted full-feature model uses mechanics (70%) plus themes
(30%), and normally abstains when comparable coverage is below 70%.
In this explicitly versioned CC0 *genre-only* pilot the minimum comparable
coverage is **30%**, not because mechanics were imputed, but to expose
a clearly labelled weak baseline. The actual evidence coverage stays 30%,
and sharing retains the snapshot/method identity. Full-feature/synthetic
semantics remain untouched. Bridge applies the same version-scoped
boundary to permit routes supported by matching P136 labels. Zero-overlap
games can still appear as **zero-fit**, never a strong match. Popularity,
ratings and artwork are not used.

Hard filters are *not* relaxed: unknown platform/co-op evidence must abstain.
Sparse genre-based similarities are not validated player usefulness.

## Reproduce locally

```sh
node scripts/build-demo.mjs _site-real --catalog examples/catalog.wikidata.real.json
python3 scripts/pages-preflight.py _site-real
python3 -m http.server 8080 --directory _site-real
# CI browser acceptance after dependencies are installed:
python3 scripts/browser-real-catalog-acceptance.py
```

Run the existing full Node/Chromium/Firefox/WebKit acceptance too. This pilot
does **not** switch the public Pages default; a subsequent, separately accepted
change must reconcile the current fictional-default smoke/hosted workflows and
promote this snapshot only after exact-head checks, stable links and real-browser
inspection. The same twelve-item pilot is too small or genre-sparse to establish
useful multi-seed recommendations. Issue #8 tracks catalog expansion and field
quality; issue #10 remains the independent usefulness/evaluation gate.
