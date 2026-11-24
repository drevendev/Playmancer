# Reviewed 35-game release candidate (2026-11-24)

Refs #268. This is an opt-in five-file release, not the default Pages catalog.

```sh
node scripts/build-release.mjs /tmp/playmancer-35 --candidate-35
python3 scripts/release-preflight.py /tmp/playmancer-35 --candidate-35
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/playmancer-35
```

The immutable [catalog](../examples/catalog.multistore-35.real.json) contains 35 distinct profiles, 34 with supported store links. Four appended Steam games have reviewed identity/genre receipts in the [batch](../examples/reviewed-steam-batch-2026-11-24.json). The [observation binding](../examples/semantic-tags-reviewed-30.catalog35.v1.json) copies the same 30 partial profiles and 122 positive facts from the 31-game candidate without adding or changing observations. The four new games and DevMatch remain unknown in Gameplay Facts, not verified absent. Old basket and observation links are not silently migrated. Standard Pages still builds the 30-game catalog.

The next release promotion must exercise exact snapshot counts and late-title discovery in the normal hosted acceptance flow. No release-count credit until anonymously verified.
