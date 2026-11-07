# Twenty-eight-game selected-fact readiness gate — 7 November 2026

**Release decision: NOT READY.** The source-backed Gameplay Facts explorer contains
114 short, independently authored positive observations for 28 of the unchanged
30 real catalog games. All 28 reviewed profiles remain **partial**; DevMatch
and Circlanoid have **unknown** non-genre facts. This is an offline evidence
sufficiency diagnostic, not preference-quality or player-utility evaluation.

The public `feature-overlap-2` recommender, Bridge, constraints, share format
and Pages build are unchanged. The exploratory `weighted-tags-graph-experiment-7`
does not use incomplete selected facts as a complete taste vector.

## Reproduce exact inputs

```sh
node scripts/audit-reviewed-tags.mjs --twenty-two > /tmp/readiness-22.json
node scripts/audit-reviewed-tags.mjs --twenty-eight > /tmp/readiness-28.json
node --test test/reviewed-tag-readiness-28.test.js
npm test
```

Protocol `p76-reviewed-twenty-eight-readiness-1` pins:

- Reviewed selected-fact file: `examples/semantic-tags-reviewed-28.v1.json`,
  Git blob `717eb3689c6eaf82b7f826a9633407e9b259e76e`.
- Frozen 30-game catalog blob:
  `0570fd610b14fb336c0de65e6cc3062892abe301`.
- Frozen 30-basket plan blob:
  `e28809801448df2f73c604d0349ce71c042d7f53`.

Identical hard constraints, excluded candidates, seed weights, five ranking modes
(Union, Arithmetic, Least Misery, Intersection, Blend), and top-k **5** remain
fixed. Historical 8/12/14/16/22 audits remain byte-pinned and independently
reproducible. A mismatched catalog, plan, observation file or cohort fails closed.

## Measured fixture-level result (not recommendation quality)

| Evidence check | 22 reviewed | 28 reviewed |
| --- | ---: | ---: |
| Partial profiles | 22 | 28 |
| Unknown profiles | 8 | 2 |
| Complete profiles | 0 | 0 |
| Pairs with two partial observations | 231 | 378 |
| Pairs involving at least one unknown profile | 204 | 57 |
| Pairs with at least one common *selected positive fact* | 42 | 73 |
| Pairs with two complete taste vectors | 0 | 0 |
| Ranked v2 scenarios out of 150 | 0 | 0 |

There are 435 unordered game pairs. The increase from 42 to 73 common
selected-fact pairs (**+31**) is real *positive observation overlap*, not an
estimated whole-game affinity, a validated negative for other pairs, or a
quality uplift. Equal editorial 0.25 weights on the newest games are limited
to selected observations; they are not source-assigned game-wide importance.

**All 150 basket/mode scenarios still abstain.** The unchanged genre method
returns eligible recommendations in some of those same scenarios. Release
gating correctly refuses to replace useful results with incomplete semantic
vectors. Hard-constraint eligibility and unknown required metadata remain
separate from missing taste evidence; no restrictions are relaxed.

This experiment does **not** validate complete weights, rights to redistribute
external store/community tags, human judgments, Bridge utility, accessibility
or deployed Pages. Releasing v2 requires representative rights-cleared
game-wide tag distributions, positive/negative/unknown field semantics,
same-eligibility benchmark with documented losses, explicit method/share
versioning and real-player/browser acceptance.

See [Issue #76](https://github.com/drevendev/Playmancer/issues/76),
[dated source receipts](SEMANTIC_TAGS_REVIEWED_28.md), and
[the preceding 22-profile diagnostic](REVIEWED_TAG_READINESS_22.md).
