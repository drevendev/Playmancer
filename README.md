# Playmancer

Mix your favorites. See the trade-offs.

A multi-seed game-discovery project. The product direction and research evidence
remain in [issue #1](https://github.com/drevendev/Playmancer/issues/1).

## Working synthetic prototype

This branch connects the existing P03 ranking core to a usable, list-first basket
interface. Its **12 fictional profiles are authored test data**, not real games,
a licensed commercial catalog, or evidence of recommendation quality.

- Search, add/remove up to five profiles, and set independent integer seed weights.
- Compare harmonic **Intersection**, list-level **Blend**, and the weighted-average
  baseline. Blend exposes its relevance/gain parameter and selection diagnostics.
- Require a platform or co-op support. Unknown metadata never satisfies a hard
  constraint. Uncertain, excluded, and empty results stay explicit; there is no fallback.
- Inspect per-seed affinity, shared tags, seed tags not shared, and evidence coverage.
- Hide/restore results and share the exact versioned basket, weights, mode, filters,
  exclusions, and Blend parameter. Unavailable versions are rejected, not upgraded silently.
- Use keyboard controls and narrow screens without a required map or drag interaction.

**Bridge is not part of this demo.** It remains a separate endpoint-routing
experiment, not another scalar score. Real catalog ingestion, identity/alias sample
validation, user studies, automated publication, and full EndlessZen unattended
readiness are not claimed by this prototype.

## Run and build

Node 22 is the locally verified runtime. There are no npm dependencies or API keys.

```sh
npm test
npm run build
# Optional: serve the build rather than opening _site/index.html directly.
python3 -m http.server 8080 --directory _site
```

The build writes a self-contained `_site/index.html` plus `.nojekyll`, suitable for
static publication after review and configuration of GitHub Pages. It contains no
remote scripts, fonts, images, analytics, or runtime requests. The small build script
supports only the three declared modules and rejects unsupported imports.

Share links become public only when this build is hosted. Links copied from a local
file point to that local file; they are not a public deployment.

## Verification

```sh
# Optional browser harness; Python Playwright and Chromium are required.
python3 scripts/browser-smoke.py
```

The browser harness exercises the exact built document offline in Chromium. It
checks keyboard add/remove/weights, skip-link focus without losing basket state,
mode controls, hard-constraint uncertainty, empty results, exclusions, share-state
restoration, invalid-version rejection, reduced-motion preference and no horizontal
overflow at 360/390/800/1280 CSS pixels. It is not a hosted-navigation, screen-reader,
Safari, Firefox, or complete WCAG conformance test.

On 2026-10-02 the prepared change passed **34 Node tests** and **21 offline Chromium
checks**. The original ranking module and its 15 tests were verified against their
GitHub blob hashes before reuse. No hosted CI or Pages deployment was run.

## Model limitations

Affinity is weighted Jaccard overlap on authored mechanics (70%) and themes (30%).
Pairs with less than 70% comparable feature weight are uncertain. Evidence coverage
is the minimum comparable fraction across the selected seeds, separate from fit.
These are explicit synthetic-demo parameters, not validated real-world thresholds.
Popularity, ratings and projection coordinates are not ranking inputs.

The underlying ranking core and research branches are retained. This product slice
uses the existing ranking branch rather than creating another workstream. Semantic
changes still require later exact-head verification before merge; protected `master`
is not bypassed. Bootstrap PR #2 remains a separate open control-plane correction.
