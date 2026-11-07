# Twenty-two-game selected-fact readiness gate — 7 November 2026

**Release decision: NOT READY.** Gameplay Facts now contains 90 independently
authored, source-linked positive observations for **22 of the 30** immutable
real-catalog games. The additional Portal 2, The Witness, Super Meat Boy,
To the Moon and other reviewed observations improve the *fact explorer* but
do **not** establish complete whole-game taste vectors. This is an offline
evidence sufficiency and hard-filter parity audit, **not** measured preference
quality, player usefulness, or a completed Recommender v2 release.

The public method remains `feature-overlap-2`. No ranking, Bridge,
basket-link format, storefront data or Pages behavior changes in this audit.

## Reproduce

Run the old and new pinned cohorts on the **same** 30-game publishable catalog,
30 frozen baskets, five legacy ranking modes, identical constraints, exclusions
and top-k 5:

```sh
node scripts/audit-reviewed-tags.mjs --sixteen > sixteen-readiness.json
node scripts/audit-reviewed-tags.mjs --twenty-two > twenty-two-readiness.json
node --test test/reviewed-tag-readiness-22.test.js
npm test
```

The newest selected-fact file is
`examples/semantic-tags-reviewed-22.v1.json` (Git blob
`73a40215d2ad77668a68d7a2aa4c43e2bdcfb4f9`).
The shared catalog blob remains
`0570fd610b14fb336c0de65e6cc3062892abe301`
and the basket-plan blob remains
`e28809801448df2f73c604d0349ce71c042d7f53`.
Protocol `p76-reviewed-twenty-two-readiness-1` pins the inputs and fails
closed on any changed bytes or plan version. Historic 8/12/14/16 reports
are unchanged.

## Evidence and negative result

All 22 reviewed profiles are **partial**, with the other eight **unknown**.
Among the catalog's 435 unordered game pairs, 231 have a partial observation
vector at both ends and 204 include at least one unknown vector.
**Zero pairs have two verified complete vectors.** The 22-game snapshot has
42 pairs with at least one *positive selected-fact overlap*, versus 26 in the
frozen 16-game cohort (+16). These are observable *positive matches*, not
calibrated whole-game affinity or evidence of an absent mechanic.

Consequently, under the v2 complete-evidence gate, **all 150 fixed
basket/method scenarios abstain**. The legacy genre method has nonempty
recommendations for some of these same eligible baskets. Replacing it with the
partial-fact prototype now would remove eligible suggestions; expanding the
inventory alone is not a quality improvement. Hard constraints, explicit
exclusions, and unknown required metadata are independently checked for
parity; no constraint is silently relaxed.

All four 0.25 weights on newly observed games are editorial normalization
over **selected facts**, not source-provided semantic importance and not a
verified unit-mass representation of a whole game's taste. No missing tag is
converted into a known negative.

This does not evaluate Bridge usefulness, externally validated human
preferences, recommendation precision, actual negatives, weight calibration,
full field-level coverage, storefront tag rights or live player accessibility.
The next release gate requires genuinely representative, rights-cleared
per-game weights and known-present/known-absent/unknown field evidence, then a
same-catalog/top-k evaluation with recorded losses, separate Bridge checks,
explicit method/share versioning, and hosted browser acceptance.

See [issue #76](https://github.com/drevendev/Playmancer/issues/76),
[source receipts for the 22-game cohort](SEMANTIC_TAGS_REVIEWED_22.md), and
[the preceding sixteen-game audit](REVIEWED_TAG_READINESS_16.md).
