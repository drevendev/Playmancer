# Playmancer

**Mix your favorites. See the trade-offs.**

Choose one to five favorite profiles, set weights and hard filters, and see why
recommendations fit each preference or require a compromise. Favorites have
**Move up** and **Move down** keyboard-accessible buttons: reorder them without
removing them or losing weights, filters, exclusions or their share-link order.
On narrow real-player screens, the selected-count **Edit favorites** button jumps
straight to the full editor below recommendations. **Back to recommendations**
returns focus without changing the basket. Desktop keeps the side-by-side editor.
The first screen offers
**Browse games** (preserving favorites), **Try the sample basket**, or **Start empty**
(clearing starter favorites without silently changing hard filters). With no
favorites selected, the empty recommendations pane also offers **Browse available
games**; browsing preserves hard filters and share state. No account, paid inference,
tracking, remote assets or runtime API requests are needed. Broad catalog searches
show eight matches at a time, with an explicit **Show more matches** action that
keeps keyboard focus and does not change the shared basket. Already-selected title or alias matches are disclosed even when the search still offers other games; this does not add duplicates or change the shared basket. In the real catalog,
an unmatched game-name, genre or gameplay-fact search offers **Browse available
games** to explore without changing the weighted basket, required filters, or
saved link. Unrecognized storefront URLs retain an explicit no-fetch warning.

## Play in your browser — GitHub Pages

**[🎮 Open Playmancer](https://drevendev.github.io/Playmancer/)** ·
[54-game source receipts](docs/REVIEWED_MIXED_54.md) ·
[Pages deployment status](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml)

> **Default build:** 54 real games (53 with supported store links), with first-screen browsing. Live availability depends on the deployed revision. The
> [Pages workflow](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml)
> tests the served `master` revision, same-origin Bridge worker, and hosted desktop/mobile
> player journeys after each successful deployment. **This README is not a live
> deployment-status pointer**: check the latest workflow run for the currently served SHA.
>
> **Independently inspected LIVE_VERIFIED checkpoint (2026-11-20 UTC):**
> [`3a3e9aca7c6367e51d652718d8e92a92140decbf`](https://github.com/drevendev/Playmancer/commit/3a3e9aca7c6367e51d652718d8e92a92140decbf).
> [Publish Pages #44791754335](https://github.com/drevendev/Playmancer/actions/runs/44791754335)
> passed all four jobs, including the exact-SHA public index, Bridge worker, Gameplay
> Facts explorer and stylesheet gates, saved-basket restoration and hosted desktop/mobile
> journeys. [Verify #44791754242](https://github.com/drevendev/Playmancer/actions/runs/44791754242)
> passed all four jobs. Retained [real HTTPS browser screenshots and reports](https://github.com/drevendev/Playmancer/actions/runs/44791754335/artifacts/14657240923)
> recorded **673/673 player** and **1017/1017 explorer** assertions across Chromium,
> Firefox and WebKit. The Chromium desktop/mobile screenshots were independently inspected.
> This is a dated verification of that commit, **not a promise about the SHA served
> after later deployments**. Check the latest workflow run before assuming a release is live.
> [Issue #124](https://github.com/drevendev/Playmancer/issues/124) remains open:
> an independent native Jekyll publisher has not been disabled, and two distinct
> master commits without competing native output have not yet been proven.
>
> **Earlier inspected checkpoint (2026-11-02):**
> [`9844933255626e804dfa69d98d843128f6a18537`](https://github.com/drevendev/Playmancer/commit/9844933255626e804dfa69d98d843128f6a18537).
> [Publish #41393137711](https://github.com/drevendev/Playmancer/actions/runs/41393137711)
> passed all three jobs and 453/453 hosted browser assertions; its
> [screenshots](https://github.com/drevendev/Playmancer/actions/runs/41393137711/artifacts/13118297068)
> were inspected, including 400% text reflow. This older checkpoint is historical.
> Automated browser checks and screenshots do not certify spoken screen-reader behavior
> or actual browser zoom ([#14](https://github.com/drevendev/Playmancer/issues/14)).

### When Pages is unavailable: run the verified player locally

The production Pages URL can temporarily serve an unbuilt source template while
[the dual-publisher configuration issue](https://github.com/drevendev/Playmancer/issues/124)
remains open. A successful build or deployment API response does **not** mean
Pages is live. The normal public revision/worker/browser gates remain mandatory.

For a separate, runnable copy of the **same checked five-file production payload**:

1. Open [Publish Playmancer Pages runs](https://github.com/drevendev/Playmancer/actions/workflows/pages.yml)
   and choose a `master` run where **Verify and package exact master** passed.
   In **Artifacts**, download `playmancer-player-<40-character SHA>` (GitHub sign-in
   may be required; retained for 14 days), even if the later Pages publish failed.
2. Unzip the artifact into a directory containing `index.html`, `player.css`,
   `bridge-worker.js`, `observations.html` and `.nojekyll`. Confirm the artifact's
   SHA matches the run's `master` commit; do not substitute older versions.
3. In that directory run `python3 -m http.server 8000 --bind 127.0.0.1` and open
   `http://127.0.0.1:8000/`. Serve over HTTP, not `file://`, so the same-origin
   Bridge worker and versioned basket links work normally. Stop with Ctrl-C.

This is a **manual local player**, not a second public host or proof of a
LIVE_VERIFIED Pages release. The verified payload has no account, tracking or
runtime API dependency; external storefront links open only when selected.

### Current real-catalog pilot

The default build selects immutable snapshot
`multi-store-identity-candidate-54-2026-11-26`: **54 identifiable games** (53 with supported storefront links, including six owner-associated Dreven Games titles). Mindustry, Unciv and Sparklite add seven recorded store links across Steam, Google Play and itch.io; unreviewed genre and gameplay features remain unknown. See [the mixed-store release receipts](docs/REVIEWED_MIXED_54.md), [the 51-game release receipts](docs/REAL_EXPANSION_51.md),
[the 35-game release receipts](docs/REAL_EXPANSION_35.md), the
[30-game expansion](docs/REAL_EXPANSION_30.md), the
[previous expansion](docs/REAL_EXPANSION.md), the
[original Wikidata pilot](docs/REAL_PILOT.md), and
[storefront sources/limits](docs/STOREFRONTS.md).

The **ranking interface** uses source-backed genres, selected platform facts and
carefully normalized publisher-authored tags; mechanics and co-op remain unknown
in its scoring snapshot. A **separate source-backed gameplay fact explorer**
(`observations.html`) exposes 122 independently written, dated non-genre facts for
30 real games. The 24 profiles without reviewed facts (including DevMatch and Hades II) remain unreviewed, never verified lacking those features. [Bellbloom source receipts](docs/SEMANTIC_TAGS_BELLBLOOM_CANDIDATE.md) and [earlier dated source receipts](docs/SEMANTIC_TAGS_REVIEWED_29.md) and
[latest 29-profile v2 release-gate audit](docs/REVIEWED_TAG_READINESS_29.md).
This inventory is not a new recommendation mode or a claim of
improved ranking quality. Artwork and third-party descriptions are not copied.
Genre-only matches have at most **30% comparable feature-group coverage**, not
30% confidence or measured recommendation accuracy. Missing mandatory evidence
remains unknown: hard platform/co-op constraints are not silently relaxed.
The real snapshot's recorded platform lists are **positive observations only**:
an unlisted requested platform **cannot qualify a game for ranking**, but this
missing receipt is **unknown support**, not proof that the game cannot run there.
The uncertain partition identifies missing required platform and/or co-op evidence;
confirmed `coop=false` and explicit user exclusions remain actual failures in the
excluded partition. The **genre-fit calculation** is unchanged, but hard-filter
classification and the public **share method identifier** changed to
`feature-overlap-3`; older method-version links fail visibly instead of silently
replaying under revised eligibility semantics.
Outbound store links, including owner-associated games, do not affect ranking.
There is no account, tracking, runtime store API, paid inference or remote asset
dependency.

The 30-basket [scalar diagnostic](docs/EVALUATION_30.md) and independent
50-endpoint [Bridge diagnostic](docs/BRIDGE_EVALUATION_30.md) are reproducible
**offline proxy experiments, not human usefulness studies**. The
[exact-source v3→v4 comparison](docs/BRIDGE_V3_V4_FROZEN_50.md), accepted in
[PR #178](https://github.com/drevendev/Playmancer/pull/178), found **5 routes,
44 no-routes and 1 unavailable endpoint in both versions** on the same 50
ordered tasks at three hops/0.31. No task status or route path changed. V4
relabels missing positive-only platform evidence from failure to unknown,
without allowing that candidate through a hard filter. The negative route
coverage motivates better sourced features, not a claim of measured
player usefulness or recommendation improvement.

### Historical catalogs and share compatibility

The 24-game (`multi-store-genre-pilot-2026-10-28`) and 17-game snapshots
remain available for reproducible builds and prior share links. An older
17-game release was independently [live-verified at `dfb5f668`](https://github.com/drevendev/Playmancer/actions/runs/40540951449)
on 2026-10-27; **that historical verification is not the current release**.
The 12-item Wikidata-only and fictional sample fixtures also remain separate.
Share links pin catalog and method versions; incompatible versions fail visibly
rather than silently substituting newer entries.

## Player capabilities — 54-game pilot

Catalog search prefers whole-name/phrase and exact recorded store-link matches. If a multi-word search finds no whole-phrase match, it can match **all** words across recorded game names/IDs, genre labels and selected positive gameplay facts (for example `Factorio Automating`). Each such result is explicitly marked as partial evidence rather than a recommendation-fit score; unrecorded facts remain unknown. Search neither alters ranking nor relaxes hard filters. The 54-game catalog still has limited, non-exhaustive coverage.

The default 54-game snapshot powers the player capabilities below.
The earlier 17-game release is historical, not the current Pages catalog.
For isolated tests, `node scripts/build-demo.mjs` builds a fictional
twelve-profile fixture; a separate six-profile synthetic fixture covers aliases,
editions/DLC and unknown metadata. Share links preserve catalog and method
versions: the current site visibly rejects incompatible historical links instead
of silently substituting games from a different snapshot.

- Browse the 54 recorded games directly from the first-screen **Browse games** action, reveal eight results at a time, inspect recorded Steam/Google Play/itch.io links **before adding a favorite**, and add games without losing existing choices. Store links are optional outbound navigation, never automatic requests or a ranking signal. The **Browse by store** selector narrows *catalog discovery* to games with recorded Steam, Google Play or itch.io links; it combines with name/genre search, does not constrain recommendations, and is deliberately not part of shared-basket state. In the production release, catalog discovery also shows the count of individually reviewed **selected positive gameplay facts** and a version-pinned evidence lookup before adding a favorite. A zero-count/unreviewed game is explicitly **unknown**, not known to lack features. Matching a particular fact already provides its more specific source link. The independent fact inventory does not affect ranking, filters or shares; fictional and legacy previews do not invent it.
- Search names (including titles typed without punctuation, such as `Papers Please`), canonical IDs, declared aliases and source-recorded genre labels. Name and alias matches are shown before generic genre or partial gameplay-fact matches, with source-catalog order preserved within each class; this only changes discovery, not recommendation ranking. The real pilot also finds games by independently reviewed **positive gameplay facts** (for example, “Automating production”) and labels that match as **partial evidence**, not verified complete tags; a missing observation is unknown, not a negative. A matched positive fact links to its version-pinned original source in the Gameplay Facts explorer before adding a game. These facts affect catalog discovery only, never fit scores, hard constraints or shared-basket state. Synthetic profiles retain their authored feature-tag search. Add/remove up to five profiles.
- Promote any visible recommendation directly into a new favorite with **Add to favorites**; it receives weight 1, disappears from the candidate list, and preserves filters, share state and keyboard focus. At five favorites the add action is disabled until one is removed.
- Edit explicit integer weights with keyboard controls.
- Compare harmonic **Intersection**, diversified list-level **Blend**, and a weighted
  arithmetic baseline. Union is an evaluation baseline, not an Intersection label.
- Require platform/co-op support. Missing required evidence is unknown, never a pass.
- Inspect a recorded storefront directly from the **Uncertain / Excluded** disclosure even when strict filters abstain. A store page is optional outbound context, **not evidence** that the required platform or co-op feature is supported. Games without recorded store links receive none; inspecting one does not change eligibility, favorites or the shared basket.
- For an uncertain or excluded non-favorite in the real release, open its **version-pinned Gameplay Facts evidence** directly from that same disclosure. The explorer searches by canonical game ID and displays selected partial observations or an explicit unknown; no fact link claims required platform/co-op compatibility, and neither filters nor the shared basket change. Fictional previews contain no real-catalog evidence links.
- Inspect per-seed affinities, evidence coverage, shared features and mismatches.
- In a real-catalog basket containing at least two favorites, expand **Compare recorded facts between favorites** to inspect every favorite pair (up to ten pairs for five games) in the separate version-pinned Gameplay Facts explorer. Pair links preserve selection order, source revisions and the original weighted basket; missing observations remain unknown. The fictional preview does not invent comparisons.
- Recommendation cards now disclose **Extra recorded gameplay overlap** where
  a candidate shares independently written, positive Gameplay Facts with an
  explicit favorite. The compact details panel names each supported favorite
  and trait and offers a direct source-receipt link for that favorite in the
  revision-pinned Gameplay Facts explorer (new tab); 30 partially reviewed
  profiles are available. Absence of this
  disclosure is **not** a mismatch: missing facts remain unknown. These facts
  never enter fit scores, hard filters, rankings, or basket shares. The data
  are pinned to the same catalog/observation revision as the separate explorer;
  no runtime data requests are made.
- Each real-catalog recommendation's **Compare recorded facts with your favorites** disclosure shows the candidate's independently reviewed selected positive fact count (**partial**, or **unreviewed / unknown**), separate from the genre-based fit coverage. Expand it to inspect the candidate's own exact-ID, exact-revision Gameplay Facts sources directly, or choose **any selected favorite** for a pinned two-game comparison in a new tab. Links keep basket order and versions, preserve the original basket, and do **not** alter rankings or hard filters.
- On real-game result cards, expand the **Why [game] matches your basket** / **Why [game] appears in this list** explanation for an additional equal-weight, source-recorded genre-mass proxy per favorite. It reports residual genre emphasis, including shared labels with unequal shares, but **does not change ranking** and does not claim that uniform tag weights are source-supplied importance.
- Hide/restore results and recover explicitly from empty results without silent
  filter relaxation.
- Share ordered IDs/weights, mode, filters, exclusions and catalog/method versions.
- Use visible focus, native 44px-class controls, reduced motion and narrow reflow.

**Bridge two favorites** is a separately labelled experimental route panel, not a
fourth basket-ranking mode. Use **Explore Bridge routes** on the first screen,
select two distinct basket games, and inspect supported steps and trade-offs.
Platform/co-op requirements and hidden-game exclusions also apply to routes.
In the real pilot, missing platform support is an **unknown positive receipt**,
not demonstrated incompatibility; unknown support remains ineligible for
Bridge endpoints/intermediates. Confirmed non-co-op remains an actual failure.
Bridge route semantics are versioned as `bridge-features-preview-4`; old
route-version links fail visibly rather than silently changing their paths.
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

Use the current `npm run build` command below for the default 54-game input.
All snapshots retain their own catalog versions and provenance.

## Run and verify

Use Node.js 22. There are no npm dependencies or API keys.

```sh
npm test
npm run validate:catalog
npm run benchmark
node scripts/run-bridge-preview.mjs
npm run build
python3 scripts/release-preflight.py _site
# Optional local hosting; this is not public deployment.
python3 -m http.server 8080 --directory _site
```

With this build configuration, `npm run build` selects the 54-game multistore snapshot. Rebuild the historical 30-game full release with `node scripts/build-release.mjs _site-30 --candidate-30` and validate it with `python3 scripts/release-preflight.py _site-30 --candidate-30`. Historical links are not silently migrated. For a saved-basket library spanning catalog versions, retain the original exported JSON backup. Restore each basket on its matching version: build 35 with `node scripts/build-release.mjs _site-35 --candidate-35` or 51 with `node scripts/build-release.mjs _site-51 --candidate-51` and serve the build over local HTTP. The library is origin-scoped; use different paths on the same origin to retain the same local saves. Mixed-version backups are rejected atomically on import; retain the original and import version-specific copies without rewriting any stored share hash. The explicit 51 flag rebuilds the historical snapshot, not the current default. A 51-version URL will be rejected visibly on the 54 build: keep its original fragment and paste it unchanged after the matching locally served 51 URL. A local server has separate storage from public Pages; use the original exported backup to recover local saves. No historical hosted path is promised. The explicit `--candidate-54` flag rebuilds the current default. To build
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

The public player method `feature-overlap-3` keeps the same genre-only fit
calculation but corrects required-platform **classification** in real snapshots.
A platform missing from a non-exhaustive source list is **uncertain**, never a
confirmed incompatibility or an eligible recommendation. Confirmed negative
co-op observations still exclude candidates. Fictional fixture platform lists
remain exhaustive for deterministic tests. The uncertainty/exclusion disclosure
labels each row independently, and older `feature-overlap-2` share links fail
visibly rather than silently replaying under revised hard-filter semantics.
This is not the source-backed weighted-tag recommender v2 (issue #76).

`src/catalog.js` validates schema/snapshot versions, source attribution, recorded
field rights, canonical game IDs, aliases, external-ID collisions and distinct
edition/DLC/remake relations. Unknown metadata is `null`; empty lists and `false`
co-op values are observations, not missing data. Arbitrary extras/artwork are omitted.
The alternate static builder accepts up to 8 MiB and 2,000 profiles. Bridge
retains its 250-profile route limit; larger builds explicitly abstain without
truncating the catalog. These are engineering bounds, not a mobile latency
or 1,000-game real-release guarantee. The first two selected-snapshot records form the sample.

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

The current public player/share method is `feature-overlap-3`: the genre-only
fit calculation is unchanged, while unlisted platforms in real positive-only
source lists are now classified as unknown instead of disproven. Links from
`feature-overlap-1` and `feature-overlap-2` fail visibly rather than silently
upgrading. Starting a sample or empty basket is
explicit recovery. Changed catalog records require a new immutable snapshot ID.
Benchmark report versioning is separate from player shares.

## Browser acceptance and CI

For validated snapshots of **50–250 profiles served over HTTP(S)**, Bridge
calculates routes inside a **same-origin static Web Worker** built from the
same exact-rational source modules as the small preview. The publishable artifact
contains `index.html`, same-origin `player.css`, `bridge-worker.js`, a separate `observations.html`, and an empty `.nojekyll`. Changing an endpoint,
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

The dependency-free production build emits a self-contained **static site**:
`index.html`, `player.css`, `bridge-worker.js`, `observations.html` and an empty
`.nojekyll`. A separate [observation explorer](docs/OBSERVATION_EXPLORER.md)
provides source links and partial-data comparisons, without altering the basket. Moving the stylesheet into
a same-origin asset restores HTML size headroom without remote requests; offline
`page.set_content` harnesses inline the exact built CSS, while HTTP and Pages
load the real asset. HTML includes publication revision and catalog metadata.
Invalid catalog or bundle inputs fail before replacing the last valid HTML.
Build success is not deployment evidence.

The Pages workflow deploys **reviewed master only** and fails explicitly if
Pages is disabled. Pages is currently enabled, but the workflow does not change
repository administration or weaken protection. On successful deployment, CI
checks the public index against the exact `playmancer-revision` master SHA
and tests the same-origin Bridge worker and hosted player flows.
The 30-game public pilot passed a dated [exact-revision Pages and hosted-player
checkpoint](https://github.com/drevendev/Playmancer/actions/runs/41209458813)
on 2026-10-31 at `318229a00b17556336f4437bc989fd7cb0df55b0`.
The earlier 17-game release passed [its own exact-revision
verification](https://github.com/drevendev/Playmancer/actions/runs/40540951449)
on 2026-10-27. These are historical evidence checkpoints, **not automatic proof
that the current live URL serves either SHA**. Always check the newest Pages run.
Automated root-font reflow checks are **not** real browser-zoom or audible
screen-reader acceptance; those remain tracked by
[issue #14](https://github.com/drevendev/Playmancer/issues/14).
[#7](https://github.com/drevendev/Playmancer/issues/7) is the closed deployment milestone.

Use focused PRs, preserve all regression tests and independently review a later exact
head before merge. The repository has no adopted code license; public visibility is
not an assertion of reuse rights. Full EndlessZen unattended conformance and human
usefulness remain unclaimed. See [the roadmap](docs/ROADMAP.md) and
[product epic #1](https://github.com/drevendev/Playmancer/issues/1) for remaining gates.
