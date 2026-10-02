import { blendCandidates, rankCandidates } from "./ranking.js";

// Authored, fictional profiles. No commercial catalog, artwork, or API data.
export const CATALOG_VERSION = "synthetic-demo-1";
export const METHOD_VERSION = "feature-overlap-1";
export const DEMO_MODES = ["intersection", "blend", "arithmetic"];
export const PLATFORMS = ["any", "windows", "linux", "mac"];
export const FEATURE_GROUPS = [{ key: "mechanics", weight: 0.7 }, { key: "themes", weight: 0.3 }];
const profile = (id, name, description, mechanics, themes, platforms, coop) =>
  ({ id: `demo:${id}`, name, description, mechanics, themes, platforms, coop });
export const CATALOG = [
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
for (const game of CATALOG) {
  for (const key of ["mechanics", "themes", "platforms"]) if (game[key]) Object.freeze(game[key]);
  Object.freeze(game);
}
Object.freeze(CATALOG);
export const BY_ID = new Map(CATALOG.map((game) => [game.id, game]));

export function initialState() {
  return { v: 1, catalog: CATALOG_VERSION, method: METHOD_VERSION, mode: "intersection",
    seeds: [{ id: "demo:ember", weight: 1 }, { id: "demo:harvest", weight: 1 }],
    platform: "any", coopOnly: false, lambda: 0.3, excluded: [] };
}

export function validateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid basket state.");
  if (value.v !== 1 || value.catalog !== CATALOG_VERSION || value.method !== METHOD_VERSION) {
    throw new Error("This link uses an unavailable catalog or method version. It was not silently upgraded.");
  }
  if (!DEMO_MODES.includes(value.mode)) throw new Error("Unsupported recommendation mode.");
  if (!PLATFORMS.includes(value.platform) || typeof value.coopOnly !== "boolean") throw new Error("Invalid hard constraints.");
  if (typeof value.lambda !== "number" || !Number.isFinite(value.lambda) || value.lambda < 0 || value.lambda > 1) throw new Error("Blend balance must be between 0 and 1.");
  if (!Array.isArray(value.seeds) || value.seeds.length > 5) throw new Error("A basket supports up to five games.");
  const seen = new Set();
  const seeds = value.seeds.map((seed) => {
    if (!seed || !BY_ID.has(seed.id) || seen.has(seed.id)) throw new Error("Unknown or duplicate seed ID.");
    if (!Number.isInteger(seed.weight) || seed.weight < 1 || seed.weight > 10) throw new Error("Seed weights must be integers from 1 to 10.");
    seen.add(seed.id);
    return { id: seed.id, weight: seed.weight };
  });
  if (!Array.isArray(value.excluded) || value.excluded.length > CATALOG.length || value.excluded.some((id) => !BY_ID.has(id)) || new Set(value.excluded).size !== value.excluded.length) {
    throw new Error("Invalid excluded game IDs.");
  }
  return { v: 1, catalog: CATALOG_VERSION, method: METHOD_VERSION, mode: value.mode, seeds,
    platform: value.platform, coopOnly: value.coopOnly, lambda: value.lambda, excluded: [...value.excluded] };
}

export function encodeState(state) {
  return `#basket=${encodeURIComponent(JSON.stringify(validateState(state)))}`;
}
export function decodeState(hash) {
  if (!hash) return initialState();
  if (!hash.startsWith("#basket=") || hash.length > 6000) throw new Error("Unrecognized or oversized basket link.");
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
  const games = new Map(catalog.map((game) => [game.id, game]));
  const evidence = new Map();
  const hidden = new Set(state.excluded);
  const candidates = catalog.map((game) => {
    const pairs = state.seeds.map((seed) => ({ id: seed.id, ...pairEvidence(game, games.get(seed.id) ?? BY_ID.get(seed.id)) }));
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
