# Gameplay observation explorer

The production release adds `observations.html`, linked from the basket in a
new tab. Search real game names or recorded gameplay facts, filter by one
positive observation, and compare two different games. Shared observations
retain both per-field source URLs and review dates. One-sided records mean
**unreviewed for the other game**, never a proven mismatch. Games without
records remain selectable and explicitly unknown.

The current 22-game evidence snapshot ships 90 independently authored selected
facts for 22 of the existing 30 real games. The immutable 20-game predecessor
contained 82 facts; eight new first-party-source-backed observations describe
Super Meat Boy and To the Moon, reviewed on 7 November 2026. Eight games remain
unreviewed, not proven lacking gameplay traits. No game-wide
weighted vector is complete; selected-fact normalization is not importance,
confidence or proof of missing attributes. This adds fact search/comparison,
not a new ranker or demonstrated quality uplift. No descriptions, media or
community tag lists are copied.

## Reproducible package

```sh
npm test
npm run build
python3 scripts/release-preflight.py _site
python scripts/browser-observations-acceptance.py
```

`build-release.mjs` builds the unchanged genre player through `build-demo.mjs`
and adds the separately compiled, self-contained explorer. Production has
exactly five files: index.html, player.css, bridge-worker.js, observations.html,
and .nojekyll. The legacy `build-demo.mjs` and `pages-preflight.py` remain the
four-file lower-level/synthetic contract; use **release-preflight.py** after
`npm run build`. Every legacy preflight check still runs on the exact player
bytes. The observation page has a separate 100 kB limit and no remote assets.

Catalog blob `0570fd610b14fb336c0de65e6cc3062892abe301` and observation blob
`73a40215d2ad77668a68d7a2aa4c43e2bdcfb4f9` are checked before touching output.
Changing historical inputs fails closed. Updating evidence requires explicit
review and a new fingerprint, not an automatic refresh or a new review date.
The existing frozen readiness studies remain byte-identical.

`#facts=` links preserve ordered game IDs, search query, selected fact, catalog
ID, observation digest and `observations-2` view version. Unsupported versions,
unknown IDs, duplicate pairs and malformed links fail visibly. No basket or
Bridge link is reinterpreted. Fact searches do not apply basket hard filters;
this is an evidence inventory, **not a recommendation mode**.

The browser harness covers actual HTTP navigation, keeping the original
basket tab, search/empty states, sources, unknowns, restoration, invalid-link
recovery, keyboard focus, 44px controls and 200/400% text reflow at 1280, 390
and 320 px. Screenshots and JSON are retained by Verify. Screenshot inspection
and hosted publication are distinct from passing unit tests. Screen-reader
speech and human recommendation usefulness are not certified here.

Delivery issues: #118 (explorer), #121 (the one-game source expansion). Remaining recommendation release gates: #76. The 12-game baseline in `semantic-tags-reviewed-12.v1.json` is frozen and unchanged; the 13-game revision remains frozen in `SEMANTIC_TAGS_REVIEWED_13.md`, the 14-game revision is documented in `SEMANTIC_TAGS_REVIEWED_14.md`, and the historical 16-game revision is documented in `SEMANTIC_TAGS_REVIEWED_16.md`.
The historical 18-game revision is documented in `SEMANTIC_TAGS_REVIEWED_18.md`.
The historical 20-game revision is documented in `SEMANTIC_TAGS_REVIEWED_20.md`.
The active 22-game revision is documented in `SEMANTIC_TAGS_REVIEWED_22.md`.
