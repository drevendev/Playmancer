# Eighteen source-backed gameplay-fact profiles — 6 November 2026

This changes the **Gameplay Facts explorer**, not ranking or Bridge (Issue #76).
Both publisher-controlled pages below were reviewed 2026-11-06.

| Catalog game | Selected positive facts | Official source |
| --- | --- | --- |
| Dwarf Fortress · `wikidata:q248810` | `activity:colony-management` (dwarven outpost), `mechanic:building` (fortresses), `mechanic:digging` (multilevel excavation), `mechanic:farming` (water/farming) | [Bay 12 Games](https://www.bay12games.com/dwarves/features.html) |
| Sekiro: Shadows Die Twice · `wikidata:q54906424` | `mechanic:action-combat`, `mechanic:prosthetic-tools`, `mechanic:stealth`, `mechanic:vertical-traversal` | [Official Sekiro site](https://www.sekirothegame.com/) |

All eight observations are independently authored short facts of **presence**.
Three Sekiro tags are newly defined canonical labels. The Dwarf Fortress tags
reuse existing taxonomy IDs, enabling factual comparisons with Terraria,
Factorio, RimWorld and Stardew Valley. Four 0.25 values per new entry are
**editorial normalization over selected facts only**, never whole-game
importance, confidence, or proof that unrecorded features are absent.

## Exact immutable release evidence

- Source `examples/semantic-tags-reviewed-18.v1.json` Git blob:
  `fb69cf0c834812509fe979e4a8f2380bd7930e0b`. Previous 16-game blob
  `2e189156ebd7a2185bb5eb29c04c5ce9813a5c01` and earlier fixtures
  remain byte-identical.
- Same 30-game catalog `multi-store-genre-pilot-30-2026-10-28`;
  catalog Git blob `0570fd610b14fb336c0de65e6cc3062892abe301`.
- **18 partial / 12 unknown** profile coverage; 74 selected positive facts,
  50 taxonomy IDs; **zero complete weighted profiles**. Unknown is not zero.
- Genre ranker `feature-overlap-2`, basket method/share/catalog versions,
  Bridge, exclusions and hard constraints are untouched. Previous versioned
  `#facts=` links fail visibly on the changed observation fingerprint.
- Source links identify provenance, **not** permission to copy third-party
  descriptions, artwork, community/store tags or other assets. No runtime
  fetch, tracking, ratings, credentials or owner-related ranking advantage.
- The frozen **16-profile** v2 release-gate benchmark remains the latest
  comparable study: 150/150 abstentions. The 18-game observation update
  does not claim any newly measured v2 ranking or human relevance.

## Verification

```sh
node --test test/semantic-tags-reviewed-18.test.js
npm test
npm run build
python3 scripts/release-preflight.py _site
python3 scripts/browser-observations-acceptance.py --engine all
```

The exact PR-head and hosted Pages publication must be verified separately;
a build is not proof that this content is live. Issue [#76](https://github.com/drevendev/Playmancer/issues/76)
remains open until full-weight/rights/evaluation gates are met.
