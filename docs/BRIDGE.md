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

An experimental Bridge panel is implemented in the list-first browser preview
(`index.html`, `src/bridge-ui.js`). Players select two distinct basket favorites,
choose a hop limit and similarity threshold, and inspect explained intermediate
steps. Bridge remains separate from Intersection and Blend basket ranking. Share
links preserve versioned route settings; incompatible prior route versions fail
visibly instead of substituting a different route. This source implementation
is not evidence of a live Pages deployment, rights-cleared catalog or measured
player usefulness. Hosted publication and verification are a separate gate (#7).

## Strict positive-evidence policy (Bridge method v2)

The adapter now refuses edges with zero shared confirmed features even when the
CLI threshold is 0. Each unordered eligible pair is classified as insufficient
metadata, confirmed zero support, below the requested threshold, or connected;
these disjoint counts are diagnostics, not measures of model quality. Missing
required platform/co-op metadata remains a separate eligibility abstention.

Route method `bridge-features-preview-2` intentionally invalidates version-1 Bridge
links rather than silently altering their saved path topology. Older basket links
without Bridge remain compatible. New no-route messages explain separate reasons
and never relax an explicit filter. These semantics apply to synthetic
catalog data; they do not establish hosted publication or player usefulness.

## Exact feature-rational routes (Bridge method v3)

Version 3 compares weighted Jaccard affinity as exact rational feature-count
fractions, including the threshold equality boundary. Floating-point route
addition could break mathematical ties; converting already-rounded affinity
numbers to BigInts could still rank equally good feature routes differently.
Displayed similarity remains a Number, but route ordering uses exact fractions.

For disconnected eligible components, a bounded reachability pass avoids
the expensive rational shortest-route search. Feature sets are cached per
eligible game, and sorted evidence arrays are built for selected route steps.
The search frontier uses a binary min-heap with the same exact cost, hop-count
and complete-ID ordering. This does not constitute a mobile latency or
player-quality benchmark.

The standalone graph API validates supplied rational evidence, including
fractions too large for Number conversion and denominator-only overflow.
Whole ID components determine lexical ties; embedded separator characters
cannot alias distinct paths. Browser catalog IDs remain more restrictive.
The displayed-similarity validation tolerance remains 1e-12; it is not a
route-cost rounding threshold. These repairs preserve the browser method
version and its valid catalog-input semantics.

Saved v1 and v2 Bridge links fail visibly instead of silently restoring a
different path. Existing basket links without Bridge remain compatible.
The catalog is fictional, and neither Pages nor human usefulness is verified.


## Synthetic browser responsiveness evidence (issue #15, v1)

Run `python3 scripts/browser-bridge-performance.py` with Playwright 1.55.0 and
Chromium installed. The script builds nine deterministic, independently authored
**fictional** publication-validated snapshots, crossing 12, 50 and 250 profiles
with dense, sparse and disconnected feature graphs. First/second favorites
are intentionally in the same component for dense/sparse and opposite
components for disconnected. It exercises the real Bridge UI change listener in
a 390×844 headless Chromium viewport at both ordinary and emulated 4× CPU rate.

Seven repetitions per case alternate two valid thresholds (`0.05`/`0.31`)
after temporarily clearing the destination. This invalidates the one-entry
route cache without changing the known graph reachability. JSON output at
`.test-artifacts/bridge-performance.json` contains exact Git SHA (in CI),
Chromium version, synthetic fixture version, all raw durations, nearest-rank
p95 and median for the synchronous change handler and a queued timer. Six
screenshots capture the 250-profile cases. The standalone CI performance
job retains the evidence; any invalid route/absent route or runtime error
fails the job rather than silently becoming a latency sample.

**Interpretation:** these are single-thread blocking *proxies*, not physical
keyboard latency, a mobile-device SLA, game quality, or hosted navigation.
CPU throttling does not reproduce thermal/network/assistive-technology
behavior. Avoid universal latency thresholds on shared CI runners; preserve
negative results. This version adds measurement and deterministic regression
coverage, **not** a Web Worker or claimed speedup. If 250-profile dense
measurements remain materially blocking, choose the smallest cancellation-aware
latest-input-wins UI execution strategy without changing exact rational
route ordering, evidence, constraints or share versions.
