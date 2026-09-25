# REPOSITORY_CONTRACT — drevendev/Playmancer

Verified: 2026-09-24

```text
REPOSITORY:         drevendev/Playmancer
DEFAULT_BRANCH:     master
VISIBILITY:         public
PUBLICATION_INTENT: public
MY_ROLE:            collaborator
PROJECT_STATE_ROLE: canonical
CANONICAL_PATHS:    control/PROJECT_MANIFEST.md; control/STATE_AND_QUEUE.md;
                    control/CHANGELOG.md; control/UNIT_REGISTRY.csv;
                    control/INDEX.md; control/EXECUTION_ORDER.md
LAST_VERIFIED:      2026-09-24
```

The authenticated provider identity is `andy-zen-dev`. The repository reports
`pull=true`, `push=true`, `triage=true`, `admin=false`, and
`maintain=false`. Owner delegation is broader in project intent but does not invent
provider capabilities.

## What I may actually do

```text
CAN_READ:            yes
CAN_COMMENT:         yes
CAN_CREATE_ISSUES:   yes
CAN_CREATE_BRANCHES: yes
CAN_OPEN_PRS:        yes
CAN_MERGE:           yes, only after a later exact-head verification and when GitHub permits
CAN_COMMIT_DIRECTLY: yes, only for initial empty-repository base and the narrow
                     post-transition reconciliation declared below
```

## Mutation path

```text
MUTATION_POLICY:           issue -> branch -> pull request -> later exact-head review -> merge
REVIEW_MODEL:              owner-delegated Playmancer worker produces; a later stateless
                           wake judges the exact PR head and may merge when acceptance,
                           current checks, comments, repository rules, and permissions allow
REVIEW_INDEPENDENCE:       run=required; context=required; actor=not-required;
                           enforcement=not-required
DEFAULT_BRANCH_PROTECTION: unknown — protection endpoint was not accessible to the integration
REQUIRED_CHECKS:           unknown until workflows/rules exist and are observable
REQUIRED_REVIEWS:          none declared by owner direction; provider enforcement unknown
ACCEPTANCE_ENFORCEMENT:    unknown
WHO_DECIDES:               owner-delegated Playmancer worker in a later review wake
GATE_BEARING_ACTIONS:      merge/check/review effects to be re-read on the exact candidate
GATE_BEARING_IDENTITIES:   unknown until a candidate exposes them
EVIDENCE_ONLY_CHANNEL:     none
```

A repository-rulesets read on 2026-09-24 returned an empty set. That does not prove the
separately inaccessible branch-protection surface is absent.

## Repository selection projection

```text
SELECTION_PROJECTION:      none
ELIGIBLE_SIGNAL:           none
INELIGIBLE_SIGNAL:         none
PROJECTION_OWNER:          none
PROJECTION_RECONCILIATION: none
```

GitHub labels or boards are not currently consumed as canonical selection signals.

## Post-transition control reconciliation

```text
POST_TRANSITION_RECONCILIATION: direct-control-commit
RECONCILIATION_SCOPE:           control/STATE_AND_QUEUE.md, control/CHANGELOG.md,
                                control/EXECUTION_ORDER.md; only fields/facts made
                                knowable by an already-completed repository transition
TRANSITION_BINDING:             exact observed transition + exact current master head
RECONCILIATION_AUTHORITY:       owner-delegated project authority plus the explicit rule
                                against recursive bookkeeping PRs; semantic changes excluded
```

The reconciliation commit must be built from the exact current default-branch head and
published by non-forced fast-forward. Drift aborts the write. It may record merge SHA,
unit completion, issue closure, or an already-declared next pointer; it may not change
requirements, acceptance, goals, or queue priority.

## Communication

```text
LANGUAGE:    English
ISSUE_STYLE: concise problem/decision statement with evidence, scope, acceptance, and
             non-goals when relevant
TEMPLATES:   none present on master as of 2026-09-24
LABELS:      no verified project taxonomy yet; do not guess or invent labels
```

## Local instructions read

| File | Present | What it constrains |
| --- | --- | --- |
| `README.md` | yes | Product identity and issue #1 bootstrap reference |
| `AGENTS.md` | candidate in this bootstrap PR | Repository-local worker rules after merge |
| `CONTRIBUTING` | no | — |
| `SECURITY` | no | — |
| issue / pull request templates | no | — |
| lint, format, test configuration | no | — |

## Publication boundary

```text
SAFE_TO_CARRY_FROM_DRIVE:          none; no Drive project exists
SAFE_TO_CARRY_FROM_OTHER_SURFACES: public owner direction, issue #1, public research
                                   receipts, and source evidence safe for this public repo
NEVER_IN_THIS_REPOSITORY:          credentials, private inputs, internal reports,
                                   personal data, unrelated project context
```

## Publication

```text
PUBLICATION:         both
IF_BOTH:             repository files are canonical for controls/spec/code/data;
                     issues are durable public carriers for backlog/research decisions
UNIT_REFERENCE:      permanent UNIT_ID in title or body once allocated; issue #1 remains
                     a bootstrap proposal/evidence anchor rather than a registry unit
PUBLISHED_LANGUAGE:  English
ISSUE_START_RULE:    unknown
```

## Return channel

```text
RETURN_CHANNEL:  issues
FEEDBACK_LABEL:  none verified
QUESTION_LABEL:  none verified
COVERAGE_RECORD: repository-native PR/check/merge evidence referenced from
                 control/STATE_AND_QUEUE.md when current work needs it
```

## Notes

The project began from an empty repository. Commit
`d08e705278c5bf81a6ce1ef8fb83b90e69cb5a4d` established the minimum `master` base so
the normal branch/PR path could exist. That exception does not establish a direct-commit
convention for semantic work.
