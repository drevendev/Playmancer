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
A later independent exact-head CI review is required before merge. Subsequent
evaluation must compare against the existing Bridge on the **same 30-game
catalog, endpoints, exclusions and hard constraints**, record absent and
unavailable routes and time cost, and establish rights-cleared curated edges.
Only then consider UI integration and versioned share/publication migration.
