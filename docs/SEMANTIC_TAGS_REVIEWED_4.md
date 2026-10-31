# Four-game editorial non-genre tag pilot (offline)

**Issue #76 · reviewed 2026-10-31 · experimental only; not shipped in Pages or the player.**

Purpose: replace pure uniform-genre proxies with a small, manually verified set of *factual, non-genre* observations on four games already present in the frozen 30-game public catalog. This is a reproducible data/validation slice, **not** a source-complete commercial tag index, a proven relevance model, or a v2 rollout.

## Review receipts

| Canonical catalog title | Creator/publisher source | Manually selected facts |
| --- | --- | --- |
| Stardew Valley (`wikidata:q23013817`) | [ConcernedApe — game features](https://www.stardewvalley.net/) | Farming, fishing, crafting, befriending townsfolk |
| Spiritfarer (`wikidata:q80533334`) | [Thunder Lotus — Spiritfarer](https://thunderlotusgames.com/games/spiritfarer/) | Farming, fishing, boat construction, caring for spirit passengers |
| Hades (`wikidata:q59756366`) | [Supergiant — Hades FAQ](https://www.supergiantgames.com/blog/hades-faq/) | Repeatable roguelike runs, action combat, varying character builds, character stories |
| Slay the Spire (`wikidata:q48078440`) | [Mega Crit — press kit](https://www.megacrit.com/press-kits/slay-the-spire/) | Repeatable roguelike runs, deck building, relic collection, multiple playable heroes |

Each selected fact has its own `source` URL in `examples/semantic-tags-reviewed-4.v1.json`, backed by dated `receipts` for the developer/publisher page. All 13 canonical tag labels are short, independently authored factual descriptions. **No store user-tags, source prose, images or proprietary game assets are copied.** Citing an external page does not grant a license to republish its content. These editorial factual labels are not a claim that official store-derived tags are CC0.

## Frozen, conservative semantics

- Base snapshot: `multi-store-genre-pilot-30-2026-10-28`, Git blob `0570fd610b14fb336c0de65e6cc3062892abe301`. Any change requires explicit revalidation.
- Exactly four games have partial observations; the other **26 of 30** are **`tags: null`**, never an empty vector or zero similarity.
- Each observed vector contains four selected facts at **0.25 each** (sum 1). Equal mass is an editorial smoke-test convention, **not source importance, confidence, completeness or learned taste weights**.
- **Explicit partial-coverage semantics:** all four observed vectors declare `tagCoverage: "partial"`. The offline model exposes `observedOverlap` as a strictly *selected-fact* diagnostic, but returns `similarity: null`, `affinity: null`, `status: "uncertain"` and `leftOnly/rightOnly: null` for any comparison involving a partial profile. An observed overlap of zero is **not** verified dissimilarity; unmatched normalized weight is **not** a justified game-feature gap. A complete vector, by contrast, retains the existing weighted-mass comparison for historical synthetic and genre-only experiments. This safe abstention blocks premature ranking from unrepresentative editorial tags; it does not establish true feature completeness or a useful v2 recommender.
- No curated relation edges, publisher metadata, popularity or ratings are inferred. Required platform/co-op metadata is not filled from guesses. The shipped genre-only algorithm and share versions remain unchanged.

## Reproduce

    node --test test/semantic-tags-reviewed-4.test.js
    npm test

Tests pin the catalog Git blob, game identities, primary-source receipts, taxonomy, tag mass, deterministic projection, missingness, strict constraint abstention and sourced non-genre overlaps. The offline smoke comparison finds **0.50** shared tag mass for Stardew Valley / Spiritfarer (farming + fishing) and **0.25** for Hades / Slay the Spire (repeatable runs). These numbers measure just the chosen *editorial fixture*, **not recommendation accuracy or ranking affinities**. Both comparisons are marked uncertain and cannot enter the v2 ranking from this pilot alone. Zero selected-fact overlap and missing profiles abstain as well.

## Promotion gate

Extend coverage with independently reviewed receipts and reproducible rights analysis; keep incomplete profiles explicitly uncertain; improve verified coverage before any scoring of unknown feature gaps. Freeze a larger snapshot and evaluate against the existing genre-only method on identical eligibility, hard filters, baskets and top-k, including negatives and usefulness judgments. Only then consider method/catalog/share-version migration and player/Pages deployment.
