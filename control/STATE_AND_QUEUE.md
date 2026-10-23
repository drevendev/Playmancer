# STATE_AND_QUEUE — Playmancer

Reconciled: 2026-10-23. These are dated navigation facts, not live PR/check authority.
Read GitHub for current claims, exact heads, CI, reviews, merges and publication.

```text
PROJECT_STATUS:          ACTIVE
CONTROL_FORMAT_VERSION:  2
CURRENT_PHASE:           PRODUCT_DELIVERY
CURRENT_MODE:            OWNER_DIRECTED
STATE_REVISION:          14
LAST_INDEXED_REVISION:   14
CURRENT_UNIT:            PLAY-CONTROL-001
CURRENT_SCOPE:           issue #17 — reconcile Bridge and Preview 0.3 delivery controls
CURRENT_UNIT_STATUS:     REVIEW
WORKING_BRANCH:          docs/reconcile-delivery-controls
LAST_VERIFIED_MASTER:    e065a02bb988e6a6fc31cb36475fdeeca1629f22
WORKER_SCHEDULE_MUTATION: none
```

## Delivered and explicitly not delivered

PRs #2/#3/#4/#5/#11 were merged before this reconciliation; #6 is DONE.
PR #12 (explained Bridge, precision and first-screen accessibility) was independently
accepted and merged as `e6d585084fc1edee412003cae04b96c8d555d0de`,
closing issues #9/#18/#19. Its delivered runtime changes reached master, not Pages.
PR #20 (validated snapshot adapter, safe build and repaired large-basket share
restoration) was independently accepted and merged as
`e065a02bb988e6a6fc31cb36475fdeeca1629f22`, closing #13/#21/#23. A 250-game fixture remains **fictional**;
rights-cleared real-game data have not been published.

Verify run 39931904927 on the exact new master completed SUCCESS. Pages publish
run 39931904881 failed at the Pages-configuration step; publishing was skipped.
Repository metadata still reports `has_pages=false`. This is BUILT and MERGED
source, **not DEPLOYED or LIVE_VERIFIED**.

## Closing-first queue

1. Finish this existing #17 documentation PR #22: its refreshed branch must undergo
   a later independent exact-head review, applicable CI and provider-rule check before
   merge; then verify master and issue #17. Do not self-merge this new revision.
2. For #7 Pages, require authorized administration to enable GitHub Actions Pages.
   Until enabled, prepare/test a static artifact but do not claim an actual live URL.
3. Advance independently executable #14 cross-browser/accessibility or #15 measured
   Bridge responsiveness while Pages administration and #8 real-data rights are gated.
   #16 is selective, nonduplicate adoption of useful archived basket/benchmark tests.
4. Keep #10 usefulness evaluation behind suitable catalog and hosted experience.
   Preserve issue #1 as the broader product/evidence anchor.

## Scope and operating boundaries

Interactive GitHub identity `andy-zen-dev` was verified for this reconciliation;
repository permissions include push/triage/pull and exclude admin/maintain.
Permissions and checks can change; re-read before future mutations. An actual denial
blocks its operation, not independent product work. No alternative endpoints, bypass,
new branches, parallel projects, Drive queue or extra scheduler.

Control format 2 remains unchanged. Ownership/exclusion migration, external receipt
replay, independent liveness and finite operating/maintenance bounds remain unproven;
no full EndlessZen unattended-compliance claim is made. The existing owner-controlled
hourly job remains unchanged.
