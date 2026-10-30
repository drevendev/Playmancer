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
   and bounded strength. Relations are symmetric *only for the affinity measure*:
   the evidence explanation must retain that game A was inspired by B, never
   assert the reverse causal claim. Rights/source review is mandatory.
4. **Transitive similarity** can only traverse two sourced explicit edges,
   never a broad common platform or an automatically inferred neighbor.
   For A—B—C, its maximum strength is `0.5 × strength(A,B) × strength(B,C)`.
   No self-loops, duplicate unordered pairs, or compounded infinite walks.
   A direct edge suppresses the duplicate transitive contribution.

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

The trial composite score is
`0.76 T + 0.13 M + 0.08 D + 0.03 G` where:
- `M` is the **bounded, not missing-field-renormalized** secondary match
  (franchise 0.30, creator 0.27, developer 0.18, publisher 0.12,
  release year 0.05, platform Jaccard 0.08). If no comparable metadata exists,
  `M` is *unknown*, and its score contribution is omitted rather than falsely
  labeled a confirmed mismatch.
- `D` is a direct sourced relation's strength, otherwise unrecorded.
- `G` is the strongest decayed two-hop sourced path, otherwise unrecorded.
  The direct and two-hop contributions are mutually exclusive.

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

Before switching the public player, freeze a licensed/authorized tag snapshot,
record taxonomy aliases and per-field receipts, compare the old method and v2
on **identical** candidates, constraints and top-k, and report where v2 loses.
Test sparse and conflicting baskets, editions/DLC, sources and biases, deterministic
ties, missing evidence, unchanged share compatibility and measured p95
browser execution time on the 250-game ceiling. A popularity proxy or copied
source recommendation list is not independent ground truth.
