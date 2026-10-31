# Twelve-game selected-fact semantic tags — 31 October 2026

This **offline-only** evidence slice adds Factorio, RimWorld, Outer Wilds and FTL
to the previous eight independently authored game profiles. It does not alter
the 30-game public catalog, recommender, player UI, versioned share state or
GitHub Pages. Issue [#76](https://github.com/drevendev/Playmancer/issues/76)
tracks the eventual product integration.

## Source receipts (verified 2026-10-31)

| Game | Official first-party source | Four selected observations |
| --- | --- | --- |
| Factorio | [Wube Software](https://direct.factorio.com/game/content) | resource extraction, factory automation, building, production logistics |
| RimWorld | [Ludeon Studios](https://rimworldgame.com/) | colony management, building, combat, AI storyteller events |
| Outer Wilds | [Mobius Digital](https://www.mobiusdigitalgames.com/games.html) | exploration, mystery investigation, space travel, time loop |
| FTL: Faster Than Light | [Subset Games](https://www.subsetgames.com/ftl.html) | space travel, boarding actions, ship systems, repeatable runs |

Each fact is independently summarized as a short canonical label and carries
its source URL. No store/community tags, original publisher prose, art, or
other publisher assets are copied. The included URLs are **evidence**, not
licenses to redistribute underlying descriptions or tags.

The old eight games, taxonomy entries and receipts remain unchanged. All 12
profiles are explicitly **partial**; the other 18 games have **unknown** tag
vectors. The four equal weights per game normalize *selected annotations*, not
a developer-confirmed importance distribution, comprehensive feature list
or confidence estimate. The 10 new canonical tags extend the existing
taxonomy without altering previous IDs.

## Diagnostic cross-game selected-fact intersections

- RimWorld × Terraria: shared building and combat, observed mass **0.50**.
- Factorio × Terraria: shared building, observed mass **0.25**.
- Outer Wilds × Hollow Knight: shared exploration, observed mass **0.25**.
- Outer Wilds × FTL: shared space travel, observed mass **0.25**.
- FTL × Hades: shared repeatable runs, observed mass **0.25**.

These overlaps are **not** full-game similarity scores, recommendation quality,
known mismatches, or grounds for ranking. The experimental v2 model must
continue to return `affinity: null` and `status: uncertain` for all these
pairs. Absent labels are unreviewed, not verified absent. No human comparison
or Bridge evaluation is claimed.

Run `node --test test/semantic-tags-reviewed-12.test.js` and `npm test`
on the exact PR head. Do not silently replace the frozen eight-game readiness
protocol; that negative-result baseline stays reproducible. A later separately
versioned readiness audit may compare this dataset using identical catalog,
constraints and baskets before any player-side promotion.
