# Sixteen-game selected-fact readiness gate — 6 November 2026

**Release decision: NOT READY.** The additional source-backed observations
for Inscryption and Papers, Please expand the searchable facts inventory but
do not justify enabling weighted recommendation v2. This is an offline,
reproducible evidence sufficiency / eligibility audit, **not** a player
preference, relevance or recommendation-quality benchmark.

Run both the new and previous pinned cohort with exactly the same 30-game
rights-reviewed catalog, 30 frozen baskets, five legacy modes, hard constraints,
exclusions and top-k 5:

```sh
node scripts/audit-reviewed-tags.mjs --fourteen > fourteen-readiness.json
node scripts/audit-reviewed-tags.mjs --sixteen > sixteen-readiness.json
node --test test/reviewed-tag-readiness-16.test.js
npm test
```

Inputs are frozen: `examples/semantic-tags-reviewed-16.v1.json` Git blob
`2e189156ebd7a2185bb5eb29c04c5ce9813a5c01`; 30-game catalog blob
`0570fd610b14fb336c0de65e6cc3062892abe301`; basket plan blob
`e28809801448df2f73c604d0349ce71c042d7f53`. The output protocol
`p76-reviewed-sixteen-readiness-1` does not rewrite the historical
8/12/14-game protocols. Byte drift in the inputs fails closed.

## Evidence and negative result

All 16 reviewed games have **partial** observed vectors; the remaining 14
are **unknown**, not demonstrated to lack those facts. Among 435 unordered
game pairs, 120 have partial observations at both ends and 315 include an
unknown profile. **Zero** pairs have two complete vectors. A selected positive
fact shared by Inscryption and Slay the Spire, `mechanic:deck-building`,
increases observable overlap, **not** calibrated whole-game affinity.
The four 0.25 editorial weights on Inscryption and Papers, Please normalize
selected observations only; they are neither verified game-wide tag importance
nor source-supplied weights.

Under the v2 complete-evidence gate, all **150** fixed basket/mode scenarios
still abstain. The existing genre-based method returns eligible results in
some of those scenarios. Enabling v2 now would therefore hide valid legacy
candidates, not deliver proven better recommendations. The runner checks the
same exact catalog, frozen candidate eligibility, seed/exclusion handling,
hard-constraint unknowns, deterministic output, and CLI/library parity.
No hard constraint is relaxed and no unknown fact is treated as a mismatch.

This report does **not** measure player taste, Bridge route suitability,
human usefulness, absolute catalog feature coverage, actual negatives,
tag-weight calibration, store-data rights or freshness. The public
`feature-overlap-2` ranking and share format remain unchanged.

Before a v2 player migration, source-backed field-level known-present /
known-absent / unknown evidence and justified game-wide weights are required,
followed by fair same-catalog/top-k comparisons with explicitly reported
regressions, separate Bridge acceptance, versioned shares and hosted player
checks. Do not mark a partial profile complete merely because its selected
weights sum to one.

Track remaining gates in [issue #76](https://github.com/drevendev/Playmancer/issues/76).
Source receipts are in
[SEMANTIC_TAGS_REVIEWED_16.md](SEMANTIC_TAGS_REVIEWED_16.md);
the earlier audit remains at
[REVIEWED_TAG_READINESS_14.md](REVIEWED_TAG_READINESS_14.md).
