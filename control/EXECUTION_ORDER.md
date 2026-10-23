# EXECUTION_ORDER — Playmancer

## Closing-first gate — reconciled 2026-10-23

1. Read current native PRs/issues, reviews, rules, exact heads and master before any
   action. PRs #2/#3/#4/#5/#11/#12/#20 are merged; issues #6/#9/#13/#18/#19/#21/#23
   are closed. Historical review claims must not resurrect them.
2. The only open PR at reconciliation is #22, a focused #17 control update on
   `docs/reconcile-delivery-controls`. Its refreshed code/doc head is newly authored
   in this transaction: wait for new exact-head CI and a **later independent** review
   before an expected-head merge. Never merge this same semantic change now.
3. After #22 is merged, verify the master SHA and updated control files and confirm
   issue #17 closed. Do not create another reconciliation PR or stale queue.
4. Issue #7 GitHub Pages remains unprovisioned: the reviewed `master` verify
   workflow succeeds, but publishing fails on Pages configuration. Actual enabling
   requires administrator capability; offline artifact/build success is NOT live.
5. While #7 or real-data rights #8 are externally gated, take the strongest
   independent functional weakness: #14 cross-browser/assistive-tech acceptance,
   #15 Bridge responsiveness, or #16 focused regression adoption. Evaluate #10
   only when its catalog/hosted-player prerequisites exist. See `docs/ROADMAP.md`.
6. Preserve existing shared branches until all unique work and dependencies are
   proved safe; never force-push shared history or bypass protected master.

No stale #12 → #20 retarget is necessary: both merged and #20 synchronized before
its merge. Native GitHub facts supersede these dated examples. Current CI is never
a PASS for a future head. No fabricated reviewer or self-approval is required when
real rules need zero approvals; all actual checks and rules remain mandatory.

## Operating-model boundary

Issue #1 remains the product/evidence epic. Control format remains 2; complete
ownership/exclusion controls, external receipt replay, independent liveness and
finite total bounds are not claimed. EndlessZen is read-only. No Drive queue, wake
ledger, parallel worker, new automation or scheduler mutation is authorized.
