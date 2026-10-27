# Playmancer

**Mix your favorites. See the trade-offs.**

Choose one to five favorite profiles, set weights and hard filters, and see why
recommendations fit each preference or require a compromise. Start with a sample or
an empty basket; no account, paid inference, tracking, remote assets or runtime API
requests are needed.

## Play in your browser — GitHub Pages

**[🎮 Open Playmancer](https://drevendev.github.io/Playmancer/)** ·
[Real pilot provenance](docs/REAL_PILOT.md) ·
[Pages deployment status](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml)

> **Published and hosted-browser verified — 2026-10-25.**
> [Publish Playmancer Pages #40226036493](https://github.com/drevendev/Playmancer/actions/runs/40226036493)
> successfully deployed reviewed `master` commit
> `59003d016e57e2edd68ee62842c7e19f6887276c`. The deployment job fetched
> the public HTTPS page, matched its `playmancer-revision` marker to that exact
> commit and loaded the same-origin `bridge-worker.js`. Its hosted Chromium,
> Firefox and WebKit desktop/mobile acceptance reported **276/276 assertions PASS**
> with **18 real screenshots inspected**. See the [exact-head evidence in issue
> #14](https://github.com/drevendev/Playmancer/issues/14#issuecomment-6402806426).
> This proves the named deployment and tested flows, **not future live revisions**
> or full accessibility. [Latest publish runs](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml)
> remain the current deployment authority.

The current publication build selects **12 identifiable real games** from the versioned Wikidata CC0 pilot. Genre evidence covers only 30% of the full model; no recommendation-quality claim is made. [Pilot sources and limits](docs/REAL_PILOT.md). [Exact-master CI](https://github.com/drevendev/Playmancer/actions/runs/40226036470)
passed all four jobs (Node/build, Chromium flow, multi-engine local HTTP, and
synthetic Bridge responsiveness). Hosted desktop/mobile acceptance covered
basket, keyboard interactions, hard filters, explanations, Bridge, share/restore,
reduced motion and simulated 200%/400% root-font enlargement. **Real browser
zoom and spoken output from a real screen-reader/browser pair remain NOT_RUN**;
[issue #14](https://github.com/drevendev/Playmancer/issues/14) stays open.
Large text can require extensive vertical scrolling on mobile. If the site
does not load, inspect the [publish workflow](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml);
a past green run does not prove current availability.

## Playable preview 0.3

The Pages default now uses a **12-game real catalog** with source-linked genre evidence. The original fictional twelve-profile preview remains available through plain `node scripts/build-demo.mjs` for tests. Preview 0.3 connects a validated build-time snapshot to the complete player journey. A second independent
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

## Real-game Wikidata pilot (opt-in, not yet on Pages)

A **12-title real-game pilot** is available as a separate, versioned build. Choose
**Stardew Valley, Terraria, Hades, Slay the Spire, Hollow Knight, Portal 2** and
other identifiable titles from Wikidata. Real titles and selected genre/platform
facts have [item-level source receipts](docs/REAL_PILOT.md); the structured
Wikidata source is **CC0**. No third-party descriptions or artwork are bundled.

```sh
node scripts/build-demo.mjs _site-real --catalog examples/catalog.wikidata.real.json
python3 scripts/pages-preflight.py _site-real
python3 -m http.server 8080 --directory _site-real
# After installing Playwright and Chromium:
python3 scripts/browser-real-catalog-acceptance.py
```

This pilot deliberately uses only source-stated Wikidata **genre (P136)**
overlap. Genres are carried through the current schema's `themes` field;
gameplay mechanics and co-op metadata remain **unknown**. The real-pilot-only
evidence gate admits a **30%** comparable-feature signal rather than inventing
the remaining 70%. Bridge and basket modes use the same restricted signal;
hard constraints are never loosened. A result is *not* proof of measured
player usefulness. Catalog coverage is still tiny.

**The public Pages default is still the 12-profile fictional preview.**
This PR is a separately tested, reviewable real-data integration; promoting it
to the public default needs a later accepted, exact-head change to the
publication/browser acceptance pipeline. Keep existing synthetic links bound to
their original `synthetic-demo-1` snapshot; incompatible links fail visibly.

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

The production command `npm run build` selects the real Wikidata pilot. To run the
legacy fictional sample independently, invoke `node scripts/build-demo.mjs` without
a catalog argument. The published real snapshot invalidates old synthetic basket
links explicitly rather than silently mixing catalogs.

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

The selected public catalog consists of 12 manually curated Wikidata items under its [CC0 structured-data policy](https://www.wikidata.org/wiki/Wikidata:Licensing), with [per-item source links and known limitations](docs/REAL_PILOT.md). Descriptions, mechanics, co-op and artwork are **not licensed or inferred** from missing records. Field coverage and recommendation quality remain limited; [#8](https://github.com/drevendev/Playmancer/issues/8) stays open until the real Pages build is independently accepted and live verified.

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
invalid-link recovery; it retains baseline, 400%-root-font first-screen and Bridge screenshots (18 across all six engine/viewports) plus per-engine JSON. CI failures remain
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
Only successful public checks can establish LIVE_VERIFIED for a specific
revision. Hosted desktop/mobile interaction was separately exercised at
`59003d0` ([acceptance evidence](https://github.com/drevendev/Playmancer/issues/14#issuecomment-6402806426)).
This does **not** establish real browser-zoom or audible screen-reader acceptance;
those remain tracked by [issue #14](https://github.com/drevendev/Playmancer/issues/14).
[#7](https://github.com/drevendev/Playmancer/issues/7) is the closed deployment milestone.

Use focused PRs, preserve all regression tests and independently review a later exact
head before merge. The repository has no adopted code license; public visibility is
not an assertion of reuse rights. Full EndlessZen unattended conformance and human
usefulness remain unclaimed. See [the roadmap](docs/ROADMAP.md) and
[product epic #1](https://github.com/drevendev/Playmancer/issues/1) for remaining gates.
