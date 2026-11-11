# Four-game conditional editorial weight experiment — 11 November 2026

**Release decision: NOT READY.** This is a small reproducible, offline
sensitivity experiment over existing independently written positive observations,
**not a new public ranker**. The current 30-game player remains
`feature-overlap-2`; its catalogs, hard filters, Bridge, shares, Pages and source
receipts are unchanged.

## What became testable

The frozen 29-profile Gameplay Facts snapshot assigns four selected observations
per game equal mass (0.25 each). That is a neutral counting convenience, not a
gameplay-importance estimate. This experiment supplies **explicit, nonuniform,
manually authored allocation hypotheses** for exactly four existing catalog games:

| Game | Selected-positive emphasis (editorial proposal) | Original source receipt |
| --- | --- | --- |
| Factorio | Automation .38, logistics .32, building .16, extraction .14 | [Wube game content](https://direct.factorio.com/game/content) |
| RimWorld | Colony management .36, storyteller events .29, building .19, combat .16 | [Ludeon Studios](https://rimworldgame.com/) |
| Dwarf Fortress | Colony management .34, building .27, digging .22, farming .17 | [Bay 12 Games features](https://www.bay12games.com/dwarves/features.html) |
| Terraria | Digging .27, building .25, exploration .24, combat .24 | [Re-Logic](https://www.terraria.org/) |

These official publisher/developer references support the **presence** of the
independently labeled facts. They **do not supply the numerical weights**. The
relative weights are explicitly subjective editorial hypotheses for a future
calibration exercise; they are neither store/community tags nor scraped publisher
text. No game has a hidden promotional boost. Each four-fact selected-positive
mass sums to 1, but this is **not** a complete, game-wide distribution.

The proposal in `examples/semantic-weights-editorial-4.v1.json` pins the
immutable 30-game catalog and its 29-game observation fixture using their Git
blob SHA-1s. `src/editorial-weight-pilot.js` rejects changed snapshots,
unknown keys, additional/removed tags, missing values and incorrectly
normalized weights. The original tags, labels, source URLs, observations and
`tagCoverage: partial` markers are inherited unchanged. All other games keep
the original source fixture, including unknown DevMatch.

## Same-catalog, same-observations sensitivity — not recommendation quality

Run from the repository root:

```sh
node scripts/audit-editorial-weights.mjs > /tmp/editorial-weight-pilot-4.json
node --test test/editorial-weight-pilot-4.test.js
npm test
npm run build
```

The diagnostic compares the exact same 30-game snapshot and source observations
under equal-mass vs manually allocated selected-positive weights. For four
declared pairs, **observed positive overlap** changes as follows:

| Pair | Equal-mass selected overlap | Editorial selected overlap | Difference |
| --- | ---: | ---: | ---: |
| Factorio ↔ Terraria | .25 | .16 | −.09 |
| Factorio ↔ Dwarf Fortress | .25 | .16 | −.09 |
| RimWorld ↔ Dwarf Fortress | .50 | .53 | +.03 |
| Terraria ↔ Dwarf Fortress | .50 | .47 | −.03 |

This is a demonstration of **weight sensitivity**, not a claim that a lower
number is a worse game match. Unmentioned features remain unknown; no
non-overlap is inferred from these incomplete positive inventories.

The audit also exercises Intersection and Blend on two frozen two-favorite
baskets with identical catalog, eligibility, no additional constraints and
top-k 5. All 30 profiles remain 29 **partial** + 1 **unknown**:
**zero complete vectors** and **zero v2-ranked recommendations** in all four
scenarios. The model correctly abstains. These four scenarios supplement but
do **not replace** the fixed 30-basket / 150-scenario release-gate audit in
[REVIEWED_TAG_READINESS_29.md](REVIEWED_TAG_READINESS_29.md).

## What this does not establish

There is no verified exhaustive game-wide taxonomy, independent weight
annotation protocol, inter-rater agreement, gameplay-time instrumentation,
player preference labeling, rankable v2 corpus, graph/Bridge improvement or
human relevance measurement. Neither source access nor manually normalized
selected positives grants redistribution rights to imported publisher data;
no such descriptions, artwork or community tag lists are copied.

**Next genuine release gate:** independently review a bounded **whole-game**
taxonomy and an editorial weighting rubric on authorized sources, resolve
coverage and source rights, then compare complete profiles on exactly the same
catalog, hard constraints, seeds, mode, top-k and evaluation targets as
`feature-overlap-2`. Record regressions and all abstentions. Until then,
this experiment stays offline and [Issue #76](https://github.com/drevendev/Playmancer/issues/76)
remains open.
