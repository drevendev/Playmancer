# Paired v2 evidence comparison — fictional diagnostic

Status: **offline authored synthetic experiment** for [#76](https://github.com/drevendev/Playmancer/issues/76). This is **not** a real-catalog evaluation, a player study, or permission to change the public ranking/share method.

## Reproduce

From the repository root with Node.js 22 (no dependencies):

```sh
node --test test/evidence-comparison.test.js
node scripts/compare-evidence-models.mjs examples/evidence-comparison.synthetic.json > /tmp/v2-a.json
node scripts/compare-evidence-models.mjs examples/evidence-comparison.synthetic.json > /tmp/v2-b.json
cmp /tmp/v2-a.json /tmp/v2-b.json
```

The fixture freezes **12 authored fictional games**, six weighted 2–3-seed baskets, three explicitly **fictional** editorial relations, top-3 recommendations and Blend lambda 0.3. For every basket the same game IDs, hard platform/co-op states, explicit exclusions, seed weights and top-k are used by the unchanged `feature-overlap-2` implementation and the separate `weighted-tags-graph-experiment-9` prototype. The runner calls the actual player `pairEvidence` and production scalar/Blend rankers rather than duplicating their formulas.

The offline method version changes because positive platform receipts now earn a bounded shared-platform signal independent of how many other platforms were recorded. A missing platform list remains unknown; no shared recorded platform is not proof of incompatibility. Previous v6, v7 and v8 results are historical. Version 8 also separates observed
platform-list coverage from taste-comparable tie-break coverage: two
positive-only lists without a documented common platform cannot win a tied
rank solely by being better documented. A shared platform retains the same
bounded taste signal. The public method and hard filters remain unchanged.

The legacy synthetic fixture's 70/30 mechanics/themes distributions are transformed into *authored* v2 per-game normalized tags. **Both groups must be recorded**; missing mechanics or themes leave v2 tags unknown instead of renormalizing partial evidence to an apparently complete 1. V2 metadata carries only authored platform observations; the three source receipts are fixture markers, not claims of real-world game influence or data rights. No store or community content is scraped or redistributed.

Every authored probe must be eligible under the same hard platform/co-op filters and must not be an excluded or selected favorite. Otherwise the diagnostic aborts: an unreachable probe cannot truthfully count as a recommendation opportunity. The evaluator independently derives each method's hard-filter partition from the original catalog. Both methods require the **same positive eligibility** for ranking, but v9 separately records games reclassified from legacy *excluded* to experimental *unknown* because recorded platform lists are non-exhaustive. A hard-unknown profile must never become a rankable candidate in one method merely because its scoring evidence differs. These gates do not modify the pinned fixture or infer any missing attributes.

Output reports each method's top IDs, uncertain/abstained IDs, hard-excluded IDs, overlap@3 and whether explicitly authored **fictional probe candidates** appear in the top-3. Protocol `p76-synthetic-paired-8` additionally checks the immutable catalog's **independent hard-eligibility partition** (eligible, hard-unknown, hard-excluded) for each method, including `platform_support_reclassified_to_unknown` and separate v2 partition counts. It reports separate per-method **rankable opportunity counts** (eligible minus missing-scoring-evidence abstentions) and explicitly names probes unavailable due to missing scoring evidence. Blend returns only top-k, so the report does **not** mistake its returned list length for its candidate denominator. The original `probe_delta` plus raw `losses`/`gains` remain visible even if a method abstains on a probe. New `comparable_probe_ids` require a probe to be scoreable by **both** methods; `probe_evidence_unpaired` gives each excluded probe's old/v2 abstention state. `paired_probe_hits_*`, `paired_probe_delta` and `paired_losses`/`paired_gains` measure results after both methods re-rank their complete shared scoreable candidate pool, so a missing feature cannot alone masquerade as a ranking regression or improvement. 

The paired comparison now recomputes each scalar mode and the greedy Blend objective on the **same full set of candidates rankable by both models**, not merely the same probe IDs. It reports `paired_rankable_ids`, one-sided rankable IDs, `paired_top_old` / `paired_top_v2`, and paired overlap@k. This prevents one-sided background candidates from occupying top-k slots or changing Blend's marginal-coverage state. Raw method rankings and raw probe deltas are still retained, because common-cohort diagnostics deliberately hide some evidence-availability consequences. The synthetic labels remain unvalidated, so this does **not** prove real-world ranking quality. 

The machine-readable `paired_probe_evaluation` distinguishes `comparable` from
`no-authored-probes`, `no-shared-scoreable-candidates`, and
`no-comparable-probes`. Each row exposes authored/comparable/unpaired probe
counts; `paired_comparability` aggregates scenarios and probe opportunities
by mode. A numeric `paired_probe_delta: 0` with a non-comparable status is
**not** a tied result. No relevance or accuracy claim is inferred from
synthetic probe counts.

An empty comparable cohort means **no paired probe evidence**, not a tie in quality. These diagnostics make evidence-availability differences visible instead of mislabeling them as taste-quality differences. A paired probe count is not necessarily bounded by raw probe hits: removing one-sided background candidates can free a top-k slot. Probe hits are diagnostic hypotheses, **not** blind human judgments or recommendation accuracy. 

Protocol v7 and later additionally accept optional, explicitly **fictional** `negativeProbeIds` per basket. These are authored examples of games **not desired** by that fictional basket, distinct from positive `probeIds`; they are not observed dislike or player judgments. Each negative must pass the same independent platform/co-op eligibility and must not be a favorite, exclusion, or positive probe. The report records raw negative top-k exposures and same-cohort `paired_negative_probe_hits_old/v2`, plus a signed delta (v2 minus old). A **positive** paired negative delta is a counterexample **regression** (more authored undesired results), a negative delta is an improvement on this synthetic diagnostic only. `paired_negative_losses/gains` retain these outcomes. Separately reported `paired_negative_probe_evaluation` and `paired_negative_comparability` distinguish absent/unscorable negatives from true zero exposures; no unpaired/missing observation is silently counted as a successful avoidance. These signed labels are not training data, human relevance, real-game quality, or a v2 release gate.

### Balanced signed probe exposure (protocol v8)

The `p76-synthetic-paired-8` protocol adds a **paired signed-exposure
diagnostic**, not a real recommendation-quality score. For baskets with at least
one **jointly scoreable authored positive** and one **jointly scoreable authored
negative** candidate, each method is evaluated on the exact same shared
candidate pool and top-k. Define:

```text
positive exposure rate = paired positive hits / comparable positive probes
negative exposure rate = paired negative hits / comparable negative probes
signed exposure balance = positive exposure rate - negative exposure rate
balance delta = v2 balance - old balance
```

Each label group has its **own denominator** so two negative labels are not
silently given twice the weight of one positive label. A positive balance delta
means that v2 improves this *fictional, equally weighted signed exposure
diagnostic*; a negative delta worsens it. The diagnostic does not measure real
player satisfaction, calibration, accuracy, or uplift, and its authored labels
are not exhaustive. It is not safe to interpret it as precision, recall or
balanced accuracy.

`paired_signed_exposure` reports the two denominators, `old_balance`,
`v2_balance`, `balance_delta`, and a status. When either group has no jointly
scoreable probe, all three numeric values are `null` rather than a fabricated
zero/tie. Explicit statuses are `no-comparable-positive-probes`,
`no-comparable-negative-probes`, and `no-comparable-signed-probes`.
Top-level `paired_signed_exposure_gains` and
`paired_signed_exposure_losses` contain **only** comparable signed rows.
Raw positive and negative hits/deltas, evidence-abstention reasons and the
mode-specific candidate denominators remain separate. Reproducibility and
missing-data abstention are covered by the Node regression suite.

The union, arithmetic, least-misery, Intersection and Blend modes are evaluated separately; Bridge remains a route-explanation task and is **not** represented as an equivalent scalar score.

## Historical v7 diagnostic observations (authored fixture only)

In the previous v7 run of the frozen six-basket fixture (30 mode/basket comparisons, top-3), the prototype changed some rankings. The probe-hit delta is **negative in one comparison** (`three-strands` / Union: −1) and **positive in one** (`combat-and-harvest` / arithmetic: +1). Other 28 were unchanged in that v7 diagnostic. Re-run the commands above
for version-9 results; these prior numbers are not v9 acceptance claims.
These are neither a net quality gain nor proof of fitness for real players: the probes and relations were authored for testing, not sampled from users. Missing evidence remains visible as `uncertain`; explicit player exclusions and known co-op failures remain identical, while platform-receipt absences have a separately recorded abstention transition.

Version 9 also changes how an unverified required platform is classified: a
positive-only recorded list that omits the requested platform now produces an
**uncertain** abstention, rather than a proven **excluded** candidate. It does
not enter top-k or make a curated Bridge route eligible. Re-run the same frozen
fixture for v9 before comparing counts; previous reports remain historical.

## Still required before public integration

A rights-reviewed, immutable real-game tag snapshot with actual tag weights, taxonomy, coverage and per-field receipts; identical-catalog real-pilot baselines including negative findings; separate Bridge route validation; p95 browser performance and compatibility/replay checks; and fresh hosted Pages acceptance. The published 30-game genre-only catalog and `feature-overlap-2` share state remain unchanged. Do not treat this synthetic experiment as passing those release gates.
