# Four-game editorial weights: one-at-a-time robustness — 11 November 2026

**Release gate: NOT READY.** This is an offline diagnostic of the existing
selected-positive 4-game weight pilot, not a recommender or calibration of
similarity. It does not change the public `feature-overlap-3` player, Bridge,
share links, catalog, hard filters, or Pages bundle.

## Reproducible protocol

```sh
node scripts/audit-editorial-weight-sensitivity.mjs > /tmp/weight-sensitivity-4.json
node --test test/editorial-weight-sensitivity.test.js
npm test
npm run build
```

The CLI first runs the previous **exact-blob-validated**
[`p76-editorial-selected-weights-4` pilot](EDITORIAL_WEIGHT_PILOT_4.md).
It therefore rejects altered 30-game catalog, 29-game selected-fact receipts,
weight cohort, tags, or normalized editorial allocation. All 29 observed game
profiles remain `partial`; DevMatch remains `unknown`.

For each of four games and each of its four observed tags, move **exactly one**
selected-positive weight by **−0.05 or +0.05 absolute mass**, then redistribute
the compensating change proportionally across the other three positive tags
*of that same game*. The other games remain unchanged. This yields **32
one-at-a-time variants plus the original baseline**. All weights remain
positive and each selected-positive vector stays normalized to one.

For each scenario, recompute only the **minimum shared positive weight** on
four already source-vetted game pairs. Do not fill in unobserved tags, treat a
missing match as negative evidence, or feed these observations to ranking.
This is a fixed finite perturbation experiment, **not** an estimated sampling
error, confidence interval, or bound on actual gameplay similarity.

## Measured selected-positive overlap (not ranking scores)

| Selected observed game pair | Original | Min across 32 changes | Max across 32 changes |
| --- | ---: | ---: | ---: |
| Factorio ↔ Terraria | 0.16 | 0.11 | 0.21 |
| Factorio ↔ Dwarf Fortress | 0.16 | 0.11 | 0.21 |
| RimWorld ↔ Dwarf Fortress | 0.53 | 0.48 | 0.577778 |
| Terraria ↔ Dwarf Fortress | 0.47 | 0.42 | 0.52 |

The **0.10-wide** observed-overlap range for Factorio/Terraria under one
small editorial adjustment shows that the earlier selected-positive numbers
cannot reasonably be advertised as stable game-wide similarity. The other
pairs also shift. A zero shared observation would still mean **unknown**
similarity, not a confirmed mismatch.

The experiment contains **zero complete game-wide vectors** and **zero v2
rankable scenarios**. This is unchanged by all the numerical perturbations.
No independent player preferences, ordered candidate recommendations, human
judgments, Bridge-route utility or rank-quality improvement were measured.
No publisher weighting claim or bulk store/community data import is made.

## Relative overlap order — an additional negative stability result

The same **32 finite editorial perturbations** allow six comparisons of the
four selected-positive overlap values: **192 pair-order observations**.
The CLI now records each comparison's baseline order, case labels, strict
reversals and changes into/out of ties. **Two strict reversals** occur when
comparing *RimWorld ↔ Dwarf Fortress* (0.53 baseline) to
*Terraria ↔ Dwarf Fortress* (0.47 baseline):

- Decrease Dwarf Fortress's selected colony-management weight by 0.05:
  the respective observed overlaps become **0.48** and **0.486667**.
- Increase its selected digging weight by 0.05:
  the observed overlaps become **0.508205** and **0.52**.

The other five pair-to-pair baseline relationships remain unchanged in all
32 variants; no comparison enters or leaves a tie. Thus even the **relative
ordering of two recorded positive overlaps flips** under a single manual
weight edit. These are *four fixed game-pair observations*, **not four
candidate recommendations or a basket ranking experiment**. No accuracy
claim, calibrated fit, statistical uncertainty or real-world ranking result
follows from the 2/192 count.

## Decision and next genuine gate

Do **not** promote these four manually normalized selected-positive profiles
to complete tags or production ranking. Before calibrating weights, define and
independently review a bounded whole-game taxonomy with explicit coverage,
first-party receipts and rights review. Only then compare a complete-vector
v2 against the current baseline on the same catalog, candidate eligibility,
constraints, basket weights, methods, and top-k, including negative results.

Related: [Issue #76](https://github.com/drevendev/Playmancer/issues/76).
