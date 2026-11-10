# Saved baskets and portable backups

The production player includes **Saved baskets** beside the first-screen start
buttons. This opens a native disclosure inside the existing basket panel. The
fictional preview remains unchanged. This is a player utility, not a release of
the experimental recommender v2 or a change to recommendation quality.

## Player flow

1. Build a basket and adjust its weights, ranking mode, required filters, hidden
   games and optional Bridge settings.
2. Open Saved baskets, enter a name and choose **Save current basket**. Nothing
   is saved automatically. Up to 20 separately named baskets fit in one library.
3. **Restore** asks before replacing the current basket, reuses the existing
   share-state validator, refreshes the URL and focuses the basket heading.
   **Rename** and **Delete** only affect that saved record, not the current basket.
4. Open **Backup or import JSON** to export the current basket or saved library.
   Download JSON or copy the editable text. On another device, choose a file or
   paste JSON, then explicitly choose **Import all baskets**. Selecting a file
   validates it but does not save anything yet.

## Storage and privacy

Saves use the `playmancer-basket-library` IndexedDB database, version 1, with one
`baskets` object store. Records contain only an explicitly chosen name and the
existing `#basket=` share fragment. No browsing history, timestamps, random
visitor identifiers, analytics, accounts, external requests or cloud sync are
added. Storage belongs to the browser origin/profile, not a user identity; other
scripts under the same origin can also access it. Do not put secrets in names.

Anyone using the profile can read its saves. Private browsing, browser cleanup,
quota policies and site-data removal can make storage unavailable or remove it.
A downloaded backup is the supported portable copy, not a guarantee of permanent
browser persistence. The existing share URL remains usable independently.

Read/modify/write operations occur in one IndexedDB read/write transaction.
Overlapping writes are serialized by IndexedDB, preventing two tabs from silently
replacing each other's libraries. Successful individual requests are insufficient:
the UI reports a save only after transaction completion. See the [IndexedDB
transaction model](https://www.w3.org/TR/IndexedDB/#transaction-concept).

Use **Refresh saved baskets** after another tab changes its saves. A rename/delete
also checks the exact previously read name/hash; stale operations fail instead of
targeting a newly changed record. Duplicate names never overwrite. The name field
is case-sensitive and trims outer whitespace on creation; duplicate imported
names are errors, not implicit updates. There is no silent eviction at capacity.

## Compatibility and failure behavior

The existing player owns all semantic validation. Saved fragments preserve ordered
IDs/weights, mode, required platform, co-op, lambda, exclusions, catalog/method
versions and optional Bridge endpoints/policy versions. Unsupported versions and
unknown constraint fields are not migrated or silently dropped. An incompatible
stored basket remains visible with Restore disabled, and can still be exported,
renamed or deleted. Imported incompatible baskets reject the entire batch.

Malformed storage is not automatically cleared or replaced. The UI disables
writes, names the failure and retains current-basket export. Close older tabs and
refresh after a blocked connection. Corrupt data may require inspection through
browser storage tools; deleting this database/site data is destructive and is
never performed automatically. Failed/quota-aborted transactions leave existing
saves intact. No unsafe localStorage fallback is used.

## Backup contract

```json
{"format":"playmancer-baskets","version":1,"baskets":[{"name":"Weekend","hash":"#basket=…"}]}
```

The example is illustrative, not an importable state. Export from a matching
player to obtain valid IDs and exact catalog/method versions. Envelopes and entries
use strict key allowlists. Limits: 20 records, 64 Unicode code points per name,
100,000 characters per fragment and 1 MiB UTF-8 per whole backup/library. Control
characters, malformed JSON, duplicates, unknown keys and unsupported versions
fail visibly. Names render with `textContent`; imported fragments never become
arbitrary navigation URLs. Import validates every basket before any write, then
merges without replacement in one atomic transaction. Neither import nor export
changes the current player basket.

## Verification and release boundaries

`node --test test/basket-library.test.js test/build-basket-library.test.js` checks
model bounds, rollback planning, stale writes, exact state retention, deterministic
serialization and fail-closed bundle injection. `npm test` retains all existing
correctness suites. The production builder retains the same five files and uses
an isolated inline closure; no runtime dependency or remote asset is introduced.
The synthetic demo build and its 95 kB budget are not altered.

`python scripts/browser-basket-library-acceptance.py` builds the production player
and exercises real HTTP navigation in Chromium, Firefox and WebKit at 1280px and
390px. It uses fresh disposable browser contexts, never a visitor's saved data.
Reports and actual screenshots live in `.test-artifacts/library-*`. The dedicated
CI workflow runs on PRs and master pushes; it is not a scheduled worker.
Hosted invocation uses the existing `PLAYMANCER_HOSTED_URL` and
`PLAYMANCER_EXPECTED_SHA` fail-closed identity contract. Physical-device and screen
reader certification are not claimed. A passing candidate test is not proof that
the candidate is merged, deployed or serving publicly.
