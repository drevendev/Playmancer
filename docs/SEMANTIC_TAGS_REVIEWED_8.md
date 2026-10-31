# Eight-game selected-fact tag pilot (offline; Issue #76)

**Reviewed 2026-10-31 · PR scope: source-backed experimental data and regression tests only.**
The public 30-game Pages catalog, share format, current player ranking and Bridge method remain unchanged.

This frozen snapshot extends `semantic-tags-reviewed-4.v1.json` without editing it. All four prior observations/receipts are retained **exactly**. Four additional games each have four manually selected factual non-genre tags with equal editorial mass (0.25 per observed fact). These are **partial**, not complete, game profiles.

| Added game (canonical ID) | Primary developer/publisher receipt | Selected facts (not exhaustive) |
| --- | --- | --- |
| Terraria (`wikidata:q332697`) | [Re-Logic / Terraria](https://www.terraria.org/) | Exploration, building, fighting, digging |
| Hollow Knight (`wikidata:q29300592`) | [Team Cherry's games](https://www.teamcherry.com.au/games) | Exploration, action combat, underground kingdom, hand-drawn 2D presentation |
| Celeste (`wikidata:q28451532`) | [Celeste](https://www.celestegame.com/) and [developer changelog](https://www.celestegame.com/changelog.html) | Platforming, dashing, wall jumping, mountain climb |
| Dead Cells (`wikidata:q30639210`) | [Motion Twin / Dead Cells](https://deadcells.com/) | Exploration, action combat, platforming, repeatable runs |

Source review is based on the named first-party websites. Each individual tag has a source URL and each game has a dated receipt. All labels are concise independently authored factual classifications. No store tags, descriptions, publisher copy or artworks are redistributed. URLs do **not** imply permission to republish proprietary content.

## Conservative evidence semantics

This is **8 of 30 games with selected facts**, leaving **22 with `tags: null`**. The weights are deliberately uniform *within each four-fact editorial sample*: neither the sources nor players supplied preference weights, and no feature-completeness study was performed. Do not interpret 0.25 as quality, likelihood, confidence, or objective significance.

The experimental `prepareEvidenceModel` safely abstains on partial vectors: `affinity: null`, `status: uncertain`, `tags.similarity: null`, no inferred missing-tag gaps. `observedOverlap` is only a reproducible diagnostic over the selected normalized tags. In this fixture, Terraria/Hollow Knight share 0.25, Hollow Knight/Dead Cells 0.50, Celeste/Dead Cells 0.25, and Dead Cells/Hades 0.50. **These are not calibrated game similarities, recommendation accuracy, or public player output.** A zero observed overlap is not a verified mismatch.

The frozen source catalog is `multi-store-genre-pilot-30-2026-10-28` (Git blob `0570fd610b14fb336c0de65e6cc3062892abe301`). Any catalog/schema change requires revalidation, not silent substitution. The old four-game pilot remains a separately reproducible fixture.

## Reproduction and promotion gate

```sh
node --test test/semantic-tags-reviewed-8.test.js
npm test
```

Tests pin the exact catalog, prior observations, new publisher/source receipts, tag weights, deterministic projection, 22 unknown profiles, hard-constraint abstention and positive/zero cross-game overlaps. Only after a substantially broader independently sourced catalog, validated absence/completeness semantics, and identical-catalog constrained comparisons should v2 scoring or share versions change. Negative results remain reportable; this fixture alone does not justify switching the live player.
