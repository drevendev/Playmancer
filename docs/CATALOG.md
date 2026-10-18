# Catalog snapshot and identity contract

Schema version: **1**. Implementation: `src/catalog.js`. Inputs are ordinary parsed
JSON. This contract validates records and declared publication attestations; it does
not determine whether a legal right actually exists.

## Snapshot shape

```json
{
  "schemaVersion": 1,
  "snapshotId": "synthetic-example-1",
  "kind": "synthetic",
  "sources": [{
    "id": "authored-fixture",
    "kind": "synthetic",
    "attribution": "Playmancer authored fictional fixture",
    "rights": {
      "status": "synthetic",
      "reference": "README.md#catalog-contract",
      "fields": ["id", "kind", "name", "description", "aliases", "externalIds", "sourceId", "parentId", "mechanics", "themes", "platforms", "coop"]
    }
  }],
  "games": [{
    "id": "demo:example", "kind": "game", "name": "Fictional Example",
    "description": "An authored testing profile, not a real game.",
    "aliases": ["Example Fixture"], "externalIds": [],
    "sourceId": "authored-fixture", "parentId": null,
    "mechanics": ["exploration"], "themes": null,
    "platforms": ["pc"], "coop": null
  }]
}
```

## Identity and unknowns

Canonical IDs use a lowercase namespace and local identifier (for example
`demo:example`), never a display name. Aliases are declared explicitly, NFC-normalized
and case-insensitive for collision detection/resolution. Duplicate aliases and aliases
that shadow canonical IDs fail. Identical titles do not cause automatic merging.

External IDs are unique provider/ID pairs; provider namespaces must be lowercase.
An edition, DLC or remake has its own canonical ID and explicit parent ID. Missing
parents, cycles, self-links and parent kinds other than game/remake are rejected.
Base games cannot claim a parent. No record is silently collapsed into a franchise,
edition or original title. Resolver output is a canonical ID or `null`, never a guess.

Missing mechanics/themes/platforms/co-op metadata becomes `null`. An observed empty
list is known empty; `coop: false` is known unsupported. Coverage reports count
known records independently for each field and retain the full catalog denominator.
The twelve-profile demo is validated without changing its ranking input semantics.

## Publication boundary

A synthetic snapshot requires synthetic sources. A real snapshot requires licensed
source records; it cannot adopt the synthetic label as a rights shortcut. Every
source has attribution and a nonempty reviewed-rights reference. For publication,
synthetic sources need the synthetic status, licensed sources need approved status,
and every projected game field must be in the source's explicit field allowlist.
Unreviewed or denied status blocks publication but may be structurally inspected.

`validateCatalogSnapshot` returns a detached, recursively frozen public projection.
Arbitrary extra fields, images and private notes are not copied. Artwork is excluded
until a separate reviewed schema and field-rights decision exists. All fields of a
record currently share one source receipt; mixed-source per-field lineage requires a
future explicit schema revision, not an implicit assumption.

```sh
npm run validate:catalog
node scripts/validate-catalog.mjs example.json
node scripts/validate-catalog.mjs example.json --publishable
```

The first command validates the actual authored demo with its publication gate.
The second performs structural/identity inspection; the third also requires recorded
field publication approval. The actual build validates its demo before touching the
output directory, preserving last-valid output for validation failures.

An approved marker is an attestation, not independent legal evidence. [#8](https://github.com/drevendev/Playmancer/issues/8)
requires actual source receipts, retrieval dates/digests, terms review, stratified
real-game examples and separate description/artwork decisions before any real release.
The current implementation does not fetch an API or claim real-catalog readiness.
