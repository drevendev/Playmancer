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

The fixture freezes **12 authored fictional games**, six weighted 2–3-seed baskets, three explicitly **fictional** editorial relations, top-3 recommendations and Blend lambda 0.3. For every basket the same game IDs, hard platform/co-op states, explicit exclusions, seed weights and top-k are used by the unchanged `feature-overlap-2` implementation and the separate `weighted-tags-graph-experiment-6` prototype. The runner calls the actual player `pairEvidence` and production scalar/Blend rankers rather than duplicating their formulas.

The legacy synthetic fixture's 70/30 mechanics/themes distributions are transformed into *authored* v2 per-game normalized tags. **Both groups must be recorded**; missing mechanics or themes leave v2 tags unknown instead of renormalizing partial evidence to an apparently complete 1. V2 metadata carries only authored platform observations; the three source receipts are fixture markers, not claims of real-world game influence or data rights. No store or community content is scraped or redistributed.

Every authored probe must be eligible under the same hard platform/co-op filters and must not be an excluded or selected favorite. Otherwise the diagnostic aborts: an unreachable probe cannot truthfully count as a recommendation opportunity. The evaluator also asserts that both rankers agree with the original catalog's **hard-filter unknown** partition, separately from legitimate missing-feature abstentions. A hard-unknown profile must never become a rankable candidate in one method merely because its scoring evidence differs. These gates do not modify the pinned fixture or infer any missing attributes.

Output reports each method's top IDs, uncertain/abstained IDs, hard-excluded IDs, overlap@3 and whether explicitly authored **fictional probe candidates** appear in the top-3. Protocol `p76-synthetic-paired-3` additionally checks the immutable catalog's **independent hard-eligibility partition** (eligible, hard-unknown, hard-excluded). It reports separate per-method **rankable opportunity counts** (eligible minus missing-scoring-evidence abstentions) and explicitly names probes unavailable due to missing scoring evidence. Blend returns only top-k, so the report does **not** mistake its returned list length for its candidate denominator. The original `probe_delta` plus raw `losses`/`gains` remain visible even if a method abstains on a probe. New `comparable_probe_ids` require a probe to be scoreable by **both** methods; `probe_evidence_unpaired` gives each excluded probe's old/v2 abstention state. `paired_probe_hits_*`, `paired_probe_delta` and `paired_losses`/`paired_gains` measure only that shared probe cohort, so a missing feature cannot alone masquerade as a ranking regression or improvement. This does **not** align all rankable background candidates, repair the synthetic labels, or prove ranking quality. An empty comparable cohort means **no paired probe evidence**, not a tie in quality. These diagnostics make evidence-availability differences visible instead of mislabeling them as taste-quality differences. Probe hits are diagnostic hypotheses, **not** blind human judgments or recommendation accuracy. The union, arithmetic, least-misery, Intersection and Blend modes are evaluated separately; Bridge remains a route-explanation task and is **not** represented as an equivalent scalar score.

## Initial diagnostic observations (authored fixture only)

For the frozen six-basket fixture (30 mode/basket comparisons, top-3), the prototype changes some rankings. The probe-hit delta is **negative in one comparison** (`three-strands` / Union: −1) and **positive in one** (`combat-and-harvest` / arithmetic: +1). Other 28 are unchanged by this deliberately narrow proxy. These are neither a net quality gain nor proof of fitness for real players: the probes and relations were authored for testing, not sampled from users. Missing evidence remains visible as `uncertain`; hard exclusions are asserted identical.

## Still required before public integration

A rights-reviewed, immutable real-game tag snapshot with actual tag weights, taxonomy, coverage and per-field receipts; identical-catalog real-pilot baselines including negative findings; separate Bridge route validation; p95 browser performance and compatibility/replay checks; and fresh hosted Pages acceptance. The published 30-game genre-only catalog and `feature-overlap-2` share state remain unchanged. Do not treat this synthetic experiment as passing those release gates.
