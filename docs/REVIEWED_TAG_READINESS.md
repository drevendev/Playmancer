# Eight-game selected-fact readiness gate — 31 October 2026

**Decision: do not promote the selected-fact v2 profiles to the public player.**
This is a reproducible **negative result**, not a failed build or a quality measurement.
It evaluates the existing experimental model using the frozen 30-game, 30-basket
catalog/protocol and the eight-game, source-backed non-genre fixture.

Run without credentials or network access:

```sh
node scripts/audit-reviewed-tags.mjs > reviewed-readiness.json
node --test test/reviewed-tag-readiness.test.js
npm test
```

The audit pins the Git blob of the 30-game publishable catalog
(`0570fd610b14fb336c0de65e6cc3062892abe301`), frozen 30-basket plan
(`e28809801448df2f73c604d0349ce71c042d7f53`) and eight-game selected
facts (`4c480de60b6d09f465cdd29f942ecdf17a6684c9`). It reuses the
existing verified legacy evaluation and sourced platform projections rather
than inventing metadata or silently allowing restricted candidates.

## What this audit can and cannot say

The eight observed games have **partial** tag profiles; the other 22 of 30
have **unknown** tags. No real profile in this fixture has an exhaustively
verified complete vector. Across 435 unordered game pairs, 28 have selected
tags on both ends and 407 involve an unknown profile. Even positive selected
overlap (see `docs/SEMANTIC_TAGS_REVIEWED_8.md`) is not a calibrated
similarity. The current v2 scoring path correctly abstains when either
side has partial or unknown tags.

The frozen protocol contains 30 baskets and five scalar/Blend modes, giving
150 same-catalog, same-hard-constraint scenarios with top-k 5. The report
counts eligible, uncertain and excluded candidates, comparing v2's
`reviewed_top` to the *already existing* legacy top-k on matching baskets.
The test asserts that all 150 v2 scenarios currently return **no rankable
recommendations**. Baseline results are retained to expose the cost of
switching now; this is not a win/loss judgment about recommendation quality.
All hard constraints and explicit exclusions must match the shipped baseline.

The report does **not** evaluate Bridge routing, human preferences, calibrated
weights, tag completeness, recommendation accuracy or publisher/source
priority. It does not change Pages, the shipping scorer, the public catalog
or share-state versions. The `eligibility_parity` flag means strict
hard-filter/exclusion partitions agree, not that results have equal quality.

## Promotion criteria

1. Independently source substantially broader factual profiles while
   distinguishing **known absent**, **known present** and **not yet checked**.
   Do not fabricate missing tags or declare completeness based on four facts.
2. Retain source/rights receipts and validate all weights, taxonomy versions
   and per-game identities before any player-side build.
3. Re-run the same frozen catalog, baskets, constraints and top-k against
   unchanged legacy baselines. Record both regressions and wins.
4. Evaluate Bridge separately, then test desktop/mobile accessibility,
   performance, reproducible sharing and exact hosted Pages before promotion.

Tracking: [Issue #76](https://github.com/drevendev/Playmancer/issues/76).
