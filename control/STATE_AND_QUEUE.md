# STATE_AND_QUEUE — Playmancer

Reconciled: 2026-10-22. These are dated navigation facts, not live PR/check authority.
Re-read GitHub before claims, repairs, acceptance, merge or publication.

```text
PROJECT_STATUS:          ACTIVE
CONTROL_FORMAT_VERSION:  2
CURRENT_PHASE:           PRODUCT_DELIVERY
CURRENT_MODE:            OWNER_DIRECTED
STATE_REVISION:          13
LAST_INDEXED_REVISION:   13
CURRENT_UNIT:            PLAY-BRIDGE-001
CURRENT_SCOPE:           issues #9/#18/#19 — explained Bridge and release repairs
CURRENT_UNIT_STATUS:     REVIEW
WORKING_BRANCH:          feat/p08-bridge-routing-v0
LAST_VERIFIED_MASTER:    0c6ed23faabb3bad7b3adb86ae9a0d5013bd25c8
WORKER_SCHEDULE_MUTATION: none
```

## Delivered versus awaiting acceptance

PRs #2, #3, #4 and #5 are merged. Preview 0.2 PR #11 merged on 2026-10-18 as
`0c6ed23faabb3bad7b3adb86ae9a0d5013bd25c8`, closing #6. PLAY-RECOVERY-002 is DONE.
Do not resurrect their finished review claims or the obsolete preview-02 branch.

At this reconciliation, PR #12 is OPEN/READY at
`3c5ff7f35985b34241381717f2cff75fcd317ea8`; Verify run 39732338511 is successful.
It contains explained Bridge, precision/ID repairs, first-screen discovery and a
bounded route cache. It is PR_OPENED/BUILT, not MERGED, DEPLOYED or LIVE_VERIFIED.

PR #20 is OPEN/READY at `5679f65d7e2d0b1da86bebbd7b1b885a5e7385ee`; Verify run
39734899397 is successful. Its validated snapshot adapter/build gate addresses
#13/#21. It is stacked on #12's branch, not yet based on master or merged.

## Closing-first queue

1. Reconcile partial effects or changed regressions first. Independently accept the
   current exact head of #12 in a later run, or repair that branch if findings remain.
2. Immediately after merging #12, retarget #20 to master, synchronize its base safely,
   refresh the exact head and applicable checks, then independently accept it. Do not
   delete the base branch while a dependent PR still uses it.
3. Accept this separate #17 control reconciliation against fresh native facts; if
   product PRs moved meanwhile, refresh only the dated navigation snapshot.
4. Follow the independent gates in `docs/ROADMAP.md`. Pages #7, rights #8, human
   evaluation #10, cross-browser #14 and responsiveness #15 are not completed by CI.
   #16 is focused adoption of useful archived regressions, not an oracle-count race.

New semantic production and acceptance/merge remain separate turns. Actual provider
checks/approvals are mandatory; do not invent a second developer when zero approvals
are required. Epic #1 remains open. Do not add a Drive queue or per-wake ledger.

## Capabilities and bounded blockers

Interactive 2026-10-22: authenticated `andy-zen-dev`, push/triage/pull true,
admin/maintain false. Reviews, Issues, commits and PR creation succeeded. Earlier
scheduled safety denials are historical, not a permanent global write blocker.
A new explicit denial blocks its affected operation without endpoint/protection bypass.

Hosted CI runs full source acceptance even when local clone DNS fails. Exact-blob
reconstruction remains a local alternative; do not repeat unchanged clone failures.
Pages is unprovisioned (`has_pages=false`); #7 reopens deployment work when authorized
administration configures GitHub Actions Pages. No public URL is live-verified.

Format 2 remains unchanged. Ownership/exclusion migration, external selection receipt
replay, independent liveness observation and finite total maintenance bounds remain
unproven. No full EndlessZen unattended-conformance claim is made. The existing hourly
schedule, title and cadence remain owner-controlled and unchanged.
