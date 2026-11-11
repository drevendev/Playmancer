# Twenty-nine-game selected-fact readiness gate — 11 November 2026

**Release decision: NOT READY.** The separate Gameplay Facts explorer now
has 118 short independently written positive observations for **29 of the
30 real catalog games**. All 29 selected-fact profiles are **partial**; DevMatch
remains unreviewed. There are **zero verified complete tag vectors**.
The live `feature-overlap-2` recommender, Bridge, hard filters and basket
share format are unchanged. These facts are not game-wide weights.

## Frozen, reproducible offline comparison

```sh
node scripts/audit-reviewed-tags.mjs --twenty-eight > /tmp/readiness-28.json
node scripts/audit-reviewed-tags.mjs --twenty-nine > /tmp/readiness-29.json
node --test test/reviewed-tag-readiness-29.test.js
npm test
```

The new protocol `p76-reviewed-twenty-nine-readiness-1` pins:

- Selected-fact snapshot: `examples/semantic-tags-reviewed-29.v1.json`,
  Git blob `aec15a40ed968916f4120d04aab53731740ee82d`.
- Unchanged 30-game catalog: Git blob `0570fd610b14fb336c0de65e6cc3062892abe301`.
- Unchanged 30-basket plan: Git blob `e28809801448df2f73c604d0349ce71c042d7f53`.

Both cohorts use identical basket IDs/seeds/weights, exclusions, positive-support
hard eligibility, five scalar/list modes (Union, Arithmetic, Least Misery,
Intersection, Blend), and top-k **5**. The experimental model is never allowed
to rank a selected-fact profile as a complete tag vector. The comparison
does not equate Union with Intersection or score Bridge as a scalar mode.

## Observed evidence coverage, not recommendation accuracy

| Frozen offline measure | 28 reviewed | 29 reviewed | Change |
| --- | ---: | ---: | ---: |
| Selected-fact observations | 114 | 118 | +4 |
| Partial profiles | 28 | 29 | +1 |
| Unreviewed profiles | 2 | 1 | −1 |
| Complete game-wide vectors | 0 | 0 | 0 |
| Unordered pairs with two partial profiles | 378 | 406 | +28 |
| Pairs touching an unknown profile | 57 | 29 | −28 |
| Pairs sharing a selected positive tag | 73 | 73 | **0** |
| Rankable v2 basket/mode scenarios / 150 | 0 | 0 | **0** |

The Circlanoid additions establish positive standalone facts but no extra
observed shared-tag pair in this 30-game snapshot. This is an important
**negative result**: greater factual inventory coverage alone has not created
more observed pair overlap, let alone ranking quality. Disjoint selected facts
are **not evidence that two games lack other shared traits**.

All 150 experimental ranking scenarios still abstain rather than turn partial
labels into falsely complete distributions. The genre baseline returns
results for some of the identical baskets. Do **not** replace it with the
experimental model or interpret zero ranked scenarios as zero game similarity.
The shared-eligibility assertion and frozen source checks fail closed on drift.

## Source and release limits

The 29th game's Circlanoid observations rely on independently reworded facts,
with canonical Google Play source URL and **secondary** corroboration because
direct first-party inspection was unavailable on 11 November 2026.
See [the dated receipt and limitation](SEMANTIC_TAGS_REVIEWED_29.md).
No publisher prose/art, external bulk tags or scraped metadata are embedded.

This diagnostic establishes neither licensed complete tags nor a source-backed
importance distribution, real-player preferences, a v2 uplift, separate Bridge
route quality, physical-device accessibility or public release of v2.
The highest-value follow-up is a rights-reviewed complete-weight pilot,
including explicit negative/unknown semantics, then same-catalog and
same-eligibility comparisons reporting regressions. Another selected-fact
count alone is not a v2 release gate.

See [Issue #76](https://github.com/drevendev/Playmancer/issues/76)
and [the previous 28-profile audit](REVIEWED_TAG_READINESS_28.md).
