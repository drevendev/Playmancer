# Fourteen-game selected-fact readiness gate — 5 November 2026

**Release decision: NOT READY.** The 14-game snapshot broadens the separately
published Gameplay Facts explorer, but it does not establish complete weighted
profiles or justify switching the public recommender from `feature-overlap-2`.
This is an offline eligibility and abstention diagnostic, **not** a relevance,
quality or player-utility benchmark.

Run the three pinned cohorts against the **same** rights-reviewed 30-game
catalog, 30 frozen baskets, five legacy ranking modes, strict filters,
exclusions and top-k 5:

```sh
node scripts/audit-reviewed-tags.mjs > eight-readiness.json
node scripts/audit-reviewed-tags.mjs --twelve > twelve-readiness.json
node scripts/audit-reviewed-tags.mjs --fourteen > fourteen-readiness.json
node --test test/reviewed-tag-readiness-14.test.js
npm test
```

The new fixture is the immutable `examples/semantic-tags-reviewed-14.v1.json`
with Git blob SHA-1 `c2b94e8a9770261f07ba586bdb025c4d7afac049`.
The catalog remains `0570fd610b14fb336c0de65e6cc3062892abe301`,
and the frozen basket plan remains
`e28809801448df2f73c604d0349ce71c042d7f53`.
The protocol `p76-reviewed-fourteen-readiness-1` is separate from the
eight- and twelve-game historical audits. Any byte-level fixture/catalog
change fails closed rather than silently replacing the study inputs.

## What the report can establish

The 30-game catalog has **14 partial** and **16 unknown** observed tag
profiles. The 435 unordered game pairs partition into **91** pairs with
selected observations on both ends and **344** pairs with at least one unknown
profile; **zero** pairs have two complete tag vectors. A known positive
intersection among the selected facts is observable, but cannot be promoted
to a full-game taste score; an unmentioned mechanic is neither a verified
negative nor a zero-weight mismatch.

Under the current experimental v2 gate all **150** constrained, frozen
basket/mode scenarios must therefore abstain, while the legacy method still
returns eligible recommendations for some scenarios. The test checks
hard-filter, seed and exclusion parity, exact blob receipts, deterministic
output and the CLI/library agreement. This is a **negative release result**:
a v2 swap at current evidence coverage would hide otherwise eligible games.

The audit does not evaluate Bridge routes, causal tag importance, 14-game
recommendation usefulness, human preferences, or catalog freshness.
No external API or store material is fetched. The selected-fact weights sum
to one **only within the chosen observations**; they are not calibrated
game-wide importance. Do not mark any selected profile `complete`
without a separately justified exhaustive field-coverage contract.

Tracking: [Issue #76](https://github.com/drevendev/Playmancer/issues/76).
The separate explorer inventory and sources are in
[SEMANTIC_TAGS_REVIEWED_14.md](SEMANTIC_TAGS_REVIEWED_14.md).
