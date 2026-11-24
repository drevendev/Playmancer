# Bellbloom — 31-game candidate (2026-11-24)

**Candidate only.** The production build continues to select the frozen 30-game
snapshot. This new catalog is a separately versioned input, not a Pages release,
new ranking method, or completed weighted-tag vector.

## Source receipt

- [Official itch.io listing](https://drevengames.itch.io/bellbloom), inspected
  2026-11-24: identity Bellbloom, Dreven Games, Simulation genre.
- [Publisher release devlog](https://drevengames.itch.io/bellbloom/devlog/1797009/bellbloom-is-out-on-itchio),
  published 2026-11-21, inspected 2026-11-24: browser-playable release.
- Canonical ID `dreven:bellbloom`, itch ID `bellbloom`, theme normalized to
  `simulation video game`, observed platform `browser`.
- Owner-published factual identity/genre/platform/link fields follow the existing
  owner-game inclusion authorization. Separate dated source record
  `dreven-owned-bellbloom` preserves the prior source records unchanged.
- No artwork, description, copied tag list, pricing, reviews or inferred co-op
  data. Mechanics remain null in this catalog contract. The publisher's
  description of tapping, upgrades and layered music is a lead for a separate
  reviewed observation binding, not a complete game-wide weight distribution.

## Frozen compatibility

`examples/catalog.multistore-31.real.json` is a candidate with 31 games
(25 Wikidata + 6 owner titles). All 30 prior records and both source records
are unchanged and in their original order. Previous snapshot and observation
files remain untouched. The candidate uses a new snapshot identifier; it must
not silently replay links pinned to the 30-game snapshot.

Validate before adoption:

```sh
node scripts/validate-catalog.mjs examples/catalog.multistore-31.real.json --publishable
node --test test/catalog-bellbloom-candidate.test.js
npm test
```

Next adoption gate: establish a versioned observation binding for the new
catalog, update production selection and related versioned compatibility and
browser acceptance tests in a focused change, and independently verify Pages.
Compare the candidate against the genre baseline using a shared eligibility
set. Owner association adds no ranking preference. No claim of v2 readiness.

Refs #76.
