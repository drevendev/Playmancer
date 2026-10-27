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

> **Release evidence (2026-10-27):** The 17-game catalog reached `master` at
> [`97f4bf1d`](https://github.com/drevendev/Playmancer/commit/97f4bf1d74bdfdc48b54740bed672f241d160c23).
> An [automatic Pages deployment](https://github.com/drevendev/Playmancer/actions/runs/40511861195)
> succeeded for that SHA, but the independent
> [Publish and hosted-browser workflow](https://github.com/drevendev/Playmancer/actions/runs/40511862427)
> was cancelled during OS dependency installation. **The 17-game public HTML revision,
> worker, and hosted desktop/mobile player remain NOT LIVE_VERIFIED in that run.**
> Check the [latest publisher runs](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml)
> for a successful exact-revision HTTP check **and** hosted browser acceptance.

**Merged real-catalog pilot:** 17 real games, comprising
12 existing Wikidata entities and all **five verified Dreven Games** entries,
with direct Steam (11), itch.io (4) and Google Play (2) store pages. An owner
association is disclosed in the UI and **never changes ranking**. Storefront
link IDs and available owner-published genre/platform facts are curated into a
new, immutable static snapshot; there is **no runtime store API, copying of
other publishers' descriptions/media, paid data feed or tracking**.
See [storefront sources and constraints](docs/STOREFRONTS.md).

## Playable preview 0.3

The production Pages build on `master` selects **17 real games** with safe
outbound storefront references, including five Dreven Games titles. Live
revision/browser verification is tracked separately above; merged source alone
does not prove a served version. The fictional twelve-profile fixture remains
available via plain `node scripts/build-demo.mjs` for isolated tests. Preview
0.3 connects a validated build-time snapshot to the whole
player journey. A separate six-profile synthetic fixture exercises aliases,
editions/DLC and unknown metadata. Existing synthetic-only share links must
pass the catalog-version gate; they are not silently upgraded to the real catalog.

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

## Real-game multistore pilot (17 titles; hosted verification pending)

The production snapshot combines **12 Wikidata games and five Dreven Games**.
A separate versioned 12-title Wikidata-only pilot remains available as a test fixture. Choose
**Stardew Valley, Terraria, Hades, Slay the Spire, Hollow Knight, Portal 2** and
other identifiable titles from Wikidata. Real titles and selected genre/platform
facts have [item-level source receipts](docs/REAL_PILOT.md); the structured
Wikidata source is **CC0**. No third-party descriptions or artwork are bundled.

```sh
node scripts/build-demo.mjs _site-real --catalog examples/catalog.multistore.real.json
python3 scripts/pages-preflight.py _site-real
python3 -m http.server 8080 --directory _site-real
# After installing Playwright and Chromium:
python3 scripts/browser-real-catalog-acceptance.py
```

The multistore pilot uses source-stated Wikidata **P136 genres** plus conservatively
normalized **publisher-authored Dreven Games genre tags**. These are carried
through the current schema's `themes` field;
gameplay mechanics and co-op metadata remain **unknown**. The real-pilot-only
evidence gate admits a **30%** comparable-feature signal rather than inventing
the remaining 70%. Bridge and basket modes use the same restricted signal;
hard constraints are never loosened. A result is *not* proof of measured
player usefulness. Catalog coverage is still tiny.

The 17-game snapshot is already merged to `master`; the independent hosted
exact-revision and desktop/mobile verification must pass before claiming that
the *new* snapshot is live and usable. Existing synthetic links remain bound to
`synthetic-demo-1`; incompatible catalog versions fail visibly.

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

On `master`, `npm run build` selects the 17-game multistore pilot. To build
the fictional sample independently, invoke `node scripts/build-demo.mjs`
without a catalog argument. Older synthetic basket links are intentionally
rejected by the real snapshot's visible version check instead of silently
mixing catalogs.

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

The merged public-build input combines 12 original Wikidata CC0 items with five
Dreven Games entries sourced from the owner's public game listings.
[Storefront receipts and limits](docs/STOREFRONTS.md) and the
[original Wikidata evidence](docs/REAL_PILOT.md) remain separate.
Descriptions, mechanics, co-op and artwork are **not inferred or copied**
from missing or unlicensed records. Field coverage and recommendation quality
remain limited; [#8](https://github.com/drevendev/Playmancer/issues/8) stays open
for source expansion and better evidence even after a verified real-catalog release.

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
