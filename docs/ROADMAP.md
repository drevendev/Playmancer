# Playmancer delivery roadmap — 2026-10-18

The present playable basket interface uses **12 fictional authored game
profiles**, not a real-world catalog or measured recommendation quality.
Review GitHub-native PR and issue state, not stale control-file snapshots.
See [product anchor #1](https://github.com/drevendev/Playmancer/issues/1).

| Priority | Owner issue | Acceptance / dependency |
| --- | --- | --- |
| P0 — benchmark and catalog contract | [#6](https://github.com/drevendev/Playmancer/issues/6) | Five shared-catalog/top-k methods, canonical report, recorded rights/identity validators for demo; Node/build/browser gate. This PR is the benchmark/report slice; catalog remains outstanding. |
| P0 — live release | [#7](https://github.com/drevendev/Playmancer/issues/7) | Authorized Pages provisioning; deploy exact reviewed master; HTTP 200 and matching `playmancer-revision`; hosted desktop/mobile basket/share journey. Provisioning requires permissions not held by this worker. |
| P1 — explainable Bridge | [#8](https://github.com/drevendev/Playmancer/issues/8) | Independent graph oracle, endpoint/hop controls, per-hop evidence, deterministic no-route behavior, hard filters and accessible list-first UI. No 2D-distance scores. |
| P1 — rights-cleared real pilot | [#9](https://github.com/drevendev/Playmancer/issues/9) | A varied ~30–50-game **target**, dated field-level rights/source/coverage receipts, editions/DLC/remake and external-ID review, valid static refresh. Do not infer rights from API access. |
| P2 — measure usefulness | [#10](https://github.com/drevendev/Playmancer/issues/10) | Freeze ~30 baskets as **target**, same eligible catalog/filters/top-k for baseline comparisons, negative results, and consented task sessions only after outreach authorization. |

No user study, source-rights clearance, real-catalog coverage or Pages
publication is implied by local tests. `PR_OPENED` is not `MERGED`; `BUILT`
is not `DEPLOYED` or `LIVE_VERIFIED`. Hard constraints never silently relax.
Prefer incremental stateless later-head PR acceptance over parallel branch stacks.
