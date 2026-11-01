# Curated-edge Bridge primitive (experimental) — 2026-11-01

This offline slice advances [#76](https://github.com/drevendev/Playmancer/issues/76).
It is **not wired to the public Playmancer player**, does not replace the
existing Bridge, and does not establish recommendation quality. No Pages artifact,
catalog snapshot, scorer or share schema changes.

`findCuratedBridge(prepareEvidenceModel(...), { from, to, platform, coopOnly, excluded })`
finds an explainable route between two distinct catalog IDs. Only explicit,
authored `similar`, `inspired-by` or `references` edges with recorded
source receipts are traversed. It never converts tag affinity, common platform,
release year or another inferred similarity into a graph edge.

A direct authored edge takes precedence. Otherwise the strongest **eligible**
two-edge path is selected with 0.5 attenuation; canonical intermediary ID breaks
ties. All nodes must pass explicit hard platform/co-op constraints and exclusions.
Unknown required metadata produces `uncertain`, not a playable route or a negative
observation. Ineligible intermediates cannot provide route evidence. The output
retains both travel direction and the original source's authored direction for
each hop; `evidenceStrength` is graph evidence, **not confidence or player fit**.
No traversal longer than two edges is performed.

Statuses are `route`, `no-route`, `uncertain`, and `excluded`. A route
includes its ordered nodes and sourced hops. There is no automatic recovery
through excluded games, and no fabricated edge for an otherwise similar pair.

Verify with `node --test test/evidence-bridge.test.js` and `npm test`.
A later independent exact-head CI review is required before merging any new PR.

## Frozen 30-game comparison — negative readiness gate

The separately versioned `p76-frozen-curated-bridge-30-v1` diagnostic
uses the **exact existing 30-game pilot** (Git catalog blob
`0570fd610b14fb336c0de65e6cc3062892abe301`), the unchanged 30-basket plan
(`e28809801448df2f73c604d0349ce71c042d7f53`) and all **50 adjacent
favorite pairs**, ordered exclusions, platform and co-op requirements.
The upstream comparison revalidates licensing and frozen-source integrity.

Run without credentials or network:

```sh
node --test test/bridge-curated-30.test.js
node scripts/compare-bridge-curated-30.mjs > /tmp/curated-bridge-30-a.json
node scripts/compare-bridge-curated-30.mjs > /tmp/curated-bridge-30-b.json
cmp /tmp/curated-bridge-30-a.json /tmp/curated-bridge-30-b.json
```

The report places the **current feature-based Bridge at two hops** beside the
curated primitive's **two-hop** policy (matched hop cap and endpoint eligibility),
and records the already published three-hop feature baseline and three-hop
experimental uniform-genre proxy as *historical context*. The legacy route
threshold remains 0.31; curated routes require independently sourced links, not
a comparable numeric threshold. Rankings, fit and hop strength have different
semantics; equal hop caps are **not** equivalent quality or relevance tests.

**Observed input limitation:** the approved real 30-game snapshot records
**zero sourced curated relations**. Consequently the curated method yields
**zero supported routes** across 50 tasks: 49 `no-route` and one
`uncertain` required-co-op endpoint. This is *not evidence that the new
algorithm performs worse*: there is simply no graph evidence to traverse.
The original published three-hop Bridge has 5 supported routes, 44 no-routes
and one unavailable endpoint; the uniform-genre graph has 4, 45 and one,
respectively. The report calculates the separate matched two-hop baseline
rather than conflating it with the three-hop release.

Both methods preserve hard constraints without silently admitting missing
platform/co-op facts. The report contains every endpoint pair, its declared
filters/exclusions, all statuses, supported legacy nodes and negative
transitions; output is deterministic and pinned by tests. The diagnostic is
**offline only**, has no independent player-relevance labels and reports
performance latency as `NOT_MEASURED`, not as a passing speed benchmark.

**Decision:** do not replace or advertise the public Bridge with this primitive.
First obtain publishable, item-level curated relation receipts, then repeat a
versioned, same-eligibility paired diagnostic with eligible sourced edges and
independent task judgments; measure browser performance and perform separate
acceptance for any UI/share/method-version change. Neither API availability nor
a developer inspiration anecdote alone establishes redistribution permission.
