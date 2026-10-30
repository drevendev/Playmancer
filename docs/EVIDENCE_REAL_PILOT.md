# Frozen 30-game pilot: real-identity genre-only v2 diagnostic

**Issue:** #76. **Scope:** offline experiment, NOT live player ranking.
**Frozen input:** `examples/catalog.multistore-30.real.json`,
snapshot `multi-store-genre-pilot-30-2026-10-28`, Git blob
`0570fd610b14fb336c0de65e6cc3062892abe301`.
**Plan:** the predeclared 30 baskets from
`examples/evaluation-baskets-30.real.json`, Git blob
`e28809801448df2f73c604d0349ce71c042d7f53`, with unchanged hard filters,
exclusions, positive weights, top-five, and Blend lambda 0.3.

## Run (Node.js 22; no credentials or network)

`node --test test/evidence-real-pilot.test.js`

`node scripts/compare-real-evidence.mjs > /tmp/playmancer-p76-real-proxy.json`

Repeat the command and byte-compare files to verify determinism. The runner
loads the already approved immutable catalog, verifies the complete basket
plan against its committed Git blob (two-space JSON serialization plus LF),
reuses the existing `evaluateFrozenPilot` legacy computation and its
exact-catalog-blob check, and
compares it with `src/evidence-similarity.js` on the identical 30 candidate
IDs, eligibility, 30 baskets and five ranking modes: Union, arithmetic,
least-misery, Intersection, Blend. Bridge is NOT benchmarked or redefined.
A valid change to any basket weight, order, constraint or exclusion is rejected
as a changed protocol rather than silently relabeled as the predeclared pilot.
The report includes both frozen catalog and plan blob identities.

## What evidence actually exists

The catalog has **29 games with recorded genres and one game (DevMatch)
without genres**. Each known genre list is deterministically projected into
canonical `genre:` IDs, with **equal diagnostic weight 1/N** per observed label.
Weights sum to one, but **these weights are authored uniform proxies**, NOT
Wikidata vote weights, official tag ranks, game importance, player judgments
or a complete semantic tag description. The prototype's normalized genre lane
must not be described as 76% of *all possible* gameplay evidence.
Null genre lists remain unknown; no hidden inference from store categories.

Per-field source receipts point to Wikidata QID P136/P400 statements
(CC0) or owner-published Dreven Games listings and frozen catalog IDs.
Source publication rights are checked through `src/catalog.js`; see
`docs/REAL_EXPANSION_30.md` and `docs/STOREFRONTS.md`.
The only v2 secondary metadata is **observed platforms**. Missing platform
data remain unknown under platform constraints. All 30 co-op flags are
unknown, so the co-op-required basket must abstain. No creator, developer,
franchise, release year, artwork, mood, mechanics, curated edges, two-hop
associations or storefront-ranking boosts are invented. Explicit relations
remain empty, not inferred from shared genre.

## Read the JSON honestly

The 150 rows retain old/new ordered top-five lists, per-seed observed genre
overlap, experimental composite fit, coverage, abstentions, hard exclusions
and count of top recommendations supported by **all** seeds' known genres.
The report records changed orders and both increases **and decreases** in
observed genre support; none are proof of human preference or uplift.
Protocol `p76-frozen-real-genre-proxy-2` adds
`v2_top_observed_evidence[].observed_genre_gaps_by_seed`: each
candidate/favorite pair retains source-backed `candidate_only` and
`favorite_only` genre mass, including unequal emphasis on shared tags.
Known overlap plus either residual mass sums to 1; unobserved vectors
remain `null`, not zero overlap. The frozen catalog/plan, ranking,
eligibility and live-player method are unchanged.
The v2 coefficient vector remains experimental and does not become a
confidence percentage. A pair of records with matching platforms but no
matching genre can have a small positive composite fit: consult
`observed_genre_support_by_seed` rather than calling it a deep taste match.

This is an incremental **rights-cleared real-identity diagnostic**, NOT a
fully weighted-tag release. A player-facing switch needs independently
cleared non-genre tag fields with field receipts, predeclared evaluation with
real player judgments, a separate Bridge analysis, method/catalog/share
version handling, performance and browser acceptance, plus verified
publication. The public `feature-overlap-2` player and existing Pages
catalog are unchanged by this experiment.
