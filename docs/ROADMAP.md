# Playmancer delivery roadmap

Reconciled 2026-11-04. This is a product plan, not an hourly log or live status
board. Query native GitHub before selection. Issue #1 remains the product/evidence
anchor; software delivery is not proof of real-player recommendation quality.

## Delivered foundation

The reference `master@c211d97bec82578a17af63705e4b81f34e36ffcb` includes the
validated catalog adapter, a 30-game real snapshot, basket search/weights/strict
filters, explanations, sharing/restoration and a separately explained Bridge.
PR #117 adds selected-favorite evidence inspection. The older #17/#22 control
reconciliation was merged; do not treat its leftover branch as unfinished work.

[Publish Pages #41837252723](https://github.com/drevendev/Playmancer/actions/runs/41837252723)
is historical publication evidence for that reference. It does not certify
later heads or replace a fresh served-revision/browser check. Pages provisioning
and synthetic-only data are no longer blanket reasons to defer all product work.

The frozen genre player remains `feature-overlap-2`. Genres, documented platform
facts and source provenance are limited evidence, not a complete taste model.
The twelve-profile non-genre fixture records 48 selected facts: 12 partial and
18 unknown profiles, zero complete vectors. See `REVIEWED_TAG_READINESS_12.md`.
Do not convert these selected annotations into a complete weight distribution.

## Closing first

Before any row below, reconcile ambiguous effects/regressions and inspect all
open PRs. Repair or accept eligible earlier work, finish existing branches, then
select a new bounded slice. Follow `../control/EXECUTION_ORDER.md` and current
provider rules. No fixed PR number or stale control-field claim determines order.

## Remaining outcomes, not asserted live Issue statuses

| Scope | Player outcome / acceptance | Independent limits |
| --- | --- | --- |
| #118 observation explorer | Search and compare source-backed facts, preserve unknowns, versioned shares and keyboard/mobile flow; later merge and hosted verification | A separate fact inventory, not recommender v2 or a quality improvement claim |
| #76 richer recommendation evidence | Broader per-field known-present/known-absent/unknown observations; identical catalog/eligibility/top-k evaluation, explicit method/share migration and separate Bridge acceptance | Complete profiles and useful ranking are not established by the current partial annotations |
| #121 owner-game evidence slice | Verify a bounded set of Idle Fantasy Shop gameplay facts against public receipts, without importing acquisition tags as mechanics | No private analytics, inferred tags, owner boosts or silent frozen-snapshot edits |
| #119 navigation reliability | Consistent control counters, preserved history/identifiers, native discovery and automatic regressions against stale claims | Documentation does not create permissions or schedule authority |
| #14 accessibility acceptance | Preserve multi-engine HTTP/keyboard/mobile regressions and explicitly track actual screen-reader/browser pairs not yet tested | Automated geometry or accessibility trees are not speech certification |
| #10 usefulness | Compare frozen identical-catalog baselines and report losses; conduct consented player studies only after outreach authorization | Offline proxies are not preference or adoption measurements |
| #15/#16 reliability follow-up | Preserve proven responsiveness and high-signal regressions; adopt only genuinely uncovered counterexamples from archives | Do not reopen completed scopes or duplicate earlier tests merely from old filenames |

Inspect the current Issue/PR state before using any row: a closed issue is a
historical scope unless a remaining gap is independently demonstrated. Do not
close broad #76 or #1 merely because a bounded child ships. Maintain dated public
source receipts; no unauthorized bulk scraping, paid APIs or visitor tracking.

## Delivery boundaries

Keep COMMITTED, PR_OPENED, MERGED, BUILT, DEPLOYED and LIVE_VERIFIED distinct.
A newly authored semantic change receives later independent exact-head acceptance.
Publication must verify the actual served revision and player flow. Missing metadata
never satisfies hard constraints; unsupported features stay unknown.

Preserve the existing hourly task, title and cadence. No parallel Drive queue,
new scheduler, external outreach, backend or cross-repository development is
introduced by this roadmap. Scoped blockers never stop independent useful work.
