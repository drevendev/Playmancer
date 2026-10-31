# Twelve-game selected-fact readiness gate — 31 October 2026

**Release decision: do not promote v2 to the public player.** This is an
offline eligibility/abstention audit, **not** a recommendation-quality study.

This protocol extends the earlier eight-game negative-result audit without
rewriting its pinned fixture. Both cohorts use the **same** rights-cleared
30-game catalog, frozen 30-basket plan, five legacy modes (union, arithmetic,
leastMisery, intersection and blend), hard constraints, exclusions and top-k 5.

Run both versioned reports offline, without credentials or API requests:

```sh
node scripts/audit-reviewed-tags.mjs > eight-readiness.json
node scripts/audit-reviewed-tags.mjs --twelve > twelve-readiness.json
node --test test/reviewed-tag-readiness.test.js test/reviewed-tag-readiness-12.test.js
npm test
```

The twelve-game fixture is pinned to Git blob
`cd79f729d960f5c495c2d1e16448ff8058f582dd`,
the catalog to `0570fd610b14fb336c0de65e6cc3062892abe301`,
and the frozen plan to `e28809801448df2f73c604d0349ce71c042d7f53`.
The eight-game protocol remains `p76-reviewed-eight-readiness-1`; this
cohort is `p76-reviewed-twelve-readiness-1`. Altered source blobs fail
closed instead of silently replacing evidence.

## Interpreting the report

There are 12 **partial** observed profiles and 18 **unknown** profiles.
Across 435 unordered game pairs, 66 have partial observations on both ends,
369 have at least one unknown profile and **zero** have two complete vectors.
Observed tag intersections may increase, but remain diagnostics rather than
verified full-game affinities or evidence of absent features.

All 150 ranked scenarios must still abstain under the existing v2 evidence
rules. The legacy top-k is retained to quantify the cost of switching
prematurely. The report verifies identical candidate eligibility and unknown
required platform/co-op fields; it cannot measure usefulness, Bridge routes,
human preference, tag importance, or weight calibration.

**Do not silently turn the four selected facts per game into a complete
preference distribution.** Source receipts support only presence of those
features; unmentioned features remain unchecked. The next release gate is
substantially broader independently supported evidence with explicit
known-present/known-absent/unknown status, followed by a fair same-catalog,
same-filter benchmark and separate Bridge evaluation.

Tracking: [Issue #76](https://github.com/drevendev/Playmancer/issues/76).
