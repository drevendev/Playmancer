# Reproducible benchmark contract

## Supported boundary and version

`runBenchmark` and `scripts/run-ranking-benchmark.mjs` consume ordinary JSON data.
The CLI reads a JSON file; getters, non-enumerable properties, prototype behavior,
functions and custom `toJSON()` implementations are not supported input mechanisms.
Do not present this numerical comparison tool as a sandbox for executable objects.
Use `examples/benchmark.synthetic.json` as the dependency-free starting point.

The default protocol is `p05-v1`; reports explicitly identify `p05-report-1`.
An explicitly supplied experiment protocol name is retained independently of the
report schema. Previous reports should not be compared without checking these fields.
This change does not revise the browser's `feature-overlap-2` share method.

## Equal comparison conditions

All five methods are selected by default: `union`, `arithmetic`, `leastMisery`,
`intersection`, `blend`. Explicit ordered subsets remain supported. Each method uses
the same input candidates, effective seeds/weights, per-basket constraints,
exclusions and shared top-k. The default top-k is 10, not the entire catalog.
Explicit `topK: 0` and larger non-negative integer values remain valid.
Legacy `blend.limit` is accepted only as the same shared limit; a conflicting limit
fails instead of quietly shortening just the Blend list.

Blend supports `lambda` in [0, 1], default 0.5, and the shared `limit`. Unknown options
are rejected. Effective parameters are recorded both at report level and in each
Blend result, including one-seed cases. A list-selection objective is not a player
accuracy score, and it must not be compared numerically with scalar fit as if it were.

A nonempty `basket.constraints` requires a complete `candidateConstraintStates` map
for that basket/catalog, with `pass`, `fail` or `unknown` for every candidate. The
runner consumes these classifications, not platform guesses inferred from affinity.
Unknown IDs, missing states, duplicates and malformed exclusions fail visibly.
Hard failures, uncertainty and explicit exclusions remain reported separately.

## Reproduction

```sh
node scripts/run-ranking-benchmark.mjs examples/benchmark.synthetic.json > /tmp/a.json
node scripts/run-ranking-benchmark.mjs examples/benchmark.synthetic.json > /tmp/b.json
cmp /tmp/a.json /tmp/b.json
```

Object keys are canonicalized, arrays remain deliberately ordered, and returned
reports are detached from mutable input constraints/affinities. Unknown values remain
`null`, not zero. Changing a report row cannot mutate another row through a shared
constraint reference. An error exits nonzero without a partial success report.

The fixture demonstrates balanced/one-sided, unknown and excluded candidates on
fictional affinities. It is not a real-catalog experiment or a user-study result.
The runner records results, not a claim that Blend or Intersection beats baselines.
Single-seed/human usefulness comparisons and frozen real-catalog judgments are tracked
in [#10](https://github.com/drevendev/Playmancer/issues/10).

## Frozen 30-game real-pilot diagnostic (issue #10)

The separate, dependency-free [offline 30-basket comparison](EVALUATION_30.md)
uses an immutable CC0/owner-published genre pilot and the same benchmark/ranking
implementation. It freezes 30 explicit player baskets, shared hard constraints,
method parameters and the exact source Git blob. Single-seed references and
Union/arithmetic/least-misery/Intersection/Blend outputs are retained together
with abstentions and negative cases. This is **genre-overlap proxy evidence**,
not human relevance, accuracy, or a claim that Blend beats simpler methods.

```sh
node --test test/real-pilot-evaluation.test.js
node scripts/evaluate-real-pilot.mjs > /tmp/real-pilot-evaluation.json
```
