# Fourteenth reviewed game: Into the Breach — 5 November 2026

**Scope:** advances #76's published source-backed *observation* inventory; it does not
enable the weighted v2 recommender, alter the genre ranking or claim verified fit.

## Source and precise positive observations

The [official Subset Games Into the Breach page](https://subsetgames.com/itb.html)
was inspected on **2026-11-05**. It describes defending civilian buildings with
mechs, advance warning of enemy attacks, turn-based strategy, and new randomly
generated challenges on successive attempts. The independently written labels in
the new snapshot are:

| Observation ID | Short player-facing fact | Receipt |
| --- | --- | --- |
| `activity:city-defense` | Defending civilian buildings | Official game page |
| `mechanic:telegraphed-attacks` | Enemy attacks previewed in advance | Official game page |
| `mechanic:turn-based-tactics` | Turn-based tactical encounters | Official game page |
| `structure:repeatable-runs` | Repeatable runs (existing taxonomy ID) | Official game page |

The game already has catalog ID `wikidata:q30591391` and a Steam link in the
unchanged 30-game snapshot. No alias, edition, DLC, game identity, ownership
association, storefront, or source-ranked weights were added. The receipt owner
is **Subset Games**, with HTTPS URL `https://subsetgames.com/itb.html`.

## Provenance and reproducibility

New immutable file: `examples/semantic-tags-reviewed-14.v1.json`, Git blob SHA-1
`c2b94e8a9770261f07ba586bdb025c4d7afac049`.
Its `supersedes` field points to the untouched 13-game historical file,
Git blob `426fa34e432bcb10fc96dd48462f0b6d7dc62c9d`.
Catalog remains exact Git blob `0570fd610b14fb336c0de65e6cc3062892abe301`.

There are now **14 partial** and **16 unknown** game profiles, with **58** short
positive observations. There are **zero** complete weighted feature vectors.
Each of the new four observations has weight `0.25` only to normalize the
selected editorial annotations to sum to one. This is **not** source-assigned
importance, evidence confidence, a game-wide tag distribution, or a calibrated
match. Other unseen mechanics, genres, platforms and co-op details remain
unknown; no negative fact is inferred.

Only original short factual labels and source URLs were authored; no publisher
paragraphs, imagery, community tags or bulk store data were imported. The
structural/source-url checks do not independently confer redistribution rights
over publisher content. The legacy snapshots and frozen comparisons are retained
byte-for-byte. Old explorer links fail visibly against the new evidence digest,
rather than being silently reinterpreted.

## Acceptance

`node --test test/semantic-tags-reviewed-14.test.js`, `npm test`,
`npm run build`, `python3 scripts/release-preflight.py _site`, plus hosted
browser checks are release gates. These are *commands*, not evidence of success
until their jobs run. The 30-game player remains on `feature-overlap-2`.
