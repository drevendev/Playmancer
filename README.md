# Playmancer

**Mix your favorites. See the trade-offs.**

Choose one to five favorite profiles, set weights and hard filters, and see why
recommendations fit each preference or require a compromise. Start with **Browse games**, a sample, or
an empty basket; no account, paid inference, tracking, remote assets or runtime API
requests are needed.

## Play in your browser — GitHub Pages

**[🎮 Open Playmancer](https://drevendev.github.io/Playmancer/)** ·
[30-game source receipts](docs/REAL_EXPANSION_30.md) ·
[Pages deployment status](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml)

> **Verified public release (2026-10-30): 30 real games, with first-screen browsing.** The live Pages
> revision is [`e500a2d57b608c6e96a91464a8f3aba5689d383f`](https://github.com/drevendev/Playmancer/commit/e500a2d57b608c6e96a91464a8f3aba5689d383f).
> [Publish Pages #40991264586](https://github.com/drevendev/Playmancer/actions/runs/40991264586)
> passed all three jobs: exact-master build, deployment, public HTTPS revision
> check, same-origin Bridge worker and hosted desktop/mobile browsing and basket journeys.
> [Verify #40991264496](https://github.com/drevendev/Playmancer/actions/runs/40991264496)
> passed all four Node/build, Chromium, Firefox/WebKit and Bridge jobs.
> **Status for this exact SHA: LIVE_VERIFIED.** Later commits need their own
> exact-revision checks; an updated README or build alone is not a live deployment.
> Native browser zoom and spoken screen-reader acceptance remain unverified
> ([#14](https://github.com/drevendev/Playmancer/issues/14)).

### Current real-catalog pilot

The public build selects immutable snapshot
`multi-store-genre-pilot-30-2026-10-28`: **30 identifiable games** (25 sourced
Wikidata CC0 items and five owner-associated Dreven Games titles). The six most
recent additions are **Dwarf Fortress, FTL: Faster Than Light, Super Meat Boy,
Papers, Please, Inscryption, and Sekiro: Shadows Die Twice**. See
[their item-level source receipts](docs/REAL_EXPANSION_30.md), the
[previous expansion](docs/REAL_EXPANSION.md), the
[original Wikidata pilot](docs/REAL_PILOT.md), and
[storefront sources/limits](docs/STOREFRONTS.md).

The interface uses source-backed genre and selected platform facts plus
conservatively recorded publisher-authored tags. **Mechanics, co-op metadata,
artwork and third-party descriptions are not invented or redistributed.**
Genre-only matches have at most **30% comparable feature-group coverage**, not
30% confidence or measured recommendation accuracy. Missing mandatory evidence
remains unknown: hard platform/co-op constraints are not silently relaxed.
Outbound store links, including owner-associated games, do not affect ranking.
There is no account, tracking, runtime store API, paid inference or remote asset
dependency.

The 30-basket [scalar diagnostic](docs/EVALUATION_30.md) and independent
50-endpoint [Bridge diagnostic](docs/BRIDGE_EVALUATION_30.md) are reproducible
**offline proxy experiments, not human usefulness studies**. Bridge found
5 supported routes, 44 no-routes and one unavailable endpoint under its frozen
three-hop/0.31 settings. These negative results motivate better sourced game
features; do not interpret them as real-player success or failure rates.

### Historical catalogs and share compatibility

The 24-game (`multi-store-genre-pilot-2026-10-28`) and 17-game snapshots
remain available for reproducible builds and prior share links. An older
17-game release was independently [live-verified at `dfb5f668`](https://github.com/drevendev/Playmancer/actions/runs/40540951449)
on 2026-10-27; **that historical verification is not the current release**.
The 12-item Wikidata-only and fictional sample fixtures also remain separate.
Share links pin catalog and method versions; incompatible versions fail visibly
rather than silently substituting newer entries.

## Player capabilities — 30-game pilot

The currently published 30-game snapshot powers the player capabilities below.
The earlier 17-game release is historical, not the current Pages catalog.
For isolated tests, `node scripts/build-demo.mjs` builds a fictional
twelve-profile fixture; a separate six-profile synthetic fixture covers aliases,
editions/DLC and unknown metadata. Share links preserve catalog and method
versions: the current site visibly rejects incompatible historical links instead
of silently substituting games from a different snapshot.

- Browse the 30 recorded games directly from the first-screen **Browse games** action, reveal eight results at a time and add them to the basket without losing existing choices.
- Search names, canonical IDs, declared aliases and source-recorded genre labels (synthetic profiles also support their authored feature tags); genre-only suggestions disclose the matching tag. Add/remove up to five profiles.
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

## Rebuild the historical 17-game pilot

The retained 17-game snapshot contains 12 Wikidata records and five Dreven
Games entries. It is **not** the current Pages catalog. To reproduce that
older artifact locally without changing the deployed site:

```sh
node scripts/build-demo.mjs _site-real --catalog examples/catalog.multistore.real.json
python3 scripts/pages-preflight.py _site-real
python3 -m http.server 8080 --directory _site-real
```

Use the current `npm run build` command below for the published 30-game input.
All snapshots retain their own catalog versions and provenance.

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

With this build configuration, `npm run build` selects the current live-verified 30-game multistore snapshot. To build
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

The selected public-build input retains the original 12 Wikidata CC0 items, seven
previously added Wikidata items and five owner-associated Dreven Games entries,
then appends six sourced Wikidata CC0 games; earlier snapshots remain immutable.
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

The Pages workflow deploys **reviewed master only** and fails explicitly if
Pages is disabled. Pages is currently enabled, but the workflow does not change
repository administration or weaken protection. On successful deployment, CI
checks the public index against the exact `playmancer-revision` master SHA
and tests the same-origin Bridge worker and hosted player flows.
The **current 30-game release** passed
[Publish Pages #40991264586](https://github.com/drevendev/Playmancer/actions/runs/40991264586)
on 2026-10-30 at `e500a2d57b608c6e96a91464a8f3aba5689d383f`.
The earlier 17-game release passed
[its own exact-revision verification](https://github.com/drevendev/Playmancer/actions/runs/40540951449)
on 2026-10-27; neither run certifies future SHAs.
Automated root-font reflow checks are **not** real browser-zoom or audible
screen-reader acceptance; those remain tracked by
[issue #14](https://github.com/drevendev/Playmancer/issues/14).
[#7](https://github.com/drevendev/Playmancer/issues/7) is the closed deployment milestone.

Use focused PRs, preserve all regression tests and independently review a later exact
head before merge. The repository has no adopted code license; public visibility is
not an assertion of reuse rights. Full EndlessZen unattended conformance and human
usefulness remain unclaimed. See [the roadmap](docs/ROADMAP.md) and
[product epic #1](https://github.com/drevendev/Playmancer/issues/1) for remaining gates.
