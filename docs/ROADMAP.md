# Playmancer delivery roadmap

Reconciled 2026-10-23. This is a product plan, not an hourly log.
Native GitHub facts supersede dated snapshots. Epic #1 stays open until rights-cleared
real data, public hosted experience and usefulness gates are evidenced.

## Delivered foundation (not a public launch)

At reconciliation, `master` `e065a02bb988e6a6fc31cb36475fdeeca1629f22` contains Preview 0.2 (#11),
the explained Bridge journey (#12, issues #9/#18/#19), and Preview 0.3 validated
catalog adapter/build recovery/share capacity (#20, issues #13/#21/#23).
Earlier PRs #2–#5 were already delivered. Verify run 39931904927 succeeded on
this exact master; Publish run 39931904881 failed Pages configuration. The
repository reports `has_pages=false`. No public HTTP/desktop/mobile live flow
is verified. Catalog data are fictional/synthetic; no real-data rights are asserted.

Bridge remains distinct from Intersection and Blend. Preview 0.3 shares a single
validated catalog projection across search, ranking, Bridge and share restoration,
with strict exclusions, versioned links and explicit missing metadata. Software tests
and benchmark reproducibility do not establish recommendation usefulness.

## Closing-first delivery

| Priority | Task | Dated state | Acceptance |
| --- | --- | --- | --- |
| P1 | #17 reconcile control navigation | PR #22 OPEN, existing branch being refreshed to current master | Later independent exact-head review/CI, merge, and readback of state/index/registry/changelog/roadmap; do not mix runtime changes |

## Independent remaining gates

| Priority | Issue | Completion evidence | Scoped dependency |
| --- | --- | --- | --- |
| P0 | #7 — Pages delivery | Admin-enabled Pages, successful deployment, public HTTP response, served master revision, hosted desktop/mobile navigation/share-restoration proof | Current GitHub connection lacks admin; publish workflow fails configuration |
| P1 | #8 — rights-cleared real catalog | 30–50 varied identifiable actual games with per-source/field receipts, identity/alias/edition counterexamples and publishable versioned snapshot | Data redistribution rights; API availability alone is insufficient |
| P1 | #14 — accessibility/cross-browser | Firefox/WebKit plus assistive-tech/keyboard tests, real HTTP navigation, errors, focus and readable list-first results | Chromium offline checks do not certify hosted usability |
| P2 | #15 — Bridge responsiveness | Dense/sparse/disconnected 12/50/250 synthetic fixtures, median/p95 and input responsiveness; bounded worker/deferred route if justified | Prior heap/cache work is partial, not mobile performance evidence |
| P2 | #16 — archived regression adoption | Focused unique basket/benchmark tests checked against current contracts, fail-before/pass-after where relevant | Avoid obsolete control patches and duplicate oracle campaigns |
| P2 | #10 — usefulness/comparison | Frozen identical-catalog baselines, negative results and authorized consented player observations | Real catalog and usable published experience; no unapproved outreach |

Proposed sample sizes are research targets, not completed metrics. Source, Pages,
network and runtime blockers affect dependent work only. Preserve truthful
`PR_OPENED`, `MERGED`, `BUILT`, `DEPLOYED`, `LIVE_VERIFIED` distinctions.

## Branch, acceptance and scope discipline

Finish or repair existing PRs before opening new work. Do not create shadow branches,
duplicate issues, process ceremonies or a parallel scheduler. Later-run exact-head
acceptance and actual provider rules govern merge. Preserve unique stale work until
safely adopted. No accounts, paid inference, tracking, external outreach, runtime
backend, vector database or alternative host is authorized by this roadmap.
Format 2 and the owner-controlled perpetual schedule are unchanged.
