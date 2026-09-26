# P05 — Evaluation protocol v0

Status: **protocol ready for implementation; no quality claim**
Reviewed: 2026-09-26
Research question: **Does Playmancer's basket interaction produce useful, understandable recommendations, and do Intersection, Blend, and Bridge behave differently enough to justify separate product modes?**

This protocol turns the product requirements in issue #1 and the P03 ranking receipt into falsifiable tests. It deliberately separates deterministic correctness, same-catalog method comparison, external product comparison, and human usefulness. Passing an earlier layer does not imply passing a later one.

## Decision summary

Use four evaluation layers:

1. **Invariant suite on versioned synthetic fixtures** — correctness and determinism.
2. **Same-catalog offline benchmark** — compare Playmancer methods and simple baselines under identical candidates and hard constraints.
3. **Task-level external comparison** — compare the user task with products such as Nodal without pretending their hidden model/catalog is a controlled algorithmic baseline.
4. **Small human pilot** — discover comprehension and usefulness failures before making public claims.

Do not collapse these layers into one score. Offline metrics are evidence about an evaluation setup, not a substitute for observed user usefulness.

## Evidence reviewed

### Repository evidence

- Playmancer issue #1 defines the product task, P05 acceptance direction, and the requirement to compare methods on the same candidate catalog and filters.
- P03 defines the first transparent baselines:
  - single-seed similarity;
  - Union / best-seed affinity;
  - weighted arithmetic fit;
  - strict minimum diagnostic;
  - harmonic Intersection;
  - greedy Blend with uncovered-strand gain;
  - Bridge as a route over feature similarity rather than a scalar score.
- P03 also requires explicit evidence coverage, deterministic tie rules, hard constraints before scoring, and preservation of the full per-seed affinity vector.

### External evidence

Reviewed 2026-09-26:

- Nodal's current Multi-Game Recommender accepts 2–20 seeds, combines per-seed recommendations with weighted averaging, boosts games matching multiple seeds, and suggests roughly 3–5 seeds as a useful range. This makes Nodal a direct **task comparator**, but not a controlled algorithmic baseline because Playmancer cannot hold Nodal's catalog, features, model state, or candidate generation fixed.
  - https://nodal.gg/games
- Bauer, Zangerle, and Said's 2024 systematic review of recommender-system evaluation reports that offline experiments dominate the literature and that beyond-accuracy qualities are comparatively rarely assessed. Playmancer therefore needs explicit task/understanding measures in addition to ranking diagnostics.
  - https://doi.org/10.1145/3629172
- Peska and Vojtas (HT 2020) compared offline metrics with online behavior and found materially different behavior across metrics and user conditions. Treat this as a warning against claiming that an offline ranking win is automatically a user-value win.
  - https://doi.org/10.1145/3372923.3404781
- Cañamares, Castells, and Moffat (2020) show that offline recommender evaluation outcomes depend on protocol choices such as data filtering, candidate construction, output-list handling, metrics, and significance testing. The benchmark must therefore version its snapshot, candidate set, constraints, and protocol rather than reporting a decontextualized number.
  - https://doi.org/10.1007/s10791-020-09371-3

## Evaluation object

A run is fully identified by:

```text
catalog_snapshot_id
method_version
fixture_or_basket_id
seed canonical IDs
normalized seed weights
hard constraints
feature-group weights
evidence-coverage policy
candidate-pool policy
mode
mode parameters
top_k
deterministic tie rule
```

Every recorded result must preserve those fields. A result without enough metadata to reproduce the candidate set and ranking is not benchmark evidence.

## Layer 1 — deterministic invariant suite

Use small, hand-auditable synthetic fixtures. These tests are the first implementation gate and must run without network access.

### Required fixture families

At minimum:

1. one seed;
2. duplicate canonical seeds;
3. two balanced seeds;
4. three balanced seeds;
5. deliberately conflicting seeds;
6. uneven weights;
7. candidate with zero affinity to one positive-weight seed;
8. sparse candidate with missing feature groups;
9. hard-constraint known failure;
10. hard-constraint unknown value;
11. no eligible candidates;
12. exact tie between candidates;
13. seed appears in candidate pool;
14. catalog revision that adds/removes a candidate;
15. Bridge graph with one obvious valid route;
16. Bridge graph with disconnected endpoints;
17. Bridge graph with equal-cost alternative routes.

### Hard correctness gates

The implementation gate is **zero violations** of these invariants:

- same snapshot + inputs + method version produces the same result ordering;
- duplicate canonical seeds collapse and their explicit weights sum;
- exact seed IDs do not appear as ordinary next-game candidates;
- a known hard-constraint violation is excluded before scoring;
- a missing required hard-constraint value never silently counts as pass;
- missing feature data is not converted into zero affinity;
- evidence coverage remains separate from fit;
- scalar ties follow the declared deterministic tie rule;
- popularity, rating, and 2-D coordinates never break basket-fit ties;
- one-seed Union, arithmetic fit, and Intersection reduce to the same single-seed fit;
- Intersection is zero when a positively weighted seed affinity is zero under the P03 harmonic definition;
- conflicting seeds may yield weak/empty Intersection without silently falling back to Union;
- Bridge edge cost is derived from underlying features, never 2-D projection distance;
- disconnected Bridge endpoints return an explicit no-route result rather than an invented path.

Any invariant failure blocks recommendation-quality claims and becomes an implementation defect.

## Layer 2 — same-catalog offline benchmark

This layer compares methods, not products. All methods must receive the exact same candidate catalog snapshot, identity policy, hard constraints, feature availability, and seed baskets.

Until publication rights and a real catalog sample are established, run this layer on synthetic or independently licensed fixtures only. Do not describe synthetic results as catalog quality.

### Predeclared basket set

The first useful benchmark should contain approximately 30 deliberately stratified baskets:

- coherent / same-strand baskets;
- cross-genre but plausibly bridgeable baskets;
- deliberately conflicting baskets;
- uneven-weight baskets;
- sparse-metadata baskets;
- identity-edge baskets involving related editions/remakes/ports where applicable;
- 2-seed, 3-seed, and 5-seed cases.

The basket definitions must be versioned before comparing methods. Do not quietly remove baskets where a preferred method performs poorly.

### Methods compared

On the same candidate pool and hard filters:

1. single-seed neighbors;
2. Union / best-seed affinity `U`;
3. simple shared-feature overlap;
4. weighted arithmetic fit `A`;
5. strict minimum / least-misery diagnostic;
6. harmonic Intersection `I`;
7. Blend reranking across a small, predeclared `lambda` sweep.

Bridge is not included in this scalar leaderboard. It has a separate route evaluation below.

### Required result fields

For every candidate retained in the evaluated prefix:

- per-seed affinity vector;
- aggregate method score;
- evidence coverage;
- hard-constraint state;
- strongest supporting feature groups;
- material mismatch groups;
- canonical ID;
- final rank.

Store negative and empty outcomes. A benchmark report that preserves only top winners is incomplete.

### Mode-specific diagnostics

#### Intersection

Report:

- harmonic Intersection score;
- strict-minimum affinity;
- weakest-seed identity and affinity;
- arithmetic fit for comparison;
- evidence coverage.

The key diagnostic is whether apparently strong results hide a severe weak-seed mismatch.

#### Blend

Because Blend is a list objective, evaluate prefixes rather than only item scores.

For each prefix `k`, report:

- per-seed best affinity represented in the prefix;
- weighted uncovered-strand gain;
- arithmetic relevance of selected items;
- redundancy in underlying feature space;
- which seed strand contributed the marginal gain at each greedy step.

A useful Blend result should make multiple basket strands visible without using 2-D map separation as a diversity proxy.

#### Weight sensitivity

For controlled fixtures, increase one seed's weight while holding all other inputs fixed.

The test should verify that aggregate affinity toward the emphasized seed moves in the expected direction at the list level. Do **not** require every individual game's rank to move monotonically; discrete top-k changes can make that false even for a correct method.

#### Sparse evidence

Run the same basket against variants with progressively removed feature groups.

Record fit and evidence coverage separately. A high fit from very low evidence must remain visibly low-confidence rather than being treated as equivalent to a well-supported match.

## Bridge evaluation

Bridge is an endpoint-to-endpoint route task.

Use two explicit endpoints and evaluate:

- route exists / no route;
- hop count;
- total feature-derived edge cost;
- maximum single-hop cost;
- endpoint affinity trace across route position;
- feature changes that justify each hop;
- deterministic path choice under equal cost;
- whether any hop used 2-D coordinates in ranking or cost (**must be no**).

For a larger basket, Bridge remains disabled until the user chooses two endpoints. Do not invent an implicit multi-terminal route for evaluation.

A route can be visually attractive and still fail if one hop is semantically unsupported.

## Layer 3 — external task comparison

### Comparator

Nodal is the first direct comparator because its public product currently supports multi-game seed blending.

### What may be compared

Use matched task prompts such as:

- "Find one game that plausibly fits all three favorites."
- "Show several recommendations while keeping different taste strands visible."
- "Increase the importance of one favorite and explain what changed."
- "Identify the weakest match to one seed."
- "Reproduce/share the same discovery state."
- "Explore a route between two deliberately different favorites."

Record:

- whether the task can be expressed;
- visible controls available;
- whether compromises/mismatches are exposed;
- whether the user can inspect why a result appeared;
- whether the state is reproducible/shareable;
- interaction steps and notable failure modes.

### What must not be claimed

Do not report Nodal-vs-Playmancer recommendation quality as if it were a controlled algorithm comparison. Candidate catalogs, hidden features, model versions, availability, personalization state, and ranking implementations differ.

External comparison is therefore **task/UX evidence**, not a same-catalog relevance benchmark.

## Layer 4 — human pilot

The initial pilot is for failure discovery and directional evidence, not population-level inference.

### Initial scope

Use roughly:

- 30 predeclared baskets available across the study set;
- about 10 consented sessions;
- a mixture of coherent, conflicting, weighted, and sparse cases.

The exact sample can change before execution, but the final protocol and exclusions must be recorded before looking at outcomes.

### Blinding and order

Where practical:

- hide method names and raw score magnitudes during the first preference judgment;
- randomize or counterbalance presentation order;
- keep candidate catalog and constraints fixed when comparing internal methods;
- reveal explanations only when the task calls for explanation inspection.

### Primary observations

Collect separately:

1. **investigation intent** — which unfamiliar result, if any, the participant would inspect/play next;
2. **basket-fit judgment** — which result best represents the stated basket intention;
3. **weakest-match comprehension** — can the participant identify which seed a recommendation fits least well;
4. **explanation correctness/comprehension** — does the explanation match the visible evidence and participant interpretation;
5. **control predictability** — before changing a weight/constraint, can the participant predict the direction of the change and then understand the observed result;
6. **mode distinction** — do Intersection, Blend, and Bridge lead to distinguishable user expectations/tasks rather than three names for effectively the same output;
7. **failure notes** — misleading explanation, unexpected hidden relaxation, empty result confusion, inaccessible interaction, or irreproducible state.

### Claims boundary

A pilot of this size must not be used to claim population-wide accuracy, superiority, or statistically representative preference.

Report counts, concrete failure classes, negative cases, and participant-level observations. Any critical misleading explanation or silent hard-constraint relaxation is a product defect regardless of aggregate preference.

## Decision rules after the first benchmark

After Layers 1–2:

- **Ship no quality claim** unless all hard invariants pass.
- Keep Intersection only if it behaves observably more conservatively than arithmetic/Union on predeclared conflict cases without creating unexplained artifacts.
- Keep Blend only if its prefix diagnostics actually preserve multiple seed strands better than plain arithmetic ranking on the same fixtures.
- Keep Bridge only if routes are deterministic, feature-supported, and understandable as ordered transitions.
- If a complex method does not beat a simpler baseline on its declared semantic goal, prefer the simpler method.
- If results depend materially on one `lambda`, coverage threshold, or hidden heuristic, expose/version that parameter and run sensitivity analysis before productizing it.
- Record losses and abstentions alongside wins.

After the human pilot:

- convert comprehension failures and misleading explanations into blocking implementation issues;
- do not treat preference counts alone as proof of recommendation quality;
- revise or remove modes whose intended semantics users cannot distinguish;
- only then decide whether a larger study is worth the cost.

## Machine-readable result shape

The implementation should emit records that can later be rendered in docs/Pages without recomputing hidden state:

```json
{
  "protocol_version": "p05-v0",
  "catalog_snapshot_id": "synthetic-v1",
  "basket_id": "B001",
  "mode": "intersection",
  "method_version": "p03-v0",
  "seed_ids": ["game:a", "game:b"],
  "seed_weights": [0.5, 0.5],
  "constraints": {},
  "candidate_id": "game:c",
  "rank": 1,
  "score": 0.64,
  "per_seed_affinity": [0.72, 0.58],
  "evidence_coverage": 1.0,
  "hard_constraint_state": "pass",
  "diagnostics": {}
}
```

Exact field names may change when implementation starts; the provenance and reproducibility requirements may not.

## Immediate implementation consequence

The first evaluation harness can be entirely static and deterministic:

1. versioned synthetic fixtures;
2. pure P03 scoring functions;
3. invariant tests;
4. benchmark runner producing machine-readable JSON;
5. a small report generator that preserves negative/empty results.

No embeddings, paid inference, vector database, account system, runtime backend, or live catalog pull is required to validate these semantics.

## Known unknowns

- No live catalog sample or field-coverage measurement exists yet.
- No Playmancer user study has been run.
- No external product's hidden model/catalog state is controlled.
- No threshold has been established for a sufficiently supported candidate under sparse metadata.
- No Blend `lambda` is approved as a product default.
- No claim is made that Playmancer currently outperforms Nodal or any other recommender.

Those remain explicit unknowns rather than being converted into assumed quality.
