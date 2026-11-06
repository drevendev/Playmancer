# Twenty source-backed gameplay-fact profiles — 6 November 2026

The **Gameplay Facts explorer** gains Portal 2 and The Witness: eight selected positive facts, including independently sourced shared puzzle solving. This is a factual inventory, **not a new ranker or quality claim**. Both official publisher-provided descriptions were inspected on 2026-11-06.

| Game | Selected observations | Publisher-provided source |
| --- | --- | --- |
| Portal 2 (`wikidata:q279446`) | `mechanic:cooperative-puzzles`, `mechanic:physics-puzzles`, `mechanic:puzzle-solving`, `structure:test-chambers` | [Valve's Steam description](https://store.steampowered.com/app/620/Portal_2/) |
| The Witness (`wikidata:q1711359`) | `activity:exploration`, `mechanic:puzzle-solving`, `setting:island`, `structure:open-world` | [Thekla's PlayStation description](https://www.playstation.com/en-us/games/the-witness/) |

The Portal 2 facts are drawn from Valve's *About This Game* description (not community tags): the cooperative campaign, physics, puzzles and test chambers. The Witness facts come from Thekla's official game description, which identifies open-world island exploration and hundreds of puzzles. Shared `mechanic:puzzle-solving` is independently sourced, not inferred from a recommendation field or a store popularity measure.

Four 0.25 weights per added game represent **editorial normalization over selected observations only**. They are neither game-wide importance nor confidence. Unmentioned traits remain **unknown, not disproven**. No game descriptions, artwork, user reviews, community/store tags or other copyrighted assets are copied.

## Immutable evidence and compatibility

- New versioned input: `examples/semantic-tags-reviewed-20.v1.json`; Git blob `8d667a7c67b028e0f4f550ce22f8e333eb93c58a`.
- Previous 18-game input unchanged: Git blob `fb69cf0c834812509fe979e4a8f2380bd7930e0b`.
- Unchanged 30-game catalog: Git blob `0570fd610b14fb336c0de65e6cc3062892abe301`.
- **20 partial / 10 unknown** profiles; **82 selected positive facts**, **56 taxonomy IDs**, **zero complete weighted profiles**.
- `#facts=` links preserve ordered game IDs, catalog and observation digest. Stale links fail visibly rather than silently displaying substituted evidence.
- Genre ranking method `feature-overlap-2`, basket/catalog/share versions, Bridge, exclusions and strict hard constraints are untouched.
- The frozen 16-game v2 release gate still reports 150/150 abstentions. There is no new measured recommendation-quality improvement or human-usefulness evaluation.

## Verification

```sh
node --test test/semantic-tags-reviewed-20.test.js
npm test
npm run build
python3 scripts/release-preflight.py _site
python3 scripts/browser-observations-acceptance.py --engine all
```

A PR build is not evidence of publication. Independently accept the exact PR head and verify the served Pages revision and desktop/mobile player before claiming LIVE_VERIFIED. [Issue #76](https://github.com/drevendev/Playmancer/issues/76) remains open.
