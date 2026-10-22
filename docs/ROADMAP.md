# Playmancer delivery roadmap

Reconciled 2026-10-22. This is a product plan, not an hourly log. Native GitHub facts
supersede the dated snapshots below. Epic #1 remains open until real data, publication
and usefulness gates are evidenced; passing software tests do not establish demand.

## Delivered foundation

Master `0c6ed23faabb3bad7b3adb86ae9a0d5013bd25c8` contains Preview 0.2 via merged
PR #11 and closed issue #6. Earlier PRs #2/#3/#4/#5 are also complete. The static
foundation includes fictional basket ranking, weights, hard filters, explanations,
reproducible sharing, identity/provenance validation and bounded benchmark contracts.
Do not reopen obsolete review claims for these PRs.

## Closing-first delivery

| Priority | Work | Dated delivery state | Required closing evidence |
| --- | --- | --- | --- |
| P0 | #9/#18/#19 — explained Bridge, precision and discovery | PR #12 OPEN/READY; head `3c5ff7f35985b34241381717f2cff75fcd317ea8`; Verify 39732338511 SUCCESS | Later independent exact-head acceptance, provider checks/rules and merge; no same-turn production/merge |
| P1 | #13/#21 — snapshot-to-player adapter and safe build replacement | PR #20 OPEN/READY; head `5679f65d7e2d0b1da86bebbd7b1b885a5e7385ee`; Verify 39734899397 SUCCESS | Merge #12 first; immediately retarget #20 to master, synchronize and reverify before independent merge |
| P1 | #17 — stale-control reconciliation | Separate documentation-only candidate | Cold read agrees with native PR/issue facts; counters/index/changelog agree; no product semantics mixed in |

Both product candidates are PR_OPENED/BUILT, not yet MERGED or publicly deployed.
#12 exposes Bridge as a separate route task, with exact comparisons, per-step evidence,
first-screen keyboard navigation and a bounded repeat-input cache. #20 connects the
validated projection to search/ranking/Bridge/sharing and tests an independent authored
synthetic catalog. Neither establishes licensed real data or measured player quality.

## Independent remaining gates

| Priority | Issue | Completion evidence | Scoped dependency |
| --- | --- | --- | --- |
| P0 | #7 — Pages delivery | Successful reviewed-master deployment, public HTTP response, exact served revision and hosted desktop/mobile share/recovery flow | Authorized admin provisioning; this connection has no admin permission |
| P1 | #8 — rights-cleared real catalog | Source/field receipts, canonical identity and coverage counterexamples, versioned validated sample | Real data and code-license decisions; API availability is not redistribution permission |
| P1 | #14 — browser and accessibility acceptance | Actual Firefox/WebKit and assistive-technology checks, keyboard/focus/error-state evidence | No certification inferred from Chromium screenshots |
| P2 | #15 — Bridge responsiveness | Exact-revision dense/sparse/disconnected 12/50/250 fixtures, median/p95 and main-thread input response; bounded deferred/worker calculation if needed | Heap/cache are partial progress, not a real-device latency guarantee |
| P2 | #16 — archived regression adoption | Focused unique basket/benchmark tests against current contracts, fail-before/pass-after where applicable | Do not import stale controls or duplicate broad oracle campaigns |
| P2 | #10 — usefulness/comparison | Frozen identical-catalog comparisons including negative results and authorized consented player observations | Real catalog and usable preview; external outreach needs separate authorization |

Proposed research/sample counts in the Issues are targets, not completed observations.
Pages remained unprovisioned at reconciliation; no public URL is live-verified.
A source, administration or runtime blocker affects only its dependent work.

## Branch and acceptance discipline

Repair/accept existing PRs before new features. Keep #20's dependency explicit and
retarget promptly after #12 lands. Preserve unique stale research work through focused
adoption rather than opening raw stale PRs. Delete a completed ref only through a
supported action after checking all unique commits and dependents; never force-push
shared history or weaken protection.

On 2026-10-22 interactive GitHub reviews, Issues, commits and PR creation succeeded.
Earlier scheduled safety denials are not proof of a permanent global write outage.
Respect any new explicit denial without unchanged retries or alternate-endpoint bypass.

No accounts, paid inference, telemetry, runtime APIs, backend, vector database,
mandatory map or alternate hosting platform is part of these slices. Keep Intersection,
Blend and Bridge distinct. Full EndlessZen format migration is not this milestone;
no new scheduler, Drive queue, parallel project or per-wake ledger is introduced.
