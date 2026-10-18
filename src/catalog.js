// Versioned metadata contract. This validates recorded rights, not the legal
// truth of a receipt. Callers supply ordinary parsed JSON; no code is evaluated.
const CATALOG_FIELDS = ["id", "kind", "name", "description", "aliases", "externalIds",
  "sourceId", "parentId", "mechanics", "themes", "platforms", "coop"];
const METADATA_FIELDS = ["mechanics", "themes", "platforms", "coop"];
function catalogObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}
function catalogText(value, label) {
  if (typeof value !== "string" || !value.trim() || value !== value.trim()) throw new TypeError(`${label} must be a non-empty trimmed string`);
  return value;
}
function catalogList(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const result = value.map(item => catalogText(item, label));
  if (new Set(result).size !== result.length) throw new TypeError(`duplicate ${label}`);
  return result;
}
const aliasKey = value => value.normalize("NFC").toLowerCase();
function catalogFreeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(catalogFreeze);
    Object.freeze(value);
  }
  return value;
}
export function validateCatalogSnapshot(input, { requirePublishable = false } = {}) {
  catalogObject(input, "catalog snapshot");
  if (input.schemaVersion !== 1) throw new Error("Unsupported catalog schemaVersion");
  const snapshotId = catalogText(input.snapshotId, "snapshotId");
  if (!["synthetic", "real"].includes(input.kind)) throw new Error("Invalid catalog kind");
  if (!Array.isArray(input.sources) || !input.sources.length) throw new Error("Catalog sources are required");
  if (!Array.isArray(input.games) || !input.games.length) throw new Error("Catalog games are required");
  const sources = new Map();
  for (const item of input.sources) {
    catalogObject(item, "source");
    const id = catalogText(item.id, "source id");
    if (sources.has(id)) throw new Error(`Duplicate source ID: ${id}`);
    if (!["synthetic", "licensed"].includes(item.kind)) throw new Error(`Invalid source kind: ${id}`);
    if (input.kind === "real" && item.kind === "synthetic") throw new Error("Real catalogs cannot claim synthetic source rights");
    if (input.kind === "synthetic" && item.kind !== "synthetic") throw new Error("Synthetic catalogs cannot conceal real-source records");
    const rights = catalogObject(item.rights, `rights for ${id}`);
    if (!["synthetic", "approved", "unreviewed", "denied"].includes(rights.status)) throw new Error(`Invalid rights status: ${id}`);
    const fields = catalogList(rights.fields, `publishable fields for ${id}`);
    if (fields.some(field => !CATALOG_FIELDS.includes(field))) throw new Error(`Unsupported publishable field: ${id}`);
    const reference = catalogText(rights.reference, `rights reference for ${id}`);
    const allowed = item.kind === "synthetic" ? rights.status === "synthetic" : rights.status === "approved";
    if (requirePublishable && !allowed) throw new Error(`Publication rights not approved: ${id}`);
    sources.set(id, { id, kind: item.kind, attribution: catalogText(item.attribution, `attribution for ${id}`),
      rights: { status: rights.status, reference, fields } });
  }
  const ids = new Set(), externals = new Set();
  const games = input.games.map(item => {
    catalogObject(item, "game");
    const id = catalogText(item.id, "game id");
    if (!/^[a-z0-9]+:[a-z0-9][a-z0-9._-]*$/.test(id)) throw new Error(`Noncanonical game ID: ${id}`);
    if (ids.has(id)) throw new Error(`Duplicate game ID: ${id}`);
    ids.add(id);
    if (!["game", "edition", "dlc", "remake"].includes(item.kind)) throw new Error(`Invalid entity kind: ${id}`);
    if (!sources.has(item.sourceId)) throw new Error(`Unknown source: ${id}`);
    // Explicit allowlist: arbitrary input fields never become public assets.
    const game = { id, kind: item.kind, name: catalogText(item.name, `name for ${id}`),
      description: item.description == null ? null : catalogText(item.description, `description for ${id}`),
      aliases: catalogList(item.aliases ?? [], `aliases for ${id}`), externalIds: [], sourceId: item.sourceId,
      parentId: item.parentId ?? null };
    if (item.kind === "game" && game.parentId !== null) throw new Error(`Base game cannot have parentId: ${id}`);
    if (item.kind !== "game") catalogText(game.parentId, `parentId for ${id}`);
    for (const key of ["mechanics", "themes", "platforms"]) {
      game[key] = item[key] == null ? null : catalogList(item[key], `${key} for ${id}`);
    }
    if (item.coop != null && typeof item.coop !== "boolean") throw new Error(`Invalid co-op metadata: ${id}`);
    game.coop = item.coop ?? null;
    if (!Array.isArray(item.externalIds ?? [])) throw new Error(`Invalid externalIds: ${id}`);
    for (const external of item.externalIds ?? []) {
      catalogObject(external, "external ID");
      const provider = catalogText(external.provider, "external provider");
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(provider)) throw new Error("Noncanonical external provider");
      const externalId = catalogText(external.id, "external id");
      const key = JSON.stringify([provider, externalId]);
      if (externals.has(key)) throw new Error(`External ID collision: ${provider}/${externalId}`);
      externals.add(key); game.externalIds.push({ provider, id: externalId });
    }
    if (requirePublishable) {
      const permitted = new Set(sources.get(item.sourceId).rights.fields);
      for (const [key, value] of Object.entries(game)) {
        // Identity always needs rights. Other fields need clearance only when
        // publishing observed information. Known-empty feature arrays are still
        // observations; empty alias/product lists and nulls carry no sourced data.
        const requiredIdentity = ["id", "kind", "name", "sourceId"].includes(key);
        const hasObservedValue = Array.isArray(value)
          ? value.length > 0 || ["mechanics", "themes", "platforms"].includes(key)
          : value !== null;
        if ((requiredIdentity || hasObservedValue) && !permitted.has(key)) {
          throw new Error(`Field not cleared for publication: ${id}/${key}`);
        }
      }
    }
    return game;
  });
  const aliases = new Map(games.map(game => [aliasKey(game.id), game.id]));
  for (const game of games) {
    for (const alias of game.aliases) {
      const key = aliasKey(alias);
      if (aliases.has(key)) throw new Error(`Ambiguous alias: ${alias}`);
      aliases.set(key, game.id);
    }
  }
  const byId = new Map(games.map(game => [game.id, game]));
  for (const game of games) {
    if (game.parentId !== null && !byId.has(game.parentId)) throw new Error(`Missing parent: ${game.id}`);
    const visited = new Set([game.id]);
    let current = game;
    while (current.parentId !== null) {
      if (visited.has(current.parentId)) throw new Error(`Entity relation cycle: ${game.id}`);
      visited.add(current.parentId);
      current = byId.get(current.parentId);
      if (!current) throw new Error(`Missing parent: ${game.id}`);
    }
    if (game.parentId !== null && !["game", "remake"].includes(byId.get(game.parentId).kind)) {
      throw new Error(`Parent must be a game or remake: ${game.id}`);
    }
  }
  return catalogFreeze({ schemaVersion: 1, snapshotId, kind: input.kind, sources: [...sources.values()], games });
}
export function catalogCoverage(snapshot) {
  const valid = validateCatalogSnapshot(snapshot);
  return Object.fromEntries(METADATA_FIELDS.map(key => [key, {
    known: valid.games.filter(game => game[key] !== null).length, total: valid.games.length,
  }]));
}
export function resolveCatalogIdentity(snapshot, token) {
  const valid = validateCatalogSnapshot(snapshot);
  catalogText(token, "identity token");
  // No fuzzy title matching and no edition/DLC collapse.
  return valid.games.find(game => game.id === token || game.aliases.some(alias => aliasKey(alias) === aliasKey(token)))?.id ?? null;
}
