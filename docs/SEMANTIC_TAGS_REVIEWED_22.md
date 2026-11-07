# Twenty-two source-backed gameplay-fact profiles — 7 November 2026

The Gameplay Facts explorer gains Super Meat Boy and To the Moon with eight independently
authored positive observations, all supported by game publisher/developer material inspected
on 2026-11-07. This is an **evidence-inventory expansion**, not weighted recommender v2.

| Game | Selected positive observations | First-party receipt |
| --- | --- | --- |
| Super Meat Boy (`wikidata:q1784048`) | `activity:boss-fights`, `mechanic:platforming`, `mechanic:wall-jumping`, `structure:short-levels` | [Team Meat's publisher/port partner eastasiasoft](https://www.eastasiasoft.com/games/Super-Meat-Boy) |
| To the Moon (`wikidata:q1711379`) | `activity:character-stories`, `activity:memory-reconstruction`, `structure:story-driven`, `visual:rpg-aesthetics` | [Developer Freebird Games](https://freebirdgames.com/games/to-the-moon/) |

Super Meat Boy's publisher describes wall movement, hundreds of bite-sized
platforming challenges and boss fights. Freebird's own description documents
the central character's memory fragments, narrative presentation and classic RPG visuals.
These facts are short original classifications, not copied store prose or community tags.

Shared selected observations now connect Super Meat Boy with Celeste on platforming
and wall-jumping, and To the Moon with Hades on character-driven stories.
**An observation recorded on one side but not another is unknown, not a mismatch.**
All new 0.25 masses are editorial normalization over four selected facts only,
not source-derived whole-game importance, measured fit, or confidence.

## Immutable revisions and limits

- Current observation file: `examples/semantic-tags-reviewed-22.v1.json`, Git blob
  `73a40215d2ad77668a68d7a2aa4c43e2bdcfb4f9`.
- Frozen predecessor: `examples/semantic-tags-reviewed-20.v1.json`,
  `8d667a7c67b028e0f4f550ce22f8e333eb93c58a`; all previous records and taxonomy entries are preserved.
- Frozen 30-game catalog: `0570fd610b14fb336c0de65e6cc3062892abe301`.
- **22 partial / 8 unknown** profiles, **90 selected positive observations**,
  **61 taxonomy IDs**, **zero complete game-wide weighted vectors**.
- Explorer `#facts=` links pin the observation digest and must reject prior versions.
  Basket links, ranked genre method `feature-overlap-2`, Bridge and hard constraints
  are unchanged. No v2 relevance or human usefulness claim follows from this inventory.

## Review/verification

```sh
node --test test/semantic-tags-reviewed-22.test.js
npm test
npm run build
python3 scripts/release-preflight.py _site
python3 scripts/browser-observations-acceptance.py --engine all
```

The first-party descriptions only establish the selected facts, not redistribution
rights to art, store rankings or community tags. See [Issue #76](../issues/76)
for the unfulfilled offline and player-ranking release gates. Source URLs and
dated receipts are retained in the input.
