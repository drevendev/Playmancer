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
