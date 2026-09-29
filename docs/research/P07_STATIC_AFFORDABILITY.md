# P07 — Static affordability and publication envelope v0

Reviewed: 2026-09-29

Status: **implementation-ready static architecture hypothesis; production catalog budget still unmeasured.**

This note answers one bounded question from issue #1: can Playmancer stay static and inexpensive while preserving reproducibility, safe refreshes, and a useful browser-side recommendation experience?

## Decision

Yes for the first useful release, **provided the published catalog is deliberately bounded and measured before expansion**.

Use:

```text
scheduled/manual GitHub Actions
  -> fetch authorized source data with secrets only in CI
  -> validate + canonicalize
  -> derive publishable metadata/features/search/layout
  -> benchmark artifact sizes and browser-facing budgets
  -> stage immutable snapshot
  -> validate staged snapshot
  -> atomically advance a small "latest" manifest
  -> publish static site to GitHub Pages

browser
  -> load app shell
  -> load compact search/index metadata
  -> load candidate chunks on demand
  -> rank/filter/explain locally
```

No runtime backend, database, vector service, or paid inference is required by this architecture.

## Current platform constraints

Primary sources checked 2026-09-29:

- GitHub Pages limits: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- GitHub Actions scheduled events: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
- GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- GitHub-hosted runner reference: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- Workflow artifact retention: https://docs.github.com/en/actions/how-tos/manage-workflow-runs/remove-workflow-artifacts

Observed constraints relevant to Playmancer:

1. A published Pages site may not exceed **1 GB**; the source repository has a recommended **1 GB** limit.
2. Pages has a soft bandwidth limit of **100 GB/month**.
3. A Pages deployment times out after **10 minutes**.
4. The default Pages build path has a soft **10 builds/hour** limit; a custom Actions publication workflow is not subject to that Pages build-rate limit.
5. Scheduled Actions may be delayed under load, especially near the start of an hour, and sufficiently loaded queued jobs may be dropped.
6. A scheduled workflow runs from the default branch and only if the workflow exists there.
7. Public-repository scheduled workflows are automatically disabled after **60 days of repository inactivity**.
8. Standard GitHub-hosted runners are free for public repositories; larger runners are not.
9. Build logs/artifacts default to **90-day retention**, configurable by repository/workflow settings.

These are hosting constraints, not product-quality evidence.

## Synthetic size measurement

No authorized production catalog sample is currently available, so this wake did **not** claim production coverage or production compression ratios.

To make the architecture testable now, a deterministic synthetic fixture was measured with four independently serializable layers:

- catalog metadata: canonical ID, name, year, platforms, genres, themes, modes, evidence coverage;
- sparse feature IDs used by ranking;
- 2-D layout coordinates used only for visualization;
- compact search records: canonical ID, display name, optional alias.

JSON used compact separators and the files were measured both raw and gzip-compressed. Synthetic names and sparse feature sets were deliberately varied rather than repeated constants.

| Synthetic titles | Raw total | gzip total | Catalog gzip | Features gzip | Layout gzip | Search gzip |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1,000 | 0.42 MiB | 0.09 MiB | 0.03 MiB | 0.04 MiB | 0.01 MiB | 0.01 MiB |
| 10,000 | 4.17 MiB | 0.89 MiB | 0.25 MiB | 0.39 MiB | 0.11 MiB | 0.14 MiB |
| 50,000 | 20.86 MiB | 4.46 MiB | 1.27 MiB | 1.93 MiB | 0.56 MiB | 0.71 MiB |

Exact measured byte totals for 50,000 synthetic titles:

```text
catalog   raw 9,992,934   gzip 1,330,883
features  raw 6,114,180   gzip 2,018,399
layout    raw 2,228,008   gzip   582,487
search    raw 3,539,427   gzip   746,971
total     raw 21,874,549  gzip 4,678,740
```

### Interpretation boundary

These numbers demonstrate that the *shape* of a compact static catalog can fit comfortably inside Pages limits. They do **not** predict real IGDB-derived sizes: production names, descriptions, identifiers, provenance, feature vectors, images, and sparsity may compress differently. Re-run the exact measurement on the first authorized sample before increasing catalog scope.

Artwork binaries are intentionally excluded. Image hosting/publication rights remain a P01 gate and images should not be allowed to dominate the core recommender payload.

## Initial release budgets

Treat these as engineering guardrails to measure, not evidence already passed:

| Surface | Initial budget | Reason |
| --- | ---: | --- |
| App shell JS + CSS, gzip | <= 500 KiB | fast first interaction before catalog exploration |
| Search/bootstrap payload, gzip | <= 2 MiB | usable title lookup without loading full derived catalog |
| One lazy catalog/feature chunk, gzip | <= 1 MiB | bounded incremental browser memory/network work |
| Initial route transfer excluding images | <= 3 MiB | keeps first basket interaction well below Pages bandwidth envelope |
| Complete derived publishable dataset, gzip | <= 50 MiB for v1 | leaves wide margin below 1 GB and discourages careless catalog inflation |
| Pages deployment | <= 5 min target | margin under the documented 10 min timeout |
| Refresh workflow | <= 15 min target on standard runner | cheap enough for routine public-repo CI; investigate regressions rather than normalizing long refreshes |

If real measurements exceed a budget, first reduce fields, normalize/encode features, split lazy chunks, and eliminate duplicated text. Do not jump directly to a backend.

## Snapshot and provenance contract

Every published snapshot should have an immutable ID derived from normalized publishable content, for example:

```text
snapshot_id = yyyy-mm-dd + "-" + sha256(normalized-publishable-manifest)[0:12]
```

Minimum manifest:

```json
{
  "snapshot_id": "...",
  "schema_version": 1,
  "method_version": "...",
  "generated_at": "...",
  "source_receipts": ["..."],
  "record_count": 0,
  "files": {
    "search": {"path": "...", "sha256": "...", "bytes": 0},
    "catalog": {"path": "...", "sha256": "...", "bytes": 0},
    "features": {"path": "...", "sha256": "...", "bytes": 0},
    "layout": {"path": "...", "sha256": "...", "bytes": 0}
  }
}
```

Browser ranking must expose the snapshot ID and method version in explanations/share state so a result can be reproduced later.

## Refresh safety

A refresh is a transaction, not an in-place overwrite.

1. Fetch source data into ephemeral CI workspace.
2. Validate source receipt and expected pagination/completeness.
3. Canonicalize identities.
4. Derive only fields currently cleared for publication.
5. Validate schema, referential integrity, candidate counts, missingness, duplicate IDs, deterministic ordering, and artifact hashes.
6. Measure size budgets and fail if hard publication budgets are exceeded unexpectedly.
7. Build a **new immutable snapshot directory**.
8. Run ranking invariants and static-site checks against that staged snapshot.
9. Publish snapshot assets.
10. Advance `latest.json` only after all prior steps pass.

If any step fails, the previous `latest.json` remains unchanged. The public site must continue using the previous known-good snapshot and surface its snapshot date rather than publishing a partial refresh.

## Secret and rights boundary

- Source credentials exist only in GitHub Actions secrets/environment and are never emitted to browser assets, repository files, logs, generated manifests, or Pages output.
- Raw restricted source responses are ephemeral unless P01 explicitly establishes redistribution/storage rights.
- Do not upload raw restricted source responses as Actions artifacts merely for convenience.
- Only derived fields with recorded publication rights may enter the public snapshot.
- Synthetic and independently licensed fixtures remain valid for tests and UI development while P01 is unresolved.

## Retention

Repository/Pages:

- keep the active snapshot plus at least one previous known-good snapshot while small enough to stay well inside the v1 dataset budget;
- older publishable snapshots may move to releases or be pruned once reproducibility requirements are defined;
- never retain raw restricted-source snapshots in public history.

Actions artifacts:

- do not rely on artifacts as canonical project state;
- use short retention only for safe debugging outputs when useful;
- canonical manifests/checksums belong in repository-visible project state or the published immutable snapshot.

## Schedule behavior

A future refresh workflow should support both `workflow_dispatch` and a scheduled trigger. Avoid scheduling exactly at the start of an hour because GitHub documents higher scheduling load then.

Scheduled execution is best-effort, not a liveness guarantee: it can be delayed/dropped and can be disabled after 60 days of public-repository inactivity. Therefore the site must remain valid when no refresh runs, and snapshot age must be observable.

## Browser-loading strategy

Do not load the entire future catalog eagerly.

1. Load app shell.
2. Load compact search/bootstrap index.
3. Resolve the 2–5 seed IDs.
4. Load only the candidate/feature chunks needed for the selected mode/filter.
5. Rank locally.
6. Load map/layout and image assets lazily after readable list results are available.

The readable list is the primary fallback if visualization assets fail.

## Acceptance tests for the implementation slice

P07 can be considered implemented only when a real build records:

- raw and compressed bytes per published layer;
- first-route transfer size;
- build/deploy duration;
- snapshot checksums and record count;
- failed refresh proving `latest.json` remains on the prior snapshot;
- no credential or restricted raw payload in built assets/log fixtures;
- deterministic rebuild from the same normalized input;
- browser smoke test for a stale-but-valid snapshot;
- documented behavior when scheduled refresh has not run.

## What remains unknown

- production catalog field coverage and rights;
- production compression ratios;
- image publication/hosting strategy;
- realistic browser memory and ranking latency on low-end mobile hardware;
- whether 50 MiB is excessive or conservative for an actually useful catalog;
- refresh frequency justified by player value;
- future commercial-hosting suitability if Playmancer becomes a commercial service.

## Next executable unit

After the repository-canonical bootstrap is merged, implement a tiny synthetic snapshot builder + validator that emits the manifest above and deliberately exercises the invalid-refresh rollback path. Do not add a backend.
