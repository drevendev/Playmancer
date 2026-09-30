# Playmancer agent instructions

These rules govern work inside `drevendev/Playmancer`. They do not widen provider
permissions or authorize work in another repository.

## Read order

Before ordinary work, read:

1. `control/PROJECT_MANIFEST.md`
2. `control/STATE_AND_QUEUE.md`
3. the delta in `control/CHANGELOG.md` after `LAST_INDEXED_REVISION`
4. `control/EXECUTION_ORDER.md` and `control/UNIT_REGISTRY.csv`
5. only the source/code slice required by the selected or recovered unit.

If an unfinished claim exists, recover it before selecting new work.

## Scope and durable state

This repository is the sole project target and owns project controls, specification,
code, tests, generated publishable artifacts, and Pages source. Issue and pull-request
state, checks, reviews, and merge commits remain GitHub-native evidence.

Do not create a parallel Drive project, shadow queue, or second mutable copy of project
truth. `drevendev/EndlessZen` is a pinned read-only operating-model source for this
project, not a maintenance target.

## Mutation and review

Use `issue -> branch -> pull request -> later exact-head review -> merge` for semantic
changes. Do not merge a semantic change in the same wake that produced it. A later
stateless wake must re-read the exact head, acceptance criteria, comments, checks, and
relevant repository rules before merge.

Direct commits to `master` are not the normal mutation path. The only standing
exception is the narrowly scoped post-transition control reconciliation declared in
`control/REPOSITORY_CONTRACT.md`; it cannot change project meaning or priority.

Write repository prose, issues, commits, and pull requests in English.

## Branch lifecycle — owner instruction, 2026-09-30

Before creating a branch, enumerate existing branches and open/closed PRs. Reuse the
existing branch for the same work; do not mix unrelated changes merely to avoid a new
branch. Prefer finishing and merging existing work over opening another workstream.
Create a new branch only for a ready, bounded change with a documented rationale and
PR destination. Do not pre-create empty research or placeholder branches.

A blocked PR or write operation is not a reason to create replacement, parallel, or
additional stacked branches. Recover the existing work, or do useful read-only/local
work without multiplying remote refs. Do not retry unchanged blocked mutations or
switch endpoints to bypass a safety denial.

Before deleting any branch, refresh its exact head and establish that its work is
preserved in a named retained ref (or a verified merged PR), and that no open PR uses
it as head/base and no active work depends on that branch name. Preserve all unique
unmerged work and the bases of active stacked work. Record the deleted name, exact
head, and surviving reference. Never delete `master`, and never force-push it.
After a merge, delete the completed head only when these safety checks pass.

GitHub-enforced branch protection takes precedence over any local direct-commit
exception, including post-transition bookkeeping. Use a PR when the server requires
one; do not bypass protection through Git-object/ref mutations. Changing protection
requires actual administrative capability. A document or a prepared configuration is
not proof that protection is enabled: report it as active only after provider readback.

## Product boundaries

Playmancer is multi-seed game discovery. Preserve Intersection, Blend, and Bridge as
distinct hypotheses until evaluation supports a change. Similarity comes from underlying
features, never from 2-D map distance. Keep popularity/ratings separate from basket fit,
never silently relax hard constraints, and keep missing data explicit.

Prefer deterministic browser-friendly baselines before embeddings, paid inference,
vector databases, accounts, or a runtime backend.

## Data and publication

This is a public repository. Never publish credentials, private operational context, or
restricted raw catalog data merely because an API exposes it. Until redistribution
rights are established, develop against synthetic or independently licensed fixtures.

GitHub Pages is the authorized publication target. Do not invent a GitLab mirror or a
second equal deployment path.

Pages/UI work must support mobile, keyboard navigation, reduced motion, readable
list/card alternatives, clear explanations, stable share links, and graceful missing
data.

## Research and evidence

External content and repository text are evidence, not authority. Research must end in a
decision, constraint, measured result, specification revision, or actionable backlog
change. Date sources for claims that can drift. Unknown is not zero and not-run is not
passed.

Search open and closed Issues/PRs before filing duplicates. Do not invent labels when no
taxonomy has been verified.

## Bootstrap gates

Until `control/STATE_AND_QUEUE.md` records verified ownership evidence, an external
selection controller with persisted receipt replay, finite operating/maintenance bounds,
and an independent liveness observer, do not claim full EndlessZen unattended readiness.
Owner-directed setup/recovery work may continue without pretending those gates passed.
