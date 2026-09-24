# EXECUTION_ORDER — Playmancer

## Current gate

1. `SETUP-REPO-001` — **REVIEW candidate** once its draft PR is open.
2. Merge only after a later stateless wake verifies the exact PR head, the control files
   agree, and no new blocking review/check evidence exists.
3. After merge, reconcile the completed transition through the narrow mechanism in
   `REPOSITORY_CONTRACT.md`.

## Ordinary work eligibility

Issue #1 provides the initial P01–P08 research queue, but those labels are not yet
permanent unit-registry IDs. Do not allocate downstream identifiers or treat ordinary
work as format-4 unattended selection until:

- repository-canonical bootstrap is merged;
- ownership collision/transfer evidence is verified for the scheduled execution path;
- an external selection controller and persisted receipt replay are configured;
- finite operating/maintenance bounds are established; and
- an independent liveness observer is configured.

Owner-directed recovery/setup work remains eligible while these gates are explicit.
This file describes eligibility; it does not change the product meaning in issue #1.
