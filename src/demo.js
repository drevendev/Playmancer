import { blendCandidates, rankCandidates } from "./ranking.js";
import { validateCatalogSnapshot } from "./catalog.js";
import { BRIDGE_ROUTE_METHOD_VERSION } from "./bridge-preview.js";

// The bounded static builder replaces this slot with an already allowlisted
// JSON snapshot. Direct module use retains the authored default below.
const BUILD_CATALOG_SNAPSHOT = null;
export const METHOD_VERSION = "feature-overlap-2";
export const BRIDGE_STATE_VERSION = "bridge-ui-experiment-1";
export const DEMO_MODES = ["intersection", "blend", "arithmetic"];
export const FEATURE_GROUPS = [{ key: "mechanics", weight: 0.7 }, { key: "themes", weight: 0.3 }];
const profile = (id, name, description, mechanics, themes, platforms, coop) =>
  ({ id: `demo:${id}`, name, description, mechanics, themes, platforms, coop });
const AUTHORED_CATALOG = [
  profile("ember", "Ember Circuit", "A fictional action adventure built around exploration and demanding combat.", ["action", "exploration", "combat"], ["fantasy", "mystery"], ["windows", "linux"], false),
  profile("harvest", "Cloud Harvest", "A fictional farming journey about crafting and exploring a gentle world.", ["farming", "crafting", "exploration"], ["cozy", "nature"], ["windows", "mac"], true),
  profile("tide", "Tidebound", "Explore islands, craft equipment, and fight through a fictional wilderness.", ["exploration", "crafting", "combat"], ["fantasy", "nature"], ["windows", "linux"], true),
  profile("grove", "Grove Keepers", "A fictional cooperative blend of farming, crafting, and combat.", ["farming", "crafting", "combat"], ["fantasy", "cozy", "nature"], ["windows", "linux", "mac"], true),
  profile("forge", "Ashen Forge", "A fictional combat-and-crafting adventure through a mysterious realm.", ["action", "combat", "crafting"], ["fantasy", "mystery"], ["windows"], false),
  profile("meadow", "Meadow Letters", "A fictional farming and exploration story in a quiet countryside.", ["farming", "exploration", "story"], ["cozy", "nature"], ["windows", "mac"], false),
  profile("orbit", "Orbit Cartographer", "Explore and solve puzzles in a fictional science-fiction mystery.", ["exploration", "puzzle", "strategy"], ["space", "mystery"], ["windows", "linux"], false),
  profile("signal", "Signal Garden", "A fictional cooperative puzzle game about crafting in space.", ["crafting", "puzzle", "strategy"], ["space", "cozy"], ["windows", "linux"], true),
  profile("citadel", "Paper Citadel", "A fictional turn-based strategy story about a fantasy kingdom.", ["strategy", "combat", "story"], ["fantasy", "mystery"], ["windows", "mac"], false),
  profile("echo", "Echo Atlas", "A fictional exploration and puzzle story with uncertain platform support.", ["exploration", "puzzle", "story"], ["mystery", "nature"], null, null),
  profile("lantern", "Lantern Trail", "A deliberately sparse fictional profile: only its themes are known.", null, ["fantasy", "nature"], ["windows"], null),
  profile("silent", "Silent Archive", "A deliberately incomplete fictional profile with no comparable features.", null, null, null, null),
];
// Both the default and selected snapshot take the same publication-validation
// path. Only the immutable allowlisted projection is consumed by the player.
export const DEMO_SNAPSHOT = validateCatalogSnapshot(BUILD_CATALOG_SNAPSHOT ?? {
  schemaVersion: 1, snapshotId: "synthetic-demo-1", kind: "synthetic",
  sources: [{ id: "authored-demo", kind: "synthetic", attribution: "Playmancer authored fictional profiles",
    rights: { status: "synthetic", reference: "README.md#catalog-contract",
      fields: ["id", "kind", "name", "description", "aliases", "externalIds", "sourceId", "parentId", "mechanics", "themes", "platforms", "coop"] } }],
  games: AUTHORED_CATALOG.map(game => ({ ...game, kind: "game", aliases: [], externalIds: [], sourceId: "authored-demo", parentId: null })),
}, { requirePublishable: true });
export const CATALOG = DEMO_SNAPSHOT.games;
export const CATALOG_VERSION = DEMO_SNAPSHOT.snapshotId;
export const PLATFORMS = ["any", "windows", "linux", "mac", ...[...new Set(CATALOG.flatMap(game => game.platforms ?? []))]
  .filter(platform => !["any", "windows", "linux", "mac"].includes(platform)).sort()];
export const BY_ID = new Map(CATALOG.map((game) => [game.id, game]));

export function initialState() {
  return { v: 1, catalog: CATALOG_VERSION, method: METHOD_VERSION, mode: "intersection",
    seeds: CATALOG.slice(0, 2).map(game => ({ id: game.id, weight: 1 })),
    platform: "any", coopOnly: false, lambda: 0.3, excluded: [] };
}

// Share states are JSON records, not prototype-backed runtime objects. Inherited
// preferences or future constraints must never be materialized or silently lost.
function isShareRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

export function validateBridgeSettings(value, seedIds) {
  if (!isShareRecord(value)) throw new TypeError("Invalid Bridge link state.");
  if (value.version !== BRIDGE_STATE_VERSION || value.method !== BRIDGE_ROUTE_METHOD_VERSION)
    throw new Error("The Bridge link uses an incompatible route version; no route was substituted.");
  const expected = ["version", "method", "startId", "endId", "maxHops", "minSimilarity"];
  if (expected.some((key) => !Object.hasOwn(value, key))) throw new Error("Missing or inherited Bridge link fields.");
  if (Object.keys(value).some((key) => !expected.includes(key))) throw new Error("Unrecognized Bridge link fields.");
  const startId = value.startId, endId = value.endId;
  for (const id of [startId, endId]) {
    if (id !== null && (typeof id !== "string" || !seedIds.has(id)))
      throw new Error("The Bridge link references a game absent from the basket.");
  }
  if (startId && endId && startId === endId) throw new Error("Bridge endpoints must be distinct.");
  if (!Number.isInteger(value.maxHops) || value.maxHops < 1 || value.maxHops > 4)
    throw new Error("Invalid Bridge hop limit.");
  if (![0.05, 0.31, 0.54].includes(value.minSimilarity))
    throw new Error("Unsupported Bridge similarity threshold.");
  return { version: BRIDGE_STATE_VERSION, method: BRIDGE_ROUTE_METHOD_VERSION,
    startId, endId, maxHops: value.maxHops, minSimilarity: value.minSimilarity };
}

export function validateState(value) {
  if (!isShareRecord(value)) throw new TypeError("Invalid basket state.");
  const required = ["v", "catalog", "method", "mode", "seeds", "platform", "coopOnly", "lambda", "excluded"];
  if (required.some((key) => !Object.hasOwn(value, key))) throw new Error("Missing or inherited basket fields.");
  if (value.v !== 1 || value.catalog !== CATALOG_VERSION || value.method !== METHOD_VERSION) {
    throw new Error("This link uses an unavailable catalog or method version. It was not silently upgraded.");
  }
  // Share-link replay must not discard hard constraints introduced by a newer
  // client: unknown fields require an explicit compatible player version.
  const basketFields = ["v", "catalog", "method", "mode", "seeds", "platform", "coopOnly", "lambda", "excluded", "bridge"];
  if (Object.keys(value).some((key) => !basketFields.includes(key))) {
    throw new Error("Unrecognized basket fields. This link was not silently downgraded.");
  }
  if (!DEMO_MODES.includes(value.mode)) throw new Error("Unsupported recommendation mode.");
  if (!PLATFORMS.includes(value.platform) || typeof value.coopOnly !== "boolean") throw new Error("Invalid hard constraints.");
  if (typeof value.lambda !== "number" || !Number.isFinite(value.lambda) || value.lambda < 0 || value.lambda > 1) throw new Error("Blend balance must be between 0 and 1.");
  if (!Array.isArray(value.seeds) || value.seeds.length > 5) throw new Error("A basket supports up to five games.");
  const seen = new Set();
  const seeds = value.seeds.map((seed) => {
    if (!isShareRecord(seed) || !Object.hasOwn(seed, "id") || !Object.hasOwn(seed, "weight")) {
      throw new Error("Missing or inherited basket seed fields.");
    }
    if (Object.keys(seed).some((key) => key !== "id" && key !== "weight")) {
      throw new Error("Unrecognized basket seed fields. This link was not silently downgraded.");
    }
    if (!seed || !BY_ID.has(seed.id) || seen.has(seed.id)) throw new Error("Unknown or duplicate seed ID.");
    if (!Number.isInteger(seed.weight) || seed.weight < 1 || seed.weight > 10) throw new Error("Seed weights must be integers from 1 to 10.");
    seen.add(seed.id);
    return { id: seed.id, weight: seed.weight };
  });
  if (!Array.isArray(value.excluded) || value.excluded.length > CATALOG.length || value.excluded.some((id) => !BY_ID.has(id)) || new Set(value.excluded).size !== value.excluded.length) {
    throw new Error("Invalid excluded game IDs.");
  }
  const seedIds = new Set(seeds.map((seed) => seed.id));
  // A conflicting exclusion must not disappear from a versioned share link.
  // Player actions remove a game from exclusions before adding it to the basket.
  if (value.excluded.some((id) => seedIds.has(id))) {
    throw new Error("A basket game cannot also be excluded.");
  }
  const excluded = [...value.excluded];
  if (!Object.hasOwn(value, "bridge") && value.bridge != null) throw new Error("Inherited Bridge settings are not allowed.");
  const bridge = value.bridge == null ? null : validateBridgeSettings(value.bridge, seedIds);
  return { v: 1, catalog: CATALOG_VERSION, method: METHOD_VERSION, mode: value.mode, seeds,
    platform: value.platform, coopOnly: value.coopOnly, lambda: value.lambda, excluded,
    ...(bridge === null ? {} : { bridge }) };
}

export function encodeState(state) {
  return `#basket=${encodeURIComponent(JSON.stringify(validateState(state)))}`;
}
// Bound incoming links by the validated snapshot's possible ID payload rather
// than a fixed 6000 characters: a legitimate 250-profile exclusion list can
// exceed that limit. Keep a bounded pre-parse rejection for hostile links.
const MAX_BASKET_LINK_LENGTH = (() => {
  const encodedIds = CATALOG.map((game) => encodeURIComponent(JSON.stringify(game.id)).length);
  const longestId = Math.max(0, ...encodedIds);
  const longestPlatform = Math.max(0, ...PLATFORMS.map((item) => encodeURIComponent(JSON.stringify(item)).length));
  const versionBytes = [CATALOG_VERSION, METHOD_VERSION, BRIDGE_STATE_VERSION, BRIDGE_ROUTE_METHOD_VERSION]
    .reduce((size, value) => size + encodeURIComponent(JSON.stringify(value)).length, 0);
  // Any subset of excluded IDs, up to five weighted seeds, and two repeated
  // Bridge endpoint IDs. The constant allowance covers field names,
  // punctuation, settings, and other fixed-size encoded state fields.
  const excludedBytes = encodedIds.reduce((size, length) => size + length + 3, 0);
  return Math.max(6000, 2048 + excludedBytes + 7 * longestId + longestPlatform + versionBytes);
})();

export function decodeState(hash) {
  if (!hash) return initialState();
  if (!hash.startsWith("#basket=") || hash.length > MAX_BASKET_LINK_LENGTH) throw new Error("Unrecognized or oversized basket link.");
  let parsed;
  try { parsed = JSON.parse(decodeURIComponent(hash.slice(8))); }
  catch { throw new Error("The basket link is malformed. No replacement basket was loaded."); }
  return validateState(parsed);
}

export function constraintState(game, state) {
  let unknown = false;
  if (state.platform !== "any") {
    if (game.platforms == null) unknown = true;
    else if (!game.platforms.includes(state.platform)) return "fail";
  }
  if (state.coopOnly) {
    if (game.coop === false) return "fail";
    if (game.coop == null) unknown = true;
  }
  return unknown ? "unknown" : "pass";
}

export function pairEvidence(a, b) {
  let weightedSimilarity = 0;
  let coverage = 0;
  const shared = [];
  const notShared = [];
  for (const { key, weight } of FEATURE_GROUPS) {
    if (a[key] == null || b[key] == null) continue;
    const first = new Set(a[key]);
    const second = new Set(b[key]);
    const overlap = [...first].filter((tag) => second.has(tag));
    const unionSize = new Set([...first, ...second]).size;
    weightedSimilarity += weight * (unionSize ? overlap.length / unionSize : 0);
    coverage += weight;
    shared.push(...overlap);
    notShared.push(...[...second].filter((tag) => !first.has(tag)));
  }
  return { affinity: coverage >= 0.7 ? weightedSimilarity / coverage : null,
    coverage, shared: [...new Set(shared)], notShared: [...new Set(notShared)] };
}

export function recommend(input, catalog = CATALOG) {
  const state = validateState(input);
  if (state.seeds.length === 0) return { ranked: [], uncertain: [], excluded: [], seeds: [] };
  if (!Array.isArray(catalog)) throw new TypeError("catalog must be an array");
  const games = new Map();
  for (const game of catalog) {
    if (!game || typeof game !== "object" || typeof game.id !== "string" || game.id.trim() === "") {
      throw new TypeError("catalog entries must have a non-empty canonical id");
    }
    if (games.has(game.id)) throw new Error(`Duplicate catalog ID: ${game.id}`);
    games.set(game.id, game);
  }
  for (const seed of state.seeds) {
    if (!games.has(seed.id)) throw new Error(`Seed ${seed.id} is unavailable in this catalog snapshot.`);
  }
  const evidence = new Map();
  const hidden = new Set(state.excluded);
  const candidates = catalog.map((game) => {
    const pairs = state.seeds.map((seed) => ({ id: seed.id, ...pairEvidence(game, games.get(seed.id)) }));
    evidence.set(game.id, pairs);
    return { id: game.id, affinities: Object.fromEntries(pairs.map((pair) => [pair.id, pair.affinity])),
      evidenceCoverage: Math.min(...pairs.map((pair) => pair.coverage)),
      hardConstraintState: hidden.has(game.id) ? "fail" : constraintState(game, state) };
  });
  const result = state.mode === "blend"
    ? blendCandidates(candidates, state.seeds, { lambda: state.lambda, limit: 6 })
    : rankCandidates(candidates, state.seeds, { mode: state.mode });
  return { ...result, ranked: result.ranked.slice(0, 6).map((item) => ({ ...item, evidence: evidence.get(item.id) })) };
}
