# Versioned semantic-tag vocabulary — experimental adapter

**Issue #76; status: offline implementation, not a published real-data expansion or player ranking change.**

`src/tag-taxonomy.js` validates an explicitly authored, versioned dictionary of
canonical namespaced tags and strictly namespaced aliases. Its output can be
passed directly to the existing `prepareEvidenceModel({ games })` experiment.
It never guesses whether an actual game has a genre, mechanic, graphic style,
character type, activity or mood. Missing per-game evidence stays `tags: null`;
there is no autofill, renormalization, store-tag scraping or popularity boost.

Namespaced IDs are case-sensitive `namespace:slug`. Supported namespaces are
`genre`, `mechanic`, `visual`, `character`, `mood`, `setting`, `activity`, and
`structure`. Editorial synonyms are allowed **only in the same namespace** and
must be explicitly declared, avoiding false equivalence such as treating a
store genre as a proven game mechanic. Unknown IDs, cross-namespace aliases,
ambiguous collisions and duplicate canonical tags fail closed.

## Reproduce with fictional data

```js
import { prepareTagTaxonomy, projectWeightedTagProfiles,
  TAG_TAXONOMY_VERSION } from './src/tag-taxonomy.js';
import { prepareEvidenceModel } from './src/evidence-similarity.js';

const dictionary = prepareTagTaxonomy({
  version: TAG_TAXONOMY_VERSION,
  tags: [
    { id: 'genre:rpg', label: 'Role-playing', aliases: [] },
    { id: 'mechanic:dialogue-choices', label: 'Dialogue choices',
      aliases: ['mechanic:branching-dialogue'] },
  ],
});
const projected = projectWeightedTagProfiles(dictionary, [
  { id: 'demo:fictional', tags: [
    { id: 'genre:rpg', weight: 0.4, source: 'authored-fictional-fixture' },
    { id: 'mechanic:branching-dialogue', weight: 0.6,
      source: 'authored-fictional-fixture' },
  ] },
  { id: 'demo:unknown', tags: null },
]);
const model = prepareEvidenceModel({ games: projected.games, relations: [] });
```

Every game must explicitly provide either `tags: null` (unknown) or a positive
list with *supplied* weights summing to 1. Only already-recorded per-game
receipts may populate `source`. Aliases preserve the original observation's
receipt but do not multiply its influence. A source's rights attestation must
be verified independently before exporting real tags to the public catalog.
The adapter enforces structure and provenance presence, **not legal rights or
source truth**. A version change requires a new frozen dictionary, explicit
catalog/method/share compatibility work and independent evaluation; do not
reinterpret old shares.

Test: `node --test test/tag-taxonomy.test.js`. Frozen real-catalog studies
remain **genre-only uniform proxies**, since no non-genre public tag data or
source-ranked weights have been authorized and imported. The published
`feature-overlap-2` player, Bridge, UI and Pages are unchanged.

Next meaningful delivery gate: acquire and verify a small, dated, redistributable
set of **non-genre game-specific observations** with per-field source receipts,
then build a new versioned snapshot and compare on identical baskets, constraints
and top-k. A controlled vocabulary alone does not prove better recommendations.
