# CHANGELOG — Playmancer

Append-only semantic/navigation history for repository-canonical project controls.

2026-09-24 | rev 1 | added: SETUP-REPO-001
                     established repository-canonical manifest/state/contract/navigation
                     adopted issue #1 as bootstrap/product evidence, not equal mutable state
                     recorded unresolved ownership, selection-controller, finite-bound,
                     and independent-liveness setup gates
2026-09-25 | rev 2 | corrected: SETUP-REPO-001
                     retained control format 2 because format-3 ownership evidence is partial
                     kept format-4 controller/receipt replay as explicit future migration gates
2026-10-01 | rev 3 | reconciled: SETUP-REPO-001
                     verified active ruleset Protect master (#24273337)
                     recorded PR-only default-branch mutation, no current-user bypass,
                     deletion/non-fast-forward protection, and no enforced status checks
                     replaced direct post-transition master commit with protected PR reconciliation
2026-10-01 | rev 4 | corrected: SETUP-REPO-001
                     aligned AGENTS and PROJECT_MANIFEST with active protected-master rules
                     removed stale direct-commit exceptions; post-transition reconciliation
                     now consistently uses a bounded follow-up pull request
