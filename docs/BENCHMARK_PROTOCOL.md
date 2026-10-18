# Benchmark protocol — JSON input, v1

The deterministic runner is `src/benchmark.js` and its CLI is
`scripts/run-ranking-benchmark.mjs`. Try `npm run benchmark`, or invoke the CLI
with an explicit locally authored JSON fixture. Do not use restricted or private
raw catalog exports. The included example is synthetic and has no measured
user-preference ground truth.

## Fairness and reporting

The default comparison now includes all five hypotheses:
`union`, `arithmetic`, `leastMisery`, `intersection`, `blend`.
For every basket and mode, the same input candidate catalog, full hard-filter
classification, excluded IDs, mode version and shared top-k apply. The default
top-k is **10**, and `blend.limit` must equal `topK` when both are provided.
`blend.lambda` must be finite and within [0,1]; unknown option keys are errors.
Reports record the effective Blend parameters and `p05-report-1` schema,
per-seed weights/affinity, coverage, exclusions, unknowns, and evidence scores.
Canonical object key order makes the output stable across ordinary JSON input
key permutations; no input object is retained by report reference.

The comparison scores are **synthetic heuristics**, not real-world quality,
personalization accuracy, user preference fit, rights clearance, or popularity.
Do not rank from 2D map distance. Unknown constraint state is abstention rather
than a pass or a zero score. Record ties and negative findings in future
evaluation; compare only on identical eligible catalogs/top-k.

## Scope of guarantee

The boundary is ordinary data from `JSON.parse`, including CLI fixture files.
Custom JavaScript getters, hidden properties, prototype tricks or callable
`toJSON` hooks used through the programmatic API are **not** part of the
accepted input contract, and this report does not claim they are safe. Any
future expansion to direct arbitrary JS input must add separate tests and
semantic versioning. A green Node suite is not a live Pages deployment.

## Follow-up

Issue #6 owns subsequent executable catalog validation and the complete
preview 0.2 gate. Issue #7 owns Pages provisioning/live revision verification;
#8 Bridge UX, #9 rights-cleared pilot data/identity, #10 controlled evaluation.
