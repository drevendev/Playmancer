# Playmancer

**Mix your favorites. See the trade-offs.**

Build a basket of one to five game profiles, choose what matters, and inspect why
recommendations fit or compromise. The product direction and research receipts
are in [issue #1](https://github.com/drevendev/Playmancer/issues/1).

## Playable preview 0.1

The preview uses **12 authored fictional profiles**, not a real game catalog or
measured recommendation quality. It has no accounts, paid inference, tracking,
remote assets, or runtime API requests.

- Start with a sample or an empty basket directly from the first screen.
- Search/add/remove profiles and adjust keyboard-accessible integer weights.
- Compare harmonic **Intersection**, diversified list-level **Blend**, and the
  weighted-average baseline. These are distinct intentions, not renamed unions.
- Require platform/co-op support. Unknown metadata never passes a required filter.
- Read per-seed affinities, evidence coverage, shared features, and mismatches.
- Hide/restore results. Empty results explain hidden, failed, unknown, and sparse
  candidates and offer explicit recovery actions; filters never relax themselves.
- Share ordered IDs, weights, mode, filters, exclusions, and catalog/method versions.
- Use native 44px-class label targets, keyboard focus, reduced motion, and reflow.

**Bridge is a separately tested route experiment, not a mode exposed by this UI.**
Real-catalog ingestion, identity/edition sample validation, user studies, and full
EndlessZen unattended readiness are not claimed.

## Run and verify

Node 22 is the verified runtime. There are no npm dependencies or API keys.

```sh
npm test
npm run build
python3 scripts/pages-preflight.py _site
# Optional local hosting; a local URL is not a public deployment.
python3 -m http.server 8080 --directory _site
```

The build emits only a self-contained `_site/index.html` and `.nojekyll`.
For the real Chromium checks, install Python Playwright and its browser:

```sh
python3 -m pip install playwright==1.55.0
python3 -m playwright install chromium
python3 scripts/browser-smoke.py
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an already installed Chromium.
The harness tests the exact built document offline, including first-screen actions,
empty-state recovery, sharing, keyboard controls, 280–1280px layouts and increased
root text sizes. It saves screenshots and JSON under `.test-artifacts/`.
It is not hosted-navigation, screen-reader, Safari/Firefox, or complete WCAG proof.
GitHub Actions runs the full Node suite, payload validation, byte-identical builds,
and this browser harness for PR acceptance.

## Versioned methods and publication

`synthetic-demo-1` uses weighted Jaccard overlap on mechanics (70%) and themes (30%).
Less than 70% comparable evidence means uncertainty, not zero fit. Evidence coverage
is separate from fit; popularity, ratings, and map coordinates are not inputs.
These are explicit fixture parameters, not validated real-player thresholds.

`feature-overlap-2` fixes large-weight overflow, locale-dependent ID ties, duplicate
candidate identity, and repeated normalization/Blend endpoint disagreement. Old
`feature-overlap-1` links are rejected visibly rather than silently recalculated;
starting a sample or new basket is an explicit recovery action.

The Pages workflow validates/builds before uploading and deploys **only master**.
It requires an administrator to provision Pages with GitHub Actions as its source;
it does not enable Pages or bypass permissions itself. A failed build cannot publish.
The HTML records `playmancer-revision` from `GITHUB_SHA` (or an explicitly supplied
`PLAYMANCER_REVISION`) for later served-revision verification. Local builds use
`unpublished`. A successful build or workflow commit is not proof of a live site.

Pages has not been deployed or live-verified by this change. After provisioning,
run the Pages workflow on master and compare the served revision and actual player
flow before advertising a live demo.

Publication references, checked 2026-10-09:
[GitHub custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[configure-pages](https://github.com/actions/configure-pages),
[deploy-pages](https://github.com/actions/deploy-pages).
