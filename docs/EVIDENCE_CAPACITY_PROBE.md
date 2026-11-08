# Offline v2 scoring capacity probe (fictional data)

This reproducible Node-only stress workload supports [Issue #76](https://github.com/drevendev/Playmancer/issues/76), **not** the public player. It is an intentionally synthetic ceiling fixture: 250 fictional games, 128 individually authored synthetic tags per game, and 4,096 unique sourced-in-fixture edges. There are no scraped store/community tags, no rights claims about real games, and **no preference or relevance labels**.

Run on Node.js 22 or later:

```sh
node --test test/evidence-capacity-probe.test.js
node scripts/benchmark-evidence-250.mjs 24
```

The program prepares the versioned offline v2 model **before** recording elapsed time. It exercises both Intersection and Blend over the same five weighted seeds, strict Windows + co-op requirements, explicit exclusion and top-k 5. Synthetic data includes unknown platform/co-op fields, disjoint documented platforms, negative co-op observations, and all three authored relation types. The ranking output must stay byte-for-byte stable across warmups and repeated timed calls. P50, P95, and max are empirical **Node scoring durations for that particular machine**; the report retains the runtime version, method ID, workload size, eligible/unknown/excluded partition and per-mode top IDs. It does not claim a universal latency budget or accuracy.

**Release gate remains open.** These timings do not measure browser p95, rendering, memory, worker/message overhead, catalog loading, real-catalog data, or a player's experience. The actual player still uses `feature-overlap-2`; the frozen 28-game selected-fact audit has zero complete vectors and continues to abstain. Do **not** treat a passing benchmark or fast fictional score as permission to integrate v2. A later browser trial must use a versioned rights-cleared, sufficiently complete catalog and compare methods on identical eligibility/constraints/top-k with explicit negative findings. The separate curated Bridge has a route task, not an interchangeable scoring timing.

This is a capacity **regression probe** (unlike a non-deterministic CI speed threshold). Timing figures must be collected and labelled by environment; tests assert semantic invariants but do not fail on noisy wall-clock thresholds.
