# Playmancer

**Mix your favorites. See the trade-offs.**

Choose one to five favorite profiles, set weights and hard filters, and see why
recommendations fit each preference or require a compromise. Start with a sample or
an empty basket; no account, paid inference, tracking, remote assets or runtime API
requests are needed.

## Play in your browser — GitHub Pages

**[🎮 Open Playmancer](https://drevendev.github.io/Playmancer/)** ·
[Pages deployment status](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml)

> **Published — first live-revision proof, 2026-10-24 23:24 UTC.**
> [Publish Playmancer Pages #40142462093](https://github.com/drevendev/Playmancer/actions/runs/40142462093)
> successfully deployed reviewed `master` commit
> `c9eff3980b02ce4ed62b7be889a0549ce0c2bb67`. The GitHub Actions deployment
> job fetched the public HTTPS page, matched its `playmancer-revision` marker to
> that exact commit and fetched the same-origin `bridge-worker.js` successfully.
> This is **live HTTP verification at that revision**, not proof that every later
> deployment remains live. The [latest publish runs](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml)
> record subsequent revisions.

The current preview uses **fictional games only**; it is not a real catalog or
a validated recommendation-quality claim. [Exact-master CI](https://github.com/drevendev/Playmancer/actions/runs/40142462100)
also passed Node/build and local Chromium, Firefox and WebKit journeys. The hosted
player has **not yet undergone an independent desktop/mobile browser inspection**:
real hosted navigation, screenshots and final live UX acceptance are still tracked
in [release issue #7](https://github.com/drevendev/Playmancer/issues/7).
If the page does not load, inspect the [publish workflow](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml);
an old green job is not evidence of current availability.

## Playable preview 0.3

The default remains an explicitly **fictional twelve-profile preview**, not a real
game catalog or a claim of measured recommendation quality. Preview 0.3 connects a
validated build-time snapshot to the complete player journey. A second independent
six-profile synthetic fixture exercises aliases, editions/DLC and unknown metadata.
Existing default rankings and compatible share links keep their semantics.

- Search names, canonical IDs and declared aliases; add/remove up to five profiles.
- Edit explicit integer weights with keyboard controls.
- Compare harmonic **Intersection**, diversified list-level **Blend**, and a weighted
  arithmetic baseline. Union is an evaluation baseline, not an Intersection label.
- Require platform/co-op support. Missing required evidence is unknown, never a pass.
- Inspect per-seed affinities, evidence coverage, shared features and mismatches.
- Hide/restore results and recover explicitly from empty results without silent
  filter relaxation.
- Share ordered IDs/weights, mode, filters, exclusions and catalog/method versions.
- Use visible focus, native 44px-class controls, reduced motion and narrow reflow.

**Bridge two favorites** is a separately labelled experimental route panel, not a
fourth basket-ranking mode. Use **Explore Bridge routes** on the first screen,
select two distinct basket games, and inspect supported steps and trade-offs.
Platform/co-op requirements and hidden-game exclusions also apply to routes.
Unsupported endpoints and absent routes are explained without relaxing a filter.
Graph cost is not a confidence score or evidence of real-player usefulness.

## Run and verify

Use Node.js 22. There are no npm dependencies or API keys.

```sh
npm test
npm run validate:catalog
npm run benchmark
node scripts/run-bridge-preview.mjs
npm run build
python3 scripts/pages-preflight.py _site
# Optional local hosting; this is not public deployment.
python3 -m http.server 8080 --directory _site
```

Build the alternative synthetic snapshot:

```sh
node scripts/build-demo.mjs _site-pilot --catalog examples/catalog.alternative.synthetic.json
python3 scripts/pages-preflight.py _site-pilot
```

See [the snapshot adapter](docs/CATALOG_ADAPTER.md) for the exact data path, limits,
invalid-refresh recovery and fixture-to-player acceptance. Missing/invalid inputs
never fall back silently. Only publication-validated allowlisted fields are embedded;
the resulting immutable projection drives search, ranking and Bridge.

For machine-readable benchmark JSON without npm's command banner:

```sh
node scripts/run-ranking-benchmark.mjs examples/benchmark.synthetic.json > report.json
node scripts/validate-catalog.mjs path/to/catalog.json --publishable
```

See [the benchmark contract](docs/BENCHMARK.md) for shared eligibility/top-k and report
versions, and [the catalog contract](docs/CATALOG.md) for provenance and identity.

## Catalog and evidence boundaries

`src/catalog.js` validates schema/snapshot versions, source attribution, recorded
field rights, canonical game IDs, aliases, external-ID collisions and distinct
edition/DLC/remake relations. Unknown metadata is `null`; empty lists and `false`
co-op values are observations, not missing data. Arbitrary extras/artwork are omitted.
The build input limit is 1 MiB and 250 profiles; this is an engineering bound, not a
mobile latency guarantee. The first two selected-snapshot records form the sample.

The authored fixtures pass the synthetic publication gate. **This is not legal
verification of an external source.** No real source receipt, description/artwork
license, real-catalog coverage or recommendation-quality result is claimed.
Real-source adoption remains tracked by [#8](https://github.com/drevendev/Playmancer/issues/8).

`synthetic-demo-1` uses weighted Jaccard overlap on mechanics (70%) and themes (30%).
Less than 70% comparable evidence means uncertainty, not zero fit. Evidence coverage
is separate from fit; popularity, ratings and map coordinates are not ranking inputs.
These are fixture parameters, not validated real-player thresholds.

The unchanged player method is `feature-overlap-2`. Unavailable catalog/method links
fail visibly rather than silently upgrading. Starting a sample or empty basket is
explicit recovery. Changed catalog records require a new immutable snapshot ID.
Benchmark report versioning is separate from player shares.

## Browser acceptance and CI

For validated snapshots of **50–250 profiles served over HTTP(S)**, Bridge
calculates routes inside a **same-origin static Web Worker** built from the
same exact-rational source modules as the small preview. The publishable artifact
contains exactly `index.html`, `bridge-worker.js`, and an empty `.nojekyll`. Changing an endpoint,
filter, exclusion or threshold cancels the previous worker; only the newest
result can update the visible explanation. The panel announces its busy state,
and calculation failures are visible instead of substituting a guessed route.
Small catalogs and non-HTTP/offline harnesses retain the synchronous route path;
browsers without Worker support also fall back to that path. This is a
responsiveness implementation, **not** a physical-device latency guarantee.
No new CDN, backend, external catalog request or tracking is introduced.

```sh
python3 -m pip install playwright==1.55.0
python3 -m playwright install chromium
python3 scripts/browser-smoke.py
python3 scripts/browser-bridge-acceptance.py
python3 scripts/browser-catalog-acceptance.py
# Separate required CI job: genuine loopback HTTP navigation in three engines.
python3 -m playwright install --with-deps chromium firefox webkit
python3 scripts/browser-http-acceptance.py
# Separate optional 1x/4x synthetic Chromium responsiveness evidence (also runs in CI).
python3 scripts/browser-bridge-performance.py
# Separate required CI check: real HTTP worker cancellation, routes and share replay.
python3 scripts/browser-bridge-worker-acceptance.py
```

The 1x/4x synthetic benchmark mounts HTML offline and therefore remains a
**synchronous route-algorithm baseline**, not a measurement of worker-enabled
HTTP input responsiveness. The separate local-HTTP Chromium test exercises a
real worker on 250 fictional profiles, rapid cancellation, recovery and a fresh
share-link navigation. Its saved handler duration is diagnostic, not an SLA.

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an installed Chromium. The harnesses test
actual built documents offline: basket actions, keyboard controls, filters, sharing,
Bridge routes/discovery, alternative snapshot identities, recovery, narrow reflow
and increased text size. PNG/JSON evidence is retained in `.test-artifacts/` and CI.
The alternative synthetic HTML is retained for inspection, not automatically deployed.

Full Node tests, catalog validation, deterministic benchmark/build, payload preflight,
existing offline Chromium checks and a separate loopback-HTTP Chromium/Firefox/WebKit
journey are required by Verify. The HTTP job serves the built static artifact through
a real local web server and checks desktop/mobile basket, keyboard weight edits, filters,
explanations, Bridge, exclusions, versioned sharing, fresh-page restoration and visible
invalid-link recovery; it saves six screenshots and per-engine JSON. CI failures remain
failures (no skipped or substituted browser engines). Local HTTP is **not** public Pages
navigation, and automated DOM checks are **not** screen-reader/assistive-technology
certification. Issue #14 retains those unverified gates.

Bridge issue #15 has a separate synthetic latency job: deterministic 12/50/250-profile
dense/sparse/disconnected snapshots, seven non-cached route recomputations per case,
Chromium at 1x/4x emulated CPU, and retained per-case handler/timer-delay median/p95
plus 250-profile screenshots. Measurements are main-thread blocking proxies, not a
mobile SLA or user-input latency; no product speedup is claimed. See [Bridge evidence](docs/BRIDGE.md#synthetic-browser-responsiveness-evidence-issue-15-v1).

## Publication and contribution

The build emits self-contained `index.html` and `.nojekyll`, including publication
revision and selected catalog metadata. Invalid catalog or bundle inputs fail before
replacing the last valid HTML. Build success is not deployment evidence.

The Pages workflow deploys **reviewed master only** and fails explicitly if Pages
has not been enabled. An authorized admin/maintainer must first configure GitHub
Actions as the Pages source; the workflow does not self-enable Pages or weaken
protection. On successful deployment, CI probes the public index for its exact
`playmancer-revision` commit SHA and checks the same-origin Bridge worker.
Only successful public checks can establish LIVE_VERIFIED for these resources;
they do not replace hosted mobile/desktop interaction or screen-reader acceptance.
[#7](https://github.com/drevendev/Playmancer/issues/7) tracks the outstanding
deployment and hosted-browser checks.

Use focused PRs, preserve all regression tests and independently review a later exact
head before merge. The repository has no adopted code license; public visibility is
not an assertion of reuse rights. Full EndlessZen unattended conformance and human
usefulness remain unclaimed. See [the roadmap](docs/ROADMAP.md) and
[product epic #1](https://github.com/drevendev/Playmancer/issues/1) for remaining gates.
