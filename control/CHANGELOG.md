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
2026-10-10 | rev 5 | reconciled: PLAY-PREVIEW-001
                     marked merged bootstrap SETUP-REPO-001 as DONE in registry
                     aligned execution order and current claim with live PR #4
                     restored STATE_REVISION/LAST_INDEXED_REVISION for cold-wake delta reads
                     preserved format 2 and the separate Pages/rights gates
2026-10-18 | rev 6 | reconciled: PLAY-RECOVERY-002
                     closed stale PR #4 review and recorded merged benchmark PR #5
                     added issue #6 catalog/evaluation recovery candidate and #7–#10 roadmap
                     kept local candidate acceptance separate from deployed/live evidence
                     retained format 2 and owner-controlled schedule lifecycle
2026-10-22 | rev 13 | reconciled: PLAY-CONTROL-001
                      marked #6/PR #11 DONE and recorded actual master 0c6ed23
                      selected #12 for later exact-head acceptance; recorded stacked #20
                      required immediate dependent retarget/sync after base merge
                      aligned state/index counters and registry/roadmap at revision 13
                      preserved format 2 and separate publication/rights/usefulness gates
                      counter 12 previously exceeded indexed/changelog revision 6;
                      missing revisions 7–12 are not invented or retroactively asserted
                      no runtime code, protected-master write or scheduler mutation
2026-10-23 | rev 14 | reconciled: PLAY-CONTROL-001
                      recorded merged #12 (Bridge) and #20 (catalog/share)
                      marked PLAY-BRIDGE-001 and PLAY-CATALOG-001 DONE
                      verified exact master e065a02bb988
                      kept #17/PR #22 in REVIEW for later separate acceptance
                      recorded successful master CI and blocked Pages provisioning
                      updated navigation, registry and roadmap without runtime changes
                      preserved format 2 and owner-controlled scheduler lifecycle
