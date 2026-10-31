# Frozen v2 vs published Bridge: 30-game endpoint comparison

**Issue #76. Status: offline diagnostic only, not the live Bridge player.**
This intentionally separate experiment reuses the existing immutable 30-game source,
the predeclared 30-basket plan and all **50 adjacent favorite endpoint tasks**.
It compares the published feature-based Bridge with a candidate Bridge graph
built from the **experimental v2 weighted-genre proxy** and source-recorded
platform metadata. No new game tags or curated relations are imported.

## Reproduce without credentials or network

    node --test test/bridge-evidence-real-pilot.test.js
    node scripts/compare-bridge-real-evidence.mjs > /tmp/bridge-v2-a.json
    node scripts/compare-bridge-real-evidence.mjs > /tmp/bridge-v2-b.json
    cmp /tmp/bridge-v2-a.json /tmp/bridge-v2-b.json

The comparison first validates the original source licensing, exact catalog Git
blob 0570fd610b14fb336c0de65e6cc3062892abe301, exact basket-plan Git
blob e28809801448df2f73c604d0349ce71c042d7f53, task order,
exclusions, platform and co-op hard filters, and original Bridge results.
Observed genre labels have **authored uniform 1/N weights**, not verified
source importance. DevMatch lacks known genres and must abstain where needed.
No mechanics, mood, characters, influence or two-hop editorial links are inferred.

Both graph runners use **3 maximum hops and numerical edge threshold 0.31**.
The candidate graph retains only pairs with positive, source-supported genre
overlap AND composite v2 affinity >= 0.31, so common platforms alone cannot
manufacture a taste route. V2's experimental score contains small secondary
platform effects, whereas the existing Bridge uses feature overlap: **the
same numeric threshold is not a calibrated or fair quality comparison**.
This report is useful to expose route gains/losses and unknown-data behavior,
not to claim an improvement. It never modifies player ranking, saved links,
catalog/method version or Pages.

The output records per-group negative and positive route-status transitions,
each task's constraints/exclusions, pair-evidence abstentions and sourced
tag/metadata explanations for each supported step. A no-route result may mean
disconnection or a three-hop bound. The frozen plan deliberately contains no
real-player relevance labels, so even a route gain cannot establish usefulness.

## Frozen proxy result (2026-10-31)

On the exact 30-game source, the currently published Bridge supports **5/50**
declared endpoint tasks; the candidate uniform-genre-weight v2 graph supports
**4/50**. The published method returns 44 no-routes and one unavailable
endpoint; v2 returns **45 no-routes and one unavailable endpoint**. There
are **zero gained routes and one lost route**, from the second favorite to
Shadow Runner in the coherent-platformer basket. This is an observed
*negative* connectivity result at the frozen numerical threshold, not a
human-relevance measurement. Score scales differ, so no claim of generalized
v2 inferiority follows. The test pins these counts against regressions.

**Decision gate:** do not switch the public Bridge to v2 on this proxy alone.
Acquire rights-cleared non-genre tags/curated relations, evaluate methods on the
same eligible source-backed snapshot with independently defined task judgments,
and measure browser responsiveness before a separately versioned release.
See docs/BRIDGE_EVALUATION_30.md and docs/EVIDENCE_REAL_PILOT.md.
