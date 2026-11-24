# Bellbloom Gameplay Facts candidate — 24 November 2026

**Candidate only; production remains on 30 games.** This binds the separately
versioned 31-game catalog to 30 partial profiles, 122 positive observations and
84 taxonomy IDs; DevMatch remains unknown. No profile is a complete weight
vector. The public ranking method and existing build selection are unchanged.

Bellbloom's [publisher listing](https://drevengames.itch.io/bellbloom) and
[21 November release devlog](https://drevengames.itch.io/bellbloom/devlog/1797009/bellbloom-is-out-on-itchio) were inspected on 24 November 2026.
Four independently worded facts: tap to earn resources, spend resources on
upgrades, unlock music layers through upgrades, and catch falling stars. Each
has equal weight 0.25 over these selected observations, not over the full game.
No copied description, artwork, store tag list or inferred negative traits.

Catalog blob `c25441023dc73f6650e6a780e3a6405237848ce8`; candidate evidence blob `db1591ae8691adbf2cf375476db93bc1281c057a`.
All 29 prior profiles, receipts, and 80 taxonomy records remain unchanged as
JSON values. The production evidence fingerprint stays `aec15a40ed968916f4120d04aab53731740ee82d`.
Candidate callers must explicitly pass the new evidence fingerprint; old
observation links cannot silently replay against the new catalog.
The production builder still validates its original exact blob pair.

Next gate: switch build selection and compatibility/browser fixtures together;
run production and historical share/observation-link tests, identical-eligibility
evaluation, and independent Pages inspection. No v2 ranking quality claim.

Verify: `node --test test/semantic-tags-bellbloom-binding.test.js`, `npm test`,
`npm run build`. Refs #76.
