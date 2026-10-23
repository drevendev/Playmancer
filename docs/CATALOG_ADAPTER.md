# Preview 0.3 — validated snapshot adapter

The static player can be built from an explicitly selected, versioned catalog.
This is an engineering delivery path, not a claim that a real source has been
licensed, collected, evaluated or published through Pages.

## Build

```sh
# Preserve the authored twelve-profile default and existing basket links.
node scripts/build-demo.mjs

# Build the independent six-profile synthetic integration catalog.
node scripts/build-demo.mjs _site-pilot --catalog examples/catalog.alternative.synthetic.json
python3 scripts/pages-preflight.py _site-pilot

# Local inspection only; not a public deployment.
python3 -m http.server 8080 --directory _site-pilot
```

One optional output directory and one `--catalog` path are accepted. Missing files,
malformed JSON, duplicate options and unknown flags fail; they never substitute
the default catalog. Input JSON is limited to 1 MiB and 250 profiles, matching the
existing Bridge engineering bound. This is not a latency guarantee; #15 tracks
remaining main-thread responsiveness. The default publication workflow is unchanged
and still builds reviewed master with the authored default until a source is adopted.

## Data path and publication safety

1. Read ordinary JSON at build time; no runtime API, credentials or remote assets.
2. Run `validateCatalogSnapshot(input, { requirePublishable: true })`.
3. Embed **only** its allowlisted projection, with script delimiters, ampersands and
   Unicode line separators escaped. Replacement tokens in names remain literal.
4. Revalidate/freeze that projection in the browser module. `CATALOG` is exactly
   `DEMO_SNAPSHOT.games`; search, rankings and Bridge consume the same selected data.
5. Compile the combined browser script before atomically replacing `index.html`.
   Invalid input or a bundle syntax collision preserves the previous valid HTML.

Unknown input properties, artwork URLs and private annotation sentinels are omitted
from public assets. Recorded field approval is a necessary gate, **not legal
verification**. Real snapshots remain dependent on #8's source/rights receipts.
The source files include the authored fallback fixture; it is not used to replace
an invalid selected snapshot or incompatible player link.

## Player behavior and identity

The visible count, synthetic/real label, source attribution, platform choices and
sample basket derive from the active snapshot. The sample uses its first two
profiles (one when only one exists); choosing it is an explicit recovery action.

Search includes declared aliases and canonical IDs. Selection stores canonical IDs,
never fuzzy title matches. Editions, DLC and remakes remain distinct records with
validated parent relations. Missing descriptions are labelled unavailable; missing
features/platform/co-op data remain unknown. No artwork is invented or fetched.

Links retain ordered IDs/weights, constraints, exclusions, modes, Bridge policy and
catalog/method versions. A link for a different snapshot or an absent canonical ID
fails visibly with an empty basket, not a silently chosen replacement. Snapshot IDs
must be treated as immutable versions: publishing changed records requires a new ID.
The existing `synthetic-demo-1` default and `feature-overlap-2` method are preserved.

## Synthetic fixture

`examples/catalog.alternative.synthetic.json` contains six independently authored
fictional records: two sample games, a route candidate, a separate edition, a DLC
and a sparse unknown record. Their aliases, extra platform, absent descriptions
and explicitly non-public sentinel fields exercise the actual ingestion path.
None represents a collected real game or cleared third-party artwork.

## Reproduce acceptance

```sh
npm test
npm run validate:catalog
npm run benchmark
npm run build
python3 scripts/pages-preflight.py _site
python3 scripts/browser-smoke.py
python3 scripts/browser-bridge-acceptance.py
python3 scripts/browser-catalog-acceptance.py
```

The Node adapter tests cover projection-only output, identical repeated builds,
literal hostile-looking strings, rights/identity/alias/parent failures, bounds,
missing inputs and last-valid artifact retention. Existing tests remain required.
The new Chromium flow uses the real alternate build on desktop/mobile: alias and
edition/DLC selection, weights, strict constraints, exclusions, Bridge, exact share
restoration, incompatible snapshots and stale IDs. It retains PNG/JSON evidence
and the synthetic static artifact in CI. Offline browser tests are not public HTTP
navigation, screen-reader certification, real-device latency or player usefulness.
