# Gameplay observation explorer

The production release adds `observations.html`, linked from the basket in a
new tab. Search real game names or recorded gameplay facts, filter by one
positive observation, and compare two different games. Shared observations
retain both per-field source URLs and review dates. One-sided records mean
**unreviewed for the other game**, never a proven mismatch. Games without
records remain selectable and explicitly unknown.

This ships the existing 48 independently authored observations for 12 games,
reviewed on 31 October 2026. It does not acquire new source data, increase the
30-game catalog, improve measured recommendation quality, or enable v2.
The 18 unreviewed profiles are not treated as negative examples. Editorial
normalization weights are deliberately omitted from the public projection:
they are neither importance nor confidence. No publisher text, artwork or
store/community tags are copied. The original source-review and rights scope
remain in `SEMANTIC_TAGS_REVIEWED_12.md`; this change does not grant rights to
republish those websites.

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
`cd79f729d960f5c495c2d1e16448ff8058f582dd` are checked before touching output.
Changing historical inputs fails closed. Updating evidence requires explicit
review and a new fingerprint, not an automatic refresh or a new review date.
The existing frozen readiness studies remain byte-identical.

`#facts=` links preserve ordered game IDs, search query, selected fact, catalog
ID, observation digest and `observations-1` view version. Unsupported versions,
unknown IDs, duplicate pairs and malformed links fail visibly. No basket or
Bridge link is reinterpreted. Fact searches do not apply basket hard filters;
this is an evidence inventory, **not a recommendation mode**.

The browser harness covers actual HTTP navigation, keeping the original
basket tab, search/empty states, sources, unknowns, restoration, invalid-link
recovery, keyboard focus, 44px controls and 200/400% text reflow at 1280, 390
and 320 px. Screenshots and JSON are retained by Verify. Screenshot inspection
and hosted publication are distinct from passing unit tests. Screen-reader
speech and human recommendation usefulness are not certified here.

Delivery issue: #118. Remaining recommendation release gates: #76.
