# Offline 30-basket real-pilot diagnostic — Issue #10

**Scope (2026-10-28):** reproducible method diagnostics on the already
published *data snapshot*. This is **not** a player study, a relevance judgment,
an accuracy estimate, an independent quality benchmark, or proof that any
method is better for users. No external calls, stores, accounts or analytics.

## Reproduce

Run with Node 22 (no npm dependencies):

```sh
node --test test/real-pilot-evaluation.test.js
node scripts/evaluate-real-pilot.mjs > /tmp/playmancer-real-pilot-evaluation.json
node scripts/evaluate-real-pilot.mjs > /tmp/playmancer-real-pilot-evaluation-again.json
cmp /tmp/playmancer-real-pilot-evaluation.json /tmp/playmancer-real-pilot-evaluation-again.json
```

The source is
[`examples/catalog.multistore-30.real.json`](../examples/catalog.multistore-30.real.json),
with snapshot ID `multi-store-genre-pilot-30-2026-10-28` and Git blob SHA-1
`0570fd610b14fb336c0de65e6cc3062892abe301`.
The exact UTF-8 blob is verified before analysis, not just the snapshot ID.
Any catalog correction requires a new immutable source/protocol and reevaluation,
never silently changing prior figures. The ordered 30 baskets are frozen in
[`examples/evaluation-baskets-30.real.json`](../examples/evaluation-baskets-30.real.json).

## Predeclared comparison

Ten coherent baskets, ten deliberately conflicting baskets, five with uneven
weights, two with missing genre evidence, and three with hard constraints.
All contain 2–5 real named game IDs. One constrained basket explicitly excludes
a candidate; the co-op-required basket deliberately makes the currently
unknown co-op metadata visible as **abstention**. This sample is selected to
exercise method differences and failure cases, **not randomly sampled players**.

Each basket evaluates the same complete 30-game pool with identical
seed exclusions, explicit weights, hard-constraint states, exclusions,
`topK=5`, method version `feature-overlap-2`, and `Blend lambda=0.3`.
The runner uses the existing `src/benchmark.js` and `src/ranking.js`
implementation, not a new scoring algorithm:

- **Single-seed reference:** one arithmetic ranking per explicitly chosen seed,
  with the same candidates/filters; it is not a fake multi-seed consensus.
- **Union:** strongest matching seed, even if others disagree.
- **Arithmetic:** normalized weighted average seed affinity.
- **Least misery:** minimum seed affinity.
- **Intersection:** weighted harmonic affinity; a zero for any positive seed
  vetoes whole-basket similarity.
- **Blend:** greedy list selection with relevance and uncovered-strand gain.
  Its selection objective is **not** numerically comparable with scalar scores.
- **Bridge:** excluded from scalar leaderboards; route evaluation needs a
  separate endpoint/hop protocol.

**Genre-only proxy:** current 30-game pilot has no observed mechanics and
unknown co-op fields. Pair affinity is Jaccard similarity of observed P136 or
owner-published genre tags; both sides must have genres. Each comparable
pair contributes only the actual **0.3 feature-group evidence coverage**,
not full knowledge. A missing genre is `null`, never a zero match.
Platform requirements are strict and missing platform facts are `unknown`.
The script refuses catalog changes or a newly populated mechanics field
rather than pretending these results are comparable after enrichment.

## Read the output carefully

Each basket records complete runner partitions for each method: top-ranked
IDs, per-seed affinities, evidence coverage, uncertain candidates with
reasons, explicit exclusions, constraints, weights and method versions.
`mode_diagnostics` gives count of top-five games with positive support
from *every* seed, wholly zero-overlap games, and seed strands represented.
`summary` retains all abstaining baskets, missing all-seed support and
cases where Blend selects the same top IDs as arithmetic. None is a metric
of human preference or recommendation quality.

Expected **negative-case classes** (asserted in Node tests):

- DevMatch carries no observed genres; baskets containing it as a seed
  cannot receive supported multi-seed rankings and must abstain.
- Every game currently has unknown co-op evidence; `required-coop-unknown`
  must yield no eligible recommended game, not silently relax the filter.
- Infamous 2 has unknown platform metadata and must stay uncertain under
  the Windows filter rather than pass or be guessed available.

Method-specific failures are **kept** in the JSON rather than omitted,
including empty lists and overlaps that explain nothing. In particular,
a zero Blend marginal objective is not evidence that the candidate has
zero genre affinity. Comparing `score` numerically between Blend and
Intersection is invalid.

## What this does not settle

No gold-standard judgments of basket fit, relevance labels, or real
consumer intent are available. The snapshot contains only 30 games,
sparse genre labels (one title has none), no confirmed mechanics/co-op,
and limited identity/platform evidence. This diagnostic can demonstrate
structural differences, unsupported outputs, or abstentions; it cannot
verify whether a player *likes* the recommended games.

Follow-up under [#10](https://github.com/drevendev/Playmancer/issues/10):
predeclare player-judged evaluation tasks, assess actual explanations and
recommendations, and conduct consented sessions **only after outreach
authorization**. Independently compare Nodal on user-task affordances
without pretending its proprietary catalog/method is held constant.
If genre-only rankings remain mostly zero/unsupported, prioritize
rights-cleared feature enrichment over algorithmic complexity.
