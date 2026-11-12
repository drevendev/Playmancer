# Bridge v3 → v4: same 50 frozen route tasks

**Issue #76, evaluation-only.** This is a deterministic compatibility and
eligibility diagnostic, not a player-preference study, recommendation uplift
metric, claim of a complete semantic catalog or a new public ranking method.

## Exact paired inputs

- Historical implementation: `src/bridge-preview.js` at
  `0b3375bc6ef92f5f58b81e2cacae566d2739c37b`, Git blob
  `37643c7b4802a0e26dc3826c7b3c5ace1f5bdf63` (Bridge v3).
  The fixture in `test/fixtures/bridge-preview-v3.js` changes **only**
  its relative import path; the comparator restores that import and verifies
  the exact original Git blob before executing it. The shared routing engine
  `src/bridge.js` has the same blob
  `00353c617fba62d1127afcafa72668d4236c013e`
  at the historical and v4 merge commits.
- Current implementation: `bridge-features-preview-4` from
  `src/bridge-preview.js`, Git blob
  `f1355c15c5e9f5f61ab420d63cdcf9e3fdd10a04`.
  The existing frozen evaluator runs its real function, not a simulated
  or separately tuned implementation. The comparator also verifies the
  v4 source blob and the shared routing-engine blob at runtime, so a
  future implementation edit requires a new comparison protocol rather
  than silently reusing these numbers.
- Catalog: 30 CC0/owner-published entries, Git blob
  `0570fd610b14fb336c0de65e6cc3062892abe301`.
- Basket plan: 30 baskets, **50 adjacent explicit-favorite endpoint tasks**,
  Git blob `e28809801448df2f73c604d0349ce71c042d7f53`.
  Both sides use the identical ordered endpoints, exclusions, required
  platforms/co-op, three-hop cap and `0.31` edge threshold. Basket weights
  do not enter this separate Bridge path task.

The comparator guards the complete existing frozen evaluator and historical
code, and reports every task's v3/v4 status, path, eligibility counts, reason,
constraints and exclusions. An unknown required platform **does not pass**;
both methods still exclude it from routes. Confirmed negative co-op and
explicit exclusions remain strict. V4 changes *labels* for unconfirmed
positive-only platform metadata, not its evidentiary completeness.

## Run locally, without credentials

```sh
node --test test/bridge-v3-v4-frozen-50.test.js
node scripts/compare-bridge-v3-v4-frozen-50.mjs > /tmp/bridge-v3-v4-a.json
node scripts/compare-bridge-v3-v4-frozen-50.mjs > /tmp/bridge-v3-v4-b.json
cmp /tmp/bridge-v3-v4-a.json /tmp/bridge-v3-v4-b.json
```

## Acceptance and negative findings

The regression test requires **5 route / 44 no-route / 1 unavailable endpoint**
on each side of this *frozen* 50-task catalog, zero changed task statuses and
zero changed route paths. It additionally requires a positive count of
`FAIL → UNKNOWN` catalog-eligibility reclassifications under platform filters,
with unchanged PASS/excluded counts. These assertions passed at the exact PR head
`327c9f1e62deaf25d5038d4d803d35dbfcb126db` in
[Verify #43219414918](https://github.com/drevendev/Playmancer/actions/runs/43219414918)
and [Basket library acceptance #43219415011](https://github.com/drevendev/Playmancer/actions/runs/43219415011),
both completed successfully before [PR #178](https://github.com/drevendev/Playmancer/pull/178)
was merged on 2026-11-12. These remain reproducible **software assertions**,
not independent human judgments or evidence of improved player discovery.
The output counts a candidate repeatedly when it is evaluated in different
endpoint tasks; it must not be called the number of distinct games.

No added route is expected from a missing required platform: the unknown is
still ineligible. Thus even a fully passing comparison shows a safety/clarity
fix, **not better player discovery**. There are no player preference labels,
measured latency, non-genre tag coverage or verified curated relations in this
test. Future evaluation must retain the same catalog/eligibility/top-k for
ranking comparisons, and obtain separate rights-cleared evidence and task
judgments before claiming quality changes.

See [the primary 30-game Bridge evaluation](BRIDGE_EVALUATION_30.md),
[the v2 genre proxy comparison](BRIDGE_V2_EVIDENCE_30.md) and
[Issue #76](https://github.com/drevendev/Playmancer/issues/76).
