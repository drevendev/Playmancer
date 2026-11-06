# Sixteenth reviewed game snapshot: Papers, Please and Inscryption — 5 November 2026

**Scope:** the published gameplay-fact explorer, not the genre recommender.
The facts below are newly authored, brief positive observations sourced from
public first-party game descriptions. They are not copied store tag lists, source
assigned weights, completeness claims, or a ranking-quality benchmark.

## Dated public receipts

Inspected on **2026-11-05**:

| Game / catalog identity | Explicit observed activity or mechanic | First-party receipt |
| --- | --- | --- |
| Inscryption · `wikidata:q109051201` | Escape-room style puzzles (`activity:escape-room-puzzles`) | [Official Inscryption game page](https://www.inscryption.com/steam) |
| Inscryption | Drafting creature cards (`mechanic:card-drafting`) | Same official page |
| Inscryption | Building a card deck (`mechanic:deck-building`, existing shared tag ID) | Same official page |
| Inscryption | Psychological horror elements (`mood:psychological-horror`) | Same official page |
| Papers, Please · `wikidata:q14565978` | Immigration booth inspection (`activity:border-inspection`) | [Lucas Pope / 3909 official press kit](https://papersplea.se/presskit/) |
| Papers, Please | Checking entrants' documents (`mechanic:document-checking`) | Same official press kit |
| Papers, Please | Deciding whether entrants may cross (`mechanic:entry-decisions`) | Same official press kit |
| Papers, Please | Fingerprint checks (`mechanic:fingerprint-checks`) | Same official press kit |

The Inscryption creator's public description explicitly mentions a card-based
deckbuilder, acquiring cards by draft, escape-room puzzles and psychological
horror. The Papers, Please creator's press kit explicitly describes processing
travelers' documents, inspection/fingerprint tools and admission decisions.
These are observed *presence* facts only. Nothing about unmentioned games or
missing features is inferred. No remote images, descriptions, publisher prose,
licensed community-tag collections or downloaded store metadata are published.

## Snapshot/release contract

- New immutable `examples/semantic-tags-reviewed-16.v1.json` Git blob:
  `2e189156ebd7a2185bb5eb29c04c5ce9813a5c01`; it supersedes the untouched fourteen-game blob
  `c2b94e8a9770261f07ba586bdb025c4d7afac049`.
- Catalog identity and content are unchanged: 30 catalog games,
  `multi-store-genre-pilot-30-2026-10-28`, catalog Git blob
  `0570fd610b14fb336c0de65e6cc3062892abe301`.
- **16 partial** observation profiles, **14 unknown** profiles, **66** selected
  positive facts, **zero complete** game-wide semantic tag vectors.
  Each new group's four 0.25 values only normalize *selected editorial facts*;
  they do not establish true importance or a complete tag mass.
- The sole new cross-game shared positive fact is Inscryption and Slay the
  Spire's `mechanic:deck-building`. An empty or one-sided comparison is
  never asserted as evidence of dissimilarity.
- Production remains `feature-overlap-2`; the 14-profile frozen readiness
  study is historical. The [16-profile offline readiness audit](REVIEWED_TAG_READINESS_16.md)
  checks exact-catalog eligibility and abstention, **not recommendation quality**.
  Old `#facts=` share links are explicitly rejected on digest mismatch.

## Acceptance gates (not claims until run)

`node --test test/semantic-tags-reviewed-16.test.js`,
`npm test`, `npm run build`,
`python3 scripts/release-preflight.py _site`,
and multi-engine HTTP/hosted browser acceptance, including 320 px and 400%
text. Check new search and dual-source shared-fact comparison. Confirm that
no catalog/ranker/Bridge version changed and that the updated release digest
is visible on Pages before marking it LIVE_VERIFIED.

Tracking: [#76](https://github.com/drevendev/Playmancer/issues/76).
Previous immutable evidence: [14-game receipts](SEMANTIC_TAGS_REVIEWED_14.md).
