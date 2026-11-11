# Circlanoid: the 29th partial Gameplay Facts profile — 11 November 2026

**Experimental selected facts, not whole-game similarity.** The immutable
30-game catalog now has 29 partially observed games, one unreviewed game
(DevMatch), 118 independently worded positive factual labels, and still
**zero verified complete tag vectors**. The public `feature-overlap-2`
ranker, Bridge and basket shares are unchanged.

The newly attributed Circlanoid (`dreven:circlanoid`) observations are
`mechanic:orbital-paddles` (rotating outside paddles),
`mechanic:target-breaking` (breaking internal arena targets),
`structure:campaign-levels` (handcrafted campaign levels), and
`structure:endless-mode`. Each positive fact has equal selected-fact
weight 0.25, **not** source-assigned importance or verified missing traits.

**Source limitation:** the frozen catalog's canonical
[Dreven Games Google Play listing](https://play.google.com/store/apps/details?id=com.drevengames.circlanoid)
could not be read directly from this environment on 11 November 2026.
These original short classifications were checked against a
[public third-party reproduction of the developer listing](https://apkpure.net/circlanoid/com.drevengames.circlanoid).
The fixture records the canonical store link and explicitly notes secondary
corroboration; do not claim direct first-party inspection, verified licensing
of media or descriptions, complete tags, or recommendation-quality improvement.
No source prose, art, or external tag lists are embedded.

The current source is `examples/semantic-tags-reviewed-29.v1.json`, pinned
to Git blob `aec15a40ed968916f4120d04aab53731740ee82d`, with 29 partial records and 80 taxonomy IDs.
It retains all 28 prior profiles and receipts unchanged from Git blob
`717eb3689c6eaf82b7f826a9633407e9b259e76e` and keeps the same 30-game catalog
`0570fd610b14fb336c0de65e6cc3062892abe301`.
The `#facts=` fingerprint changes so old links fail visibly.
The [28-profile frozen release audit](REVIEWED_TAG_READINESS_28.md) still
reports 0/150 rankable v2 scenarios. This source expansion does not establish
a new v2 readiness measurement, ranking benchmark, human utility or Pages
publication.

Verify with `node --test test/semantic-tags-reviewed-29.test.js`,
`npm test`, `npm run build`, `python3 scripts/release-preflight.py _site`
and `python3 scripts/browser-observations-acceptance.py --engine all`.

Refs [Issue #76](https://github.com/drevendev/Playmancer/issues/76).
