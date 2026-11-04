# EXECUTION_ORDER — Playmancer

## Native discovery, not a frozen PR queue

This is a stable selection algorithm. Current Issues/PRs, branch heads, reviews,
checks, merge rules and publication facts must be read from GitHub on every
selection. Historical references in other control files never acquire a claim.

1. Reconcile ambiguous partial writes or a demonstrated live regression. Read back
   the actual effect before retrying a mutation; preserve newer work and claims.
2. Inspect ALL open PRs. Repair changed findings, failing applicable checks,
   conflicts or stale bases on the suitable existing branch before new work.
3. Independently accept an eligible earlier PR at its exact current head/base.
   Inspect the full diff/context, Issue criteria, comments/review threads, actual
   jobs and relevant UX/provenance. Missing/skipped/pending is not PASS. Merge
   with expected-head protection where available, then read back master/files.
4. Immediately repair stacked dependencies after a base merge: retarget to master,
   safely synchronize, refresh the exact head and continue the closing loop.
   Never author/materially change and merge the same semantic change in one wake.
5. Finish useful existing branch code into its intended PR. Enumerate branch/PR
   dependencies before creating or deleting refs; preserve unique unmerged work.
6. Select the strongest ready functional or visible player slice from native
   Issues and `docs/ROADMAP.md`. Tests, accessibility and reliability are useful
   deliverables, not an excuse to leave eligible older PRs unmerged.
7. Research only a genuinely blocking decision, ending in an actionable result.
   Do not spend more than two consecutive wakes on process/research while
   executable product work exists. An empty queue is not proof of completion.

## Acceptance and publication

Do not wait for a fictitious reviewer when the actual rules require zero
approvals; do not bypass real approval/check requirements. Authorship/profile
lookup is not authenticated identity proof. Unknown or mismatched login means
read-only/local work until a real capability change.

A successful PR build is not public delivery. Check the publication workflow,
served revision and actual browser journey; inspect desktop/mobile screenshots
when available. Keep COMMITTED, PR_OPENED, MERGED, BUILT, DEPLOYED and
LIVE_VERIFIED distinct. Report NOT_RUN/VISUAL_NOT_VERIFIED gaps explicitly.

## Blockers and scope

A blocker affects dependent work only. Do not retry an unchanged failed mutation
or duplicate its branch. Prefer exact-blob local verification if clone/network
access fails; use ACTUAL_EXECUTION_SAFETY_DENIAL only for an explicit tool safety
denial. Never change browser policy, protections or identity to evade a denial.

Issue #1 remains the product anchor. Format 2, run-separated judgement and the
owner-controlled perpetual schedule are unchanged. EndlessZen is read-only.
No shadow Drive queue, audit ledger, parallel worker or scheduler mutation.
