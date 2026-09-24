# PROJECT_MANIFEST — Playmancer

Created: 2026-09-24
Profile: engineering + research
Status: ACTIVE
CONTROL_FORMAT_VERSION: 4
MODEL_REVISION: unknown

> This project is seeded from the exact operating-model source
> `drevendev/EndlessZen@89adb273df5300626688866236b82f55949c2e10`.
> The corresponding EndlessZen semantic model revision has not been proven, so it is
> not guessed here.

## Outcome

Players can combine two to five favorite games and use an explainable, controllable
multi-seed discovery experience to find games worth investigating. Intersection, Blend,
and Bridge remain distinct product hypotheses unless evaluation justifies changing
their semantics.

## Deliverable

A public `drevendev/Playmancer` repository containing the research record,
deterministic recommendation implementation, tests, documentation, reproducible static
data pipeline, and an accessible interactive GitHub Pages experience.

## Consumer

Players use the published site. Maintainers and later stateless development wakes must
be able to reconstruct current project truth from this repository without chat memory.

## Operating mode and canonical state

```text
MODE:              B (repository-backed)
REPOSITORY:        drevendev/Playmancer — sole project target
CANONICAL_STATE:   repository-canonical
CONTROL_LOCATIONS: control/PROJECT_MANIFEST.md; control/STATE_AND_QUEUE.md;
                   control/CHANGELOG.md; control/UNIT_REGISTRY.csv;
                   control/INDEX.md; control/EXECUTION_ORDER.md
PUBLICATION:       both
RETURN_CHANNEL:    issues
AUTHORITY:         repository files own project controls/spec/code/data;
                   GitHub owns repository-native issue/PR/check/merge facts
```

Issue #1 is the bootstrap/product evidence anchor. Its P01–P08 labels are proposal
research-question identifiers, not permanent unit-registry identifiers until a later
controlled allocation records them.

## Canonical write ownership

```text
OWNERSHIP_CONTROL: GitHub same-path blob-SHA preconditions for file replacement and
                   non-forced fast-forward ref advancement for constructed commits;
                   protected scope is all canonical repository paths. Collision and
                   transfer behavior for the scheduled surface is not yet fully
                   exercised, so unattended multi-file canonical mutation remains a
                   setup gate until evidence is recorded in STATE_AND_QUEUE.
```

## Mode selection

```text
SELECTION_POLICY:     unconfigured — ordinary unattended selection blocked
FIXED_SHARE_POLICY:   —
SELECTION_CONTROLLER: unconfigured — owner-directed setup recovery only
```

The current bootstrap/recovery work is explicitly prioritized by owner direction.
No worker-selected ordinary mode is treated as a valid format-4 selection receipt until
an external controller and persisted receipt path are configured and verified.

## Liveness

```text
CADENCE:                  hourly expected wake
OBSERVER:                 unconfigured
TOLERATED_SILENCE:        unconfigured
SCHEDULE_LIFECYCLE_OWNER: owner/operator outside project state
WORKER_SCHEDULE_MUTATION: none
```

Project blockers, completion, empty work, or missing capabilities do not authorize this
worker to mutate the recurring schedule.

## Consumer runway

```text
CONSUMPTION_RATE: unmeasured
REFILL_TIME:      unmeasured
RUNWAY_TARGET:    unmeasurable
MEASURED_BY:      unmeasurable until a released backlog/consumer loop exists
```

## Constraints

- The authorized project target is GitHub; do not invent a GitLab mirror.
- Prefer a static, browser-side product and GitHub Pages before runtime backend
  infrastructure.
- Do not publish credentials, private operational material, or data whose redistribution
  rights are not established.
- Use synthetic or independently licensed fixtures while catalog publication rights are
  uncertain.
- Hard constraints are never silently relaxed; missing required data is unknown.
- Similarity comes from underlying features, not 2-D projection distance.
- Popularity and ratings remain separate from basket-fit semantics.
- Ordinary semantic changes use issue -> branch -> pull request -> later exact-head
  verification -> merge.

## Execution and support bounds

```text
EXECUTION_SURFACE:   scheduled/ordinary ChatGPT project chat with connected GitHub
OPERATING_BOUND:     one bounded semantic unit per wake; total project bound unresolved
MAINTENANCE_BOUND:   unresolved
BOUND_OWNER:         project owner
DOWNSTREAM_SUPPORT:  bounded by the same unresolved project operating bound
SUPPORT_SCOPE:       Playmancer research, implementation, review, publication
SUPPORT_END:         unresolved
STOP_ACTION:         none; schedule lifecycle remains owner/operator authority
```

A finite total operating/maintenance bound has not been supplied. EndlessZen unattended
readiness therefore remains incomplete; this document records the gap instead of
inventing a limit.

## Required sources

- `drevendev/Playmancer` issue #1 and its durable research receipts.
- `drevendev/EndlessZen@89adb273df5300626688866236b82f55949c2e10`.
- Dated primary/public sources required by each bounded research decision.

## Mandatory parts

- catalog/source-rights and provenance contract;
- canonical game identity and relation model;
- transparent basket ranking with separately evaluated Intersection, Blend, and Bridge;
- reproducible evaluation against simple baselines;
- basket -> local map/list -> explanation -> share interaction;
- accessible mobile/keyboard/reduced-motion behavior;
- static publication pipeline and GitHub Pages site;
- tests for determinism, sparse data, constraints, identity edge cases, and invalid
  refresh recovery;
- concise maintainer/user documentation.

## Quality rules

- Unknown is not zero; not-run is not passed.
- Preserve per-seed affinities, evidence coverage, hard constraints, method version,
  and catalog snapshot provenance for explanations.
- Benchmark methods on the same candidate catalog and filters and record negative
  results.
- Prefer simple deterministic baselines before embeddings, paid inference, vector
  databases, accounts, or a backend.
- Every semantic implementation change receives a later run-separated exact-head
  review before merge.
- Public UI work must have a readable non-map representation and graceful missing-data
  behavior.

## Simplification principles

Start with the smallest static architecture that can test recommendation usefulness.
Pay complexity only when measured evidence shows a simpler baseline is insufficient.
Avoid platform work that does not improve the player task or the reproducibility of its
evaluation.

## Prohibitions

- No hidden ranking advantage for owner-associated games.
- No fabricated catalog coverage, quality metric, user-study result, license, check, or
  permission.
- No raw restricted-source snapshot in public repository or Pages output without
  established redistribution rights.
- No ranking from 2-D map distance.
- No automatic relaxation of hard constraints.
- No drift into maintaining EndlessZen or other portfolio repositories.
- No direct default-branch semantic commits except a separately declared,
  transition-bound post-transition control reconciliation.

## Area vocabulary

`setup`, `data`, `identity`, `ranking`, `evaluation`, `ux`, `infra`,
`docs`.

Adding an area is a manifest amendment.

## Completion gates

- [ ] A publishable catalog/source strategy is evidenced with field-level provenance.
- [ ] Canonical identity behavior is sample-validated against required edge cases.
- [ ] Intersection/Blend/Bridge behavior is benchmarked against declared baselines.
- [ ] Evaluation records where the proposed methods lose, not only wins.
- [ ] Players can build/share a basket and understand supporting evidence and mismatch.
- [ ] The UI passes the declared mobile, keyboard, reduced-motion, and list/card gates.
- [ ] GitHub Pages publishes without exposing secrets or unlicensed restricted data.
- [ ] Tests cover deterministic ties, duplicate/one-seed/conflicting baskets, sparse
      candidates, hard-constraint empties, missing images, and catalog revisions.
- [ ] Repository controls can be reconstructed by a cold wake with verified ownership,
      external selection receipt replay, and independent liveness observation.
- [ ] No critical blockers remain.

## Amendments

| Date | What changed | Why |
| --- | --- | --- |
| 2026-09-24 | Initial repository-canonical bootstrap candidate | Owner granted repository development authority after issue #1 bootstrap |
