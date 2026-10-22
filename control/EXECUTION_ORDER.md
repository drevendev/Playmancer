# EXECUTION_ORDER — Playmancer

## Closing-first gate — reconciled 2026-10-22

1. Read native open/recent PRs, issues and master first. PRs #2/#3/#4/#5/#11 are
   complete; #6 is DONE. A stale file must not recreate their finished claims.
2. PR #12 is the first acceptance target: inspect exact head/base, full diff,
   findings/discussions, complete Node/catalog/benchmark/build/preflight checks,
   Chromium evidence and actual provider rules. Repair the existing branch when
   necessary. Never merge semantic work in the turn that produced or changed it.
3. After #12 merges, verify master and intended files. Immediately retarget dependent
   PR #20 from `feat/p08-bridge-routing-v0` to master, synchronize safely without
   force-pushing shared history, refresh head/checks and continue independent acceptance.
   Do not strand the dependent PR on a merged/deleted branch.
4. Review the focused #17 documentation reconciliation using fresh native facts;
   it changes navigation, not player semantics. Do not use it to bypass product checks.
5. Complete #7 only after authorized Pages provisioning. Verify actual master
   deployment, HTTP response, served revision and hosted desktop/mobile player flow.
   A green build or an offline screenshot is not a published URL.
6. If a scoped external gate is unchanged, choose the strongest independent ready
   product transaction from `docs/ROADMAP.md`. Do not repeatedly audit rights,
   permissions or graph oracles while repair/acceptance work exists.
7. Preserve useful stale branches through focused adoption; delete completed refs
   only through supported actions after proving unique work and dependencies are safe.

Current green checks are evidence for their exact heads, never future PASS results.
No invented reviewer or formal self-approval is needed when actual rules require zero
approvals; real requirements still apply. A new safety denial stops only the affected
operation, without unchanged retries or endpoint/account/protection bypass.

## Operating-model boundary

Issue #1 remains the product/evidence epic. Control format remains 2; full ownership,
external receipt replay, independent liveness and finite total bounds are unclaimed.
Use the pinned EndlessZen reference read-only. No new project, Drive queue, wake ledger,
parallel worker or scheduler change is authorized by this reconciliation.
