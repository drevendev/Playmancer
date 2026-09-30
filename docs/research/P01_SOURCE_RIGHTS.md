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

## Wikidata fallback decision v1

Reviewed: 2026-09-30.

Additional primary/public sources:
- https://www.wikidata.org/wiki/Wikidata:Licensing
- https://www.wikidata.org/wiki/Wikidata:RDF
- https://www.wikidata.org/wiki/Wikidata:Database_download
- https://www.wikidata.org/wiki/Property:P1733
- https://www.wikidata.org/wiki/Property:P9043
- https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/query_limits

Decision: treat **Wikidata structured data** as the first independently licensed
candidate for a redistributable static Playmancer catalog core. Wikidata states that
its structured data is released under CC0, and its JSON/RDF dumps are available for
offline reuse. This clears a materially different path from mirroring IGDB responses,
but it does **not** establish that Wikidata has enough game-feature coverage for useful
recommendations.

Scope the first validation to a deliberately varied 60-title sample. Measure coverage
for canonical item identity, release date, platform, developer/publisher, genre,
franchise/series relations, and external identifiers. Record missingness per field and
keep the sample checksum/retrieval date. Presence of an external identifier such as
Steam app ID (P1733) or IGDB numeric game ID (P9043) is useful for entity crosswalks;
it does not grant redistribution rights to the linked service's descriptions, artwork,
ratings, or other content.

For a production static snapshot, prefer an explicit dump/incremental-dump ingestion
path over depending on high-volume live WDQS queries. The public query service documents
current responsiveness/scalability limits, while Wikidata publishes reusable JSON/RDF
dumps and daily incremental dumps. Bounded WDQS queries remain appropriate for research
sampling and schema discovery.

License boundary: this decision applies to Wikidata **structured data**. It does not
blanket-license Wikimedia Commons media or prose in other namespaces; those assets must
carry their own recorded license and attribution terms before publication.

P01 can advance to an implementation-ready catalog fixture once the 60-title sample
shows which required fields are sufficiently covered and which recommendation features
must stay synthetic, derived from another independently licensed source, or explicitly
unknown. Until that measurement exists, no catalog-quality or completeness claim is
allowed.
