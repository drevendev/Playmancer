# Bridge route evaluation — synthetic research fixture

Bridge is a **separate experimental route task**, not a ranking mode, not a
whole-basket Intersection score and not a verified real-catalog recommendation.
`src/bridge-preview.js` consumes authored structured metadata, applies hard
platform/co-op constraints and exclusions, and never treats unknown required
metadata as a pass. Endpoints must be distinct, explicit favorites. Edges are
computed from mechanics/themes, never 2-D projection, popularity or ratings.

Run a reproducible example locally with Node 22:

```bash
node scripts/run-bridge-preview.mjs
node scripts/run-bridge-preview.mjs examples/bridge.synthetic.json
node --test test/bridge*.test.js
```

The output identifies snapshot/method versions, endpoints, filter/threshold/hop
policy, eligible/unknown/failing profiles, per-step shared/gained/lost features,
and route cost. It does **not** report confidence or measured player usefulness.
The example is fictional, with no third-party data or artwork. `no-route` is
valid: constraints must not be relaxed to manufacture a path. Higher similarity
thresholds can legitimately remove an intermediate or the whole route.

This contract/CLI is an intermediate deliverable. A separately reviewed, accessible
browser journey with versioned share restoration is still needed before promoting
Bridge as a visible product capability. Real-catalog rights remain a separate gate.

## Strict positive-evidence policy (Bridge method v2)

The adapter now refuses edges with zero shared confirmed features even when the
CLI threshold is 0. Each unordered eligible pair is classified as insufficient
metadata, confirmed zero support, below the requested threshold, or connected;
these disjoint counts are diagnostics, not measures of model quality. Missing
required platform/co-op metadata remains a separate eligibility abstention.

Route method `bridge-features-preview-2` intentionally invalidates version-1 Bridge
links rather than silently altering their saved path topology. Older basket links
without Bridge remain compatible. New no-route messages explain separate reasons
and never relax an explicit filter. This is synthetic/experimental code pending
independent exact-head acceptance and merge of PR #12, not a live Pages claim.

## Exact feature-rational routes (Bridge method v3)

Version 3 compares weighted Jaccard affinity as exact rational feature-count
fractions, including the threshold equality boundary. Floating-point route
addition could break mathematical ties; converting already-rounded affinity
numbers to BigInts could still rank equally good feature routes differently.
Displayed similarity remains a Number, but route ordering uses exact fractions.

For disconnected eligible components, a bounded reachability pass avoids
the expensive rational shortest-route search. Feature sets are cached per
eligible game, and sorted evidence arrays are built for selected route steps.
This does not constitute a mobile latency or player-quality benchmark.

Saved v1 and v2 Bridge links fail visibly instead of silently restoring a
different path. Existing basket links without Bridge remain compatible.
The catalog is fictional, and neither Pages nor human usefulness is verified.
