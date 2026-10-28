# Frozen Bridge route diagnostic — 30-game genre pilot

**2026-10-28 — offline proxy, not a user study or an accuracy result.** This
separate protocol evaluates actual Bridge endpoint routing, not the scalar
Union/Arithmetic/Least Misery/Intersection/Blend leaderboard. The player site's
Bridge default is **3 hops, similarity threshold 0.31**, with route method
`bridge-features-preview-3`. These are frozen choices, not tuned to results.

## Reproduce

```sh
node --test test/bridge-real-pilot.test.js
node scripts/evaluate-bridge-real-pilot.mjs > /tmp/bridge-a.json
node scripts/evaluate-bridge-real-pilot.mjs > /tmp/bridge-b.json
cmp /tmp/bridge-a.json /tmp/bridge-b.json
```

The runner reuses `evaluateFrozenPilot` to verify the full immutable 30-game
source, license gate, declared basket schema and Git blob SHA
`0570fd610b14fb336c0de65e6cc3062892abe301` before calculating a route.
It invokes **the real** `buildBridgePreview` implementation for every adjacent
ordered favorite pair in each of the 30 already declared baskets
(`examples/evaluation-baskets-30.real.json`). These produce 50 endpoint tasks.
Each task inherits the basket's exact exclusions, platform and co-op filters.
**Weights do not affect Bridge endpoints or route costs.** This is intentional:
Bridge explains a path between two explicit favorites, not a weighted basket
ranking. This comparison does not share the scalar method's top-k and must not
be placed in its numeric leaderboard.

## Frozen snapshot diagnostics

On the source and defaults above, **5/50 routes** are supported,
**44/50 return no route within the threshold/hop policy**, and **1/50 has
an unavailable endpoint** because required co-op evidence is unknown.
By declared basket group: coherent 4 routes / 15 no-routes; conflicting
0 / 14; weighted 1 / 11; sparse 0 / 2; constrained 0 / 2 plus
1 unavailable endpoint. These counts describe only these deliberately
selected tasks, not representative player behavior.

Example: the coherent-platformer basket has a two-hop route from the
second favorite to Shadow Runner through Celeste, supported by observed
`platformer` tags. Each step has just **30% comparable feature-group
coverage**: no mechanics are observed in this catalog. In contrast,
both sparse DevMatch endpoint tasks return no route because its genres are
missing; the co-op-only task abstains rather than treating unknown metadata
as eligible. A `no-route` response may mean disconnected components **or**
the hop limit; do not claim which without independent analysis.

The full report preserves each endpoint, game IDs, route steps and their
shared/gained/lost tags, eligibility counts, pair-evidence exclusions,
negative statuses and reasons. Reproducibility is pinned to snapshot and
method versions. The task set includes no random users, relevance labels,
human preference data or longitudinal evidence.

## Decision

**Do not claim Bridge improves discovery on this genre-only pilot.**
Only five of 50 ordered adjacent pairs have an explained route at the
actual interface defaults. Do not silently lower thresholds, insert unknown
features, or substitute a synthetic graph to make this rate look better.
Prioritize rights-cleared evidence enrichment and eventually consented player
task research over algorithmic complexity. A future catalog or method revision
needs a new explicit evaluation protocol; prior counts stay frozen.

See [the scalar proxy study](EVALUATION_30.md) for the separate comparison.
