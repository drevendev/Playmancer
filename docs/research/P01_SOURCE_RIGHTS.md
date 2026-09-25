# P01 publishability decision v0

Reviewed: 2026-09-26.

Sources:
- https://api-docs.igdb.com/
- https://www.twitch.tv/p/en/legal/developer-agreement/

Decision: keep Playmancer development on synthetic or independently licensed
fixtures until the exact publication terms for the production catalog are
recorded.

Do not place raw IGDB responses, data dumps, or rehosted artwork in the public
repository or Pages output by default. IGDB documents application caching and
serving, commercial partnerships, attribution, and Data-Partner-only dumps, but
that is not enough evidence for Playmancer to treat a public static catalog
mirror as cleared.

The first authorized validation should sample 60 deliberately varied titles and
measure field coverage separately for identity/relations, categorical features,
release/platform/company facts, free text, and image references.

P01 remains open until live sample coverage and the publication boundary for the
actual production snapshot are both verified.
