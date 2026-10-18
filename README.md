# Playmancer

**Mix your favorites. See the trade-offs.**

Choose one to five favorite profiles, set their weights and hard filters, and see why
recommendations fit each preference or require a compromise. Start with a sample or
an empty basket; no account, paid inference, tracking, remote assets or runtime API
requests are needed.

## Playable preview 0.2

This is an explicitly **fictional twelve-profile preview**, not a real game catalog
or a claim of measured recommendation quality. Preview 0.2 adds a validated catalog
contract, reproducible benchmark reports and retained browser evidence. The existing
player-facing rankings and compatible share links keep their semantics.

- Search, add and remove profiles; edit integer weights with the keyboard.
- Compare harmonic **Intersection**, diversified list-level **Blend**, and a weighted
  arithmetic baseline. Union is an evaluation baseline, not an Intersection label.
- Require platform/co-op support. Missing required evidence is unknown, never a pass.
- Inspect per-seed affinities, evidence coverage, shared features and mismatches.
- Hide/restore results and recover explicitly from empty results without silent
  filter relaxation.
- Share ordered IDs/weights, mode, filters, exclusions and catalog/method versions.
- Use visible focus, native 44px-class controls, reduced motion and narrow reflow.

**Bridge is still a separately tested route experiment, not an exposed UI mode.**
The next delivery gates are in [the roadmap](docs/ROADMAP.md), including the remaining
scope of [product epic #1](https://github.com/drevendev/Playmancer/issues/1).

## Run and verify

Use Node.js 22. There are no npm dependencies or API keys.

```sh
npm test
npm run validate:catalog
npm run benchmark
npm run build
python3 scripts/pages-preflight.py _site
# Optional local hosting; this is not public deployment.
python3 -m http.server 8080 --directory _site
```

For machine-readable benchmark JSON without npm's command banner:

```sh
node scripts/run-ranking-benchmark.mjs examples/benchmark.synthetic.json > report.json
node scripts/validate-catalog.mjs path/to/catalog.json --publishable
```

See [the benchmark contract](docs/BENCHMARK.md) for shared eligibility/top-k and
report versions. See [the catalog contract](docs/CATALOG.md) for identity, coverage,
publication attestations and the explicit JSON input boundary.

## Catalog contract

`src/catalog.js` validates schema version, snapshot identity, source attribution,
recorded field rights, canonical game IDs, declared aliases, external-ID collisions
and edition/DLC/remake relations. Unknown metadata is preserved as `null`; observed
empty lists and `false` co-op values are not missing data. The public projection is
allowlisted and excludes artwork and arbitrary extra fields.

The actual twelve authored profiles are checked by the build with the synthetic
publication gate enabled. This is **not** legal verification of an external source.
No real source receipt, description/artwork license or real-catalog coverage is
claimed. A catalog input is ordinary parsed JSON, not arbitrary executable JavaScript.

`synthetic-demo-1` uses weighted Jaccard overlap on mechanics (70%) and themes (30%).
Less than 70% comparable evidence means uncertainty, not zero fit. Evidence coverage
is separate from fit; popularity, ratings and map coordinates are not ranking inputs.
These are explicit fixture parameters, not validated real-player thresholds.

The unchanged player method is `feature-overlap-2`. Incompatible catalog/method links
fail visibly rather than silently upgrading. Starting a sample or new basket is an
explicit recovery action. Benchmark report versioning is separate from player shares.

## Browser acceptance and CI

```sh
python3 -m pip install playwright==1.55.0
python3 -m playwright install chromium
python3 scripts/browser-smoke.py
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` may select an installed Chromium. The harness tests
the exact built document offline: sample/empty actions, keyboard controls, filters,
sharing, recovery, 280–1280px reflow and increased root text sizes. It saves PNGs and
JSON in `.test-artifacts/`. CI retains those specific files as a browser artifact,
including when the browser step fails; missing evidence is not a pass.

The full Node suite, catalog publication validation, reproducible benchmark output,
deterministic build, payload preflight and Chromium checks are executed for PRs.
Offline browser acceptance is not hosted navigation, screen-reader testing,
Safari/Firefox coverage or complete accessibility certification.

## Publication and contribution

The build emits only self-contained `_site/index.html` and `.nojekyll`. The existing
Pages workflow deploys **reviewed master only**, and requires authorized administration
to provision Pages with GitHub Actions as the source. It does not auto-enable Pages
or weaken protection. Invalid catalog/build inputs fail before output replacement.

The HTML records `playmancer-revision` from `GITHUB_SHA` or `PLAYMANCER_REVISION`;
local builds use `unpublished`. Build success is not deployment evidence.
As of 2026-10-18, Pages is unprovisioned and no public URL is live-verified; [#7](https://github.com/drevendev/Playmancer/issues/7)
tracks the exact deployment and hosted-player acceptance gates.

Use focused PRs and preserve the full regression suite. Newly authored semantic work
requires a separate later exact-head review before merge. The repository has no
adopted code license; public visibility is not an assertion of reuse rights.
Full EndlessZen unattended conformance and human usefulness remain unclaimed.
