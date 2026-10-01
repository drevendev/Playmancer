# Playmancer control index

This directory is the repository-canonical control/navigation surface.

| Path | Purpose |
| --- | --- |
| `PROJECT_MANIFEST.md` | Stable project goal, authority, constraints, completion gates |
| `STATE_AND_QUEUE.md` | Current operational/recovery state |
| `REPOSITORY_CONTRACT.md` | GitHub mutation, review, publication, and preflight contract |
| `UNIT_REGISTRY.csv` | Permanent addressable units and maturity |
| `EXECUTION_ORDER.md` | Current eligibility and blocking order |
| `CHANGELOG.md` | Append-only semantic/navigation changes |

## Bootstrap transaction

`SETUP-REPO-001` establishes this repository-canonical control plane. Issue #1 and its
research receipts are source evidence; they do not become equal mutable control state.

The P01–P08 labels in issue #1 remain bootstrap research-question labels. Permanent
implementation/research unit identifiers are allocated later under the registry's
collision-safe rule instead of silently reusing or renumbering those labels.
