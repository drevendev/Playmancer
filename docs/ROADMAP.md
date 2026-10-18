# Playmancer delivery roadmap

Reviewed 2026-10-18. GitHub owns live PR/check/merge facts. This is the product plan,
not an hourly wake log. [Epic #1](https://github.com/drevendev/Playmancer/issues/1)
remains open until real data, publication and usefulness gates are evidenced.

## Repository assessment

The product has a useful dependency-free static skeleton: twelve fictional profiles,
explicit baskets/weights, three ranking views, strict filters, per-seed explanations,
share restoration and recovery. It is not yet a useful real-game discovery catalog.
PR #4 delivered the hardened preview; PR #5 delivered the JSON benchmark foundation
and merged as `3839c79eff9f8f5ae174eee0abf181c5a1cf8181` on 2026-10-18.

The immediate failures were delivery/process gaps rather than a need for a larger
platform: stale controls still requested acceptance of merged PR #4; ready work
accumulated as local archives; benchmark invocation/report parameters were not clear;
browser PNGs were generated but not retained by CI. Historical scheduled write denials
were incorrectly usable as a permanent global explanation; interactive PR #5 merge
now succeeded. A new actual denial must still stop the affected action without bypass.

Technical gaps: no enforced real-catalog identity/provenance boundary, no adopted code
license, no public Pages provisioning, no real-player evidence, and no exposed Bridge
journey. The compact bundler is intentionally bounded; it must fail on unexpected
module syntax rather than pretend to be a general-purpose build system.

## Ordered delivery gates

| Priority | Task | Completion evidence | Dependency / scope |
| --- | --- | --- | --- |
| P0 | [#6 Preview 0.2 recovery](https://github.com/drevendev/Playmancer/issues/6) | Five-method bounded reproducible benchmark; actual demo validated by versioned identity/rights contract; full original+new tests/build/Chromium and retained screenshots; reconciled controls | Current implementation PR; later exact-head acceptance required |
| P0 | [#7 Public Pages delivery](https://github.com/drevendev/Playmancer/issues/7) | Successful master deployment, public HTTP 200, exact served revision and real hosted desktop/mobile share/recovery screenshots | Authorized admin provisioning; no admin capability in this connection |
| P1 | [#8 Rights-cleared real catalog](https://github.com/drevendev/Playmancer/issues/8) | Target 30–50 varied identifiable games, actual source/field receipts, coverage and identity counterexamples, versioned validated build | Receipt/rights and code-license decisions; synthetic/schema work remains possible |
| P1 | [#9 Explained Bridge journey](https://github.com/drevendev/Playmancer/issues/9) | Oracle-tested solver, explicit endpoints/hops, per-hop evidence and compromises, no-route state and versioned share | After #6; can use synthetic data while #7/#8 external gates wait |
| P2 | [#10 Usefulness and comparison](https://github.com/drevendev/Playmancer/issues/10) | Frozen identical-catalog comparisons and negative results; target roughly 30 baskets and 10 authorized consented sessions; dated task-based competitor check | Real catalog and usable preview; recruitment/outreach needs separate authorization |

All counts above are proposed sample sizes, not completed observations. Numbers of
passing software tests do not establish recommendation quality or adoption.

## Next execution plan

1. Accept the current #6 implementation at its exact remote head, not a historical ZIP.
   Inspect full diff, all original/new tests, build/preflight, CI, browser evidence and
   discussions; repair this same PR when needed. Do not merge in its producing turn.
2. When Pages configuration is available, finish #7 through the existing master-only
   workflow and hosted navigation. If not available, work on the independently ready
   Bridge oracle/interaction slice or source-rights/identity pilot, not more repetition
   of unchanged scale, permission or branch audits.
3. Replace fictional profiles only after #8 evidence exists, preserve catalog/method
   compatibility boundaries, then run the comparison/usefulness protocol in #10.

## Branch and scope hygiene

Use one branch for #6 after closing #5. Existing research branches may contain unique
work; adopt only focused, verified source slices, never raw stale controls. Delete a
completed branch only after its unique work and dependencies are accounted for and a
supported deletion action exists. The current connector exposes no branch deletion
action; this does not block normal PR delivery.

Do not introduce accounts, paid inference, embeddings, a vector database, a backend,
a mandatory global map, a second scheduler or an alternate hosting platform without
measured product need. Keep Intersection, Blend and Bridge distinct; evidence coverage
and popularity are not fit. Keep protected-master PR flow and separate production from
later acceptance. Full EndlessZen format migration is not this product milestone.
