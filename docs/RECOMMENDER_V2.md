# Recommendation v2: four evidence lanes (experimental)

**Owner direction:** 2026-10-30. **Status:** offline prototype; **not enabled** in the public player.
Code: [src/evidence-similarity.js](../src/evidence-similarity.js); tests:
[test/evidence-similarity.test.js](../test/evidence-similarity.test.js);
tracked implementation and acceptance: [issue #76](https://github.com/drevendev/Playmancer/issues/76).

## Product contract

1. **Tags are the foundation.** Every known game's tag vector has a total
   weight of exactly **1**, distributed across canonical namespace IDs such as
   `genre:crpg`, `mechanic:dialogue-choices`, `art:isometric`,
   `character:party`, and `mood:melancholic`. The per-tag source receipt is
   required. This is a *game's* distribution, not a global tag popularity score.
   Unknown tag vectors are `null` and cause an abstention, not zero similarity.
   Two known, completely disjoint tag vectors have a supported zero overlap.
2. **Secondary metadata** records franchise, creator/author, developer, publisher,
   release year and known platforms, each with a source receipt. A same-year or
   same-platform match is a weak secondary signal, never a genre-equivalent match.
   Missing fields are not mismatches or passes for hard filters.
3. **Explicit editorial relations** record `similar`, `inspired-by`, or
   `references` with distinct canonical endpoints, source receipt, direction
   and bounded strength. The graph is traversable in either direction, but the
   original sourced claim direction is retained. **Only `similar` is a taste
   affinity assertion.** Inspiration and crossover/reference receipts remain
   visible route evidence, not automatic recommendations or fit boosts.
   Rights/source review is mandatory.
4. **Transitive similarity** can only traverse two sourced explicit edges,
   never a broad common platform or an automatically inferred neighbor.
   For A—B—C, its maximum strength is `0.5 × strength(A,B) × strength(B,C)`.
   No self-loops, duplicate unordered pairs, or compounded infinite walks.
   A direct `similar` edge suppresses duplicate transitive **taste** evidence.
   A factual direct receipt can coexist with a separate two-hop `similar`
   route without claiming that the direct receipt proves gameplay similarity.

The experimental tag similarity is the **overlapping tag mass**:
`T(A,B) = Σ_t min(weight_A(t), weight_B(t))` (0–1). For example,
A = {genre:rpg: 0.7, mood:cozy: 0.3} and
B = {genre:rpg: 0.3, mood:cozy: 0.7} gives **T = 0.6**.

For a known pair the explanation also reports residual tag weight on
both sides: `leftOnly` (candidate) and `rightOnly` (favorite), each
with canonical tag ID, residual mass and source receipt. Shared tags
with different weights expose an emphasis gap; overlap plus each side's
residual mass equals 1. Missing vectors yield `null` gaps, not an
invented 100% mismatch. A two-hop explanation retains `hops`, each
with the original authored direction, type, strength and receipt even
when a similarity query traverses it backward. These fields do not
add new ranking boosts.

For an actually observed pair, `metadata.recordedDifferences` lists sourced
**scalar** differences (creator, developer, publisher, franchise or release
year) with both recorded values and their separate receipts. A field missing
on either side is not a difference. Positive, non-exhaustive platform lists
without an observed common platform are **not** reported as a proven
incompatibility. This additive offline explanation distinguishes known
differences from unknowns without changing the composite score, rank
coverage, hard-filter behavior, version-8 method ID, or public player.

Version `weighted-tags-graph-experiment-8` retains the v3 ranking tie-break
guard: factual references/inspirations may raise observed route coverage but
cannot raise taste-comparable coverage or win a score tie. It additionally
prevents a factual direct edge from concealing an independent all-`similar`
two-hop path. `relations.direct` preserves the factual arrow and receipt;
`relations.twoHop` is the strongest explanatory two-hop route and
`relations.fitTwoHop` is the strongest sourced taste path. A sourced direct
`similar` edge suppresses only transitive **taste** (`fitTwoHop`), not the
independent observed two-hop route or its factual source receipts; the latter
may increase observed route coverage but never taste-score or ranking coverage.
Pair explanations expose both `evidenceCoverage`/`evidenceCoverageByLane` and the independent
`tasteEvidenceCoverage`/`tasteEvidenceCoverageByLane` used by rank tie-breaks.
In basket scoring, an all-`similar` two-hop path can raise taste fit only when
its intermediate game **passes the same platform/co-op/exclusion hard filters**
as the basket candidates. Unknown required metadata is not an admissible
intermediate. Context-free pair comparisons still show sourced paths, and
`relations.twoHop` preserves observed graph receipts even when a basket cannot
traverse them; `relations.fitTwoHop` is the constrained scoring path. Observed
route coverage is not playable route availability. This is an offline v6
correctness guard, not evidence of higher player relevance.
Version 7 also changes the **experimental** platform part of metadata
similarity: source-recorded platform lists are positive, non-exhaustive
observations, so a pair earns the same bounded 0.08 metadata-platform
match if **any** platform is recorded for both games. Adding another
recorded platform to either game never decreases that match. No common
recorded platform yields no positive match, **not** proof of
incompatibility; a missing list is separately unknown. This replaces
the version-6 Jaccard ratio, which penalized a game for more complete
platform documentation. The player method and strict platform filter
are unchanged.

Version 8 fixes a **ranking tie-break**: two non-exhaustive positive
platform lists without a recorded shared platform still increase **observed**
metadata coverage, but no longer increase **taste-comparable** coverage.
Neither missing nor disjoint platform receipts receive a taste advantage when
their tag/metadata scores tie. A documented shared platform still contributes
the same bounded match and taste coverage. Strict required-platform filters,
source receipts, and the public player do not change. Version 7 is historical;
its reports cannot be treated as v8 results.

Prior v1/v2/v3/v4/v5/v6/v7 reports are not interchangeable. The public
`feature-overlap-2` method and live player are unchanged.

The trial composite score is
`0.76 T + 0.13 M + 0.08 D + 0.03 G` where:
- `M` is the **bounded, not missing-field-renormalized** secondary match
  (franchise 0.30, creator 0.27, developer 0.18, publisher 0.12,
  release year 0.05, positive recorded platform overlap 0.08). If no comparable metadata exists,
  `M` is *unknown*, and its score contribution is omitted rather than falsely
  labeled a confirmed mismatch.
- `D` is a direct sourced `similar` relation's strength; `inspired-by`
  and `references` links contribute **zero to fit**, though their original
  direction and receipt are still exposed as graph evidence.
- `G` is the strongest decayed two-hop sourced path **among paths where
  both links are `similar`**, and only through basket-eligible intermediates; mixed reference/inspiration routes remain
  explorable but contribute zero to fit. The graph explanation exposes the
  strongest factual route in `relations.twoHop` and separately identifies
  the scoring path in `relations.fitTwoHop` when they differ. A recorded
  direct `similar` edge suppresses a transitive taste contribution, but a
  factual `references`/`inspired-by` direct receipt does **not**. A sourced
  all-`similar` two-hop path can still contribute to taste while the direct
  factual route remains visible. Direct and two-hop *taste* contributions
  remain mutually exclusive.

**These coefficients are experimental, not tuned, and are not confidence
percentages.** Report components, explicit source receipts, comparable metadata
coverage and unknown status separately from the final fit. There is no
proven uplift on real players. Popularity, user ratings and storefronts are
not similarity inputs.

## Schema prototype (synthetic; no redistributable commercial tags)

```json
{
  "games": [
    {
      "id": "demo:dialogue",
      "tags": [
        {"id": "genre:crpg", "weight": 0.4, "source": "authored-fixture"},
        {"id": "mechanic:dialogue-choices", "weight": 0.35, "source": "authored-fixture"},
        {"id": "mood:melancholic", "weight": 0.25, "source": "authored-fixture"}
      ],
      "metadata": {
        "creator": {"value": "Fictional Creator", "source": "authored-fixture"},
        "releaseYear": {"value": 2026, "source": "authored-fixture"},
        "platforms": {"value": ["windows"], "source": "authored-fixture"}
      },
      "coop": null
    }
  ],
  "relations": []
}
```

The existing live schema v1 and `METHOD_VERSION = feature-overlap-2`
remain unchanged. This separate experiment does **not** reinterpret published
basket links. If a future edition adopts it, migrate catalog/source contracts,
method identifiers, share state and Bridge version **explicitly**; incompatible
links must visibly fail rather than silently change meaning.

## Real data and provenance

Steam documents tags for genre, mood, mechanics, player activities, etc.,
and their order can reflect relevance:
https://partner.steamgames.com/doc/store/tags .
This does **not** establish permission to scrape and republish bulk Steam
community tags. Validate terms and per-field rights before importing them.
Google Play, itch.io and Steam are **storefront links** in the player UI; they
are not proof that tags or artwork are redistributable.

**Illustrative documented connection, not a catalog assertion:** the Esoteric
Ebb developer describes adopting some Disco Elysium elements in the official
FAQ: https://steamcommunity.com/app/2057760/discussions/0/759556695324210776/ .
A future rights-reviewed snapshot could record a directed
`inspired-by: Esoteric Ebb → Disco Elysium` edge with that receipt; neither
game is added to the current 30-game snapshot by this experiment.

### Sourced hard-filter diagnostics (offline only)

Each `rankEvidenceBasket` entry in `ranked`, `uncertain` and `excluded`
now exposes `hardConstraintEvidence`: whether the player explicitly excluded
the game, the requested platform and co-op rule, the recorded platform values
and receipt, and the separate co-op observation receipt when one exists.
Platform statuses are `not-required`, `unknown`, `recorded-support` and
`no-matching-receipt`; the last means **not verified to support the requested
platform**, never a sourced assertion of incompatibility. Co-op statuses are
`not-required`, `unknown`, `recorded-yes` and `recorded-no`. Known
negative co-op evidence retains its receipt instead of being reduced to a
generic filter failure. Excluded favorites still have a `seed` reason; explicit
player exclusions remain visible independently. Rejected candidates also
retain per-seed evidence for offline inspection.

This is additive **explanation data**, not a relaxed filter: candidates without
required positive support still cannot rank; excluded or unknown intermediates
still cannot inflate two-hop fit. Scores, ordered baskets, tie-breaks, the
version-8 experimental method ID, public player and share schema are unchanged.
No real-game sources or complete tag-weight profiles were added.

## Canonical platform evidence

In the offline v2 model, a **recorded** platform list must be nonempty,
lowercase, hyphenated canonical tokens (maximum 32 characters), with no
duplicates. The `any` wildcard belongs only to basket filters and never to
a game's source-backed platform list. Empty arrays and misspelled/case-shifted
platform names are rejected during snapshot validation rather than being
treated as evidence that a game fails a hard constraint. A **missing** platform
observation remains unknown, and a required platform filter must abstain;
the validator never invents or normalizes source claims. Unrecognized but
canonical filter tokens remain valid strict filters, not a relaxed fallback.
These are experimental input guards, not a public share-schema change.

## Performance and evaluation gates

The offline implementation supports up to **250** distinct games, **128** tags
per game and **4096** sourced edges, with two-hop graph search bounded by the
curated adjacency of each queried pair. Cache/precompute per-catalog pair
components during build or on first use; no browser-time API/model request.
Do not represent a fixed two-hop bound as unlimited semantic reasoning.

Reuse the existing scalar Intersection and list-level Blend rankers, including
explicit seed weights, exclusion and hard-constraint states. Keep the separate
Bridge route experience conceptually distinct; do not relabel its routing cost
as candidate fit.

For the latest frozen *selected-fact* eligibility study, see the pinned
[sixteen-game readiness audit](REVIEWED_TAG_READINESS_16.md), which extends the
[historical fourteen-game audit](REVIEWED_TAG_READINESS_14.md) without changing
its inputs. There are 16 partial and 14 unknown profiles, **zero complete
pairs**, and abstention in all 150 frozen scenarios. The additional observed
deck-building overlap is a factual shared feature, not a complete similarity
score or a v2 release gate pass.

The newer [20-game selected-fact inventory](SEMANTIC_TAGS_REVIEWED_20.md)
adds Portal 2 and The Witness to the 18-game inventory but **does not** establish complete
weights or a new frozen v2 benchmark. The 16-game gate remains the latest
identical-catalog readiness evaluation until a separate audit is pinned.

Before switching the public player, freeze a licensed/authorized tag snapshot,
record taxonomy aliases and per-field receipts, compare the old method and v2
on **identical** candidates, constraints and top-k, and report where v2 loses.
Test sparse and conflicting baskets, editions/DLC, sources and biases, deterministic
ties, missing evidence, unchanged share compatibility and measured p95
browser execution time on the 250-game ceiling. A popularity proxy or copied
source recommendation list is not independent ground truth.
