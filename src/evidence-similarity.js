// Experimental, offline-first similarity model. Not wired into the public player.
// Frozen tag weights are a per-game distribution, not crowdsourced popularity.
import { rankCandidates, blendCandidates } from "./ranking.js";

export const EVIDENCE_METHOD_VERSION = "weighted-tags-graph-experiment-1";
export const EVIDENCE_LANES = Object.freeze({ tags: 0.76, metadata: 0.13, direct: 0.08, twoHop: 0.03 });
const METADATA_WEIGHTS = Object.freeze({ franchise: 0.3, creator: 0.27, developer: 0.18,
  publisher: 0.12, releaseYear: 0.05, platforms: 0.08 });
const TAG_ID = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/;
const EDGE_TYPES = new Set(["similar", "inspired-by", "references"]);
const MAX_GAMES = 250;
const MAX_TAGS = 128;
const TWO_HOP_DECAY = 0.5;

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${label} must be a plain record`);
  }
  return value;
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be nonempty text`);
  return value;
}
function unit(value, label, allowZero = false) {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      value > 1 || (allowZero ? value < 0 : value <= 0)) {
    throw new RangeError(`${label} must be finite in ${allowZero ? "[0,1]" : "(0,1]"}`);
  }
  return value;
}
function canonicalId(value) {
  text(value, "game ID");
  if (!TAG_ID.test(value)) throw new TypeError(`noncanonical game ID: ${value}`);
  return value;
}
function property(value, label) {
  if (value === undefined || value === null) return null;
  const entry = record(value, label);
  const source = text(entry.source, `${label}.source`);
  if (!Object.hasOwn(entry, "value")) throw new TypeError(`${label}.value is required`);
  return { value: entry.value, source };
}
function normalizeMetadata(input, id) {
  const metadata = record(input ?? {}, `${id}.metadata`);
  for (const name of Object.keys(metadata)) {
    if (!Object.hasOwn(METADATA_WEIGHTS, name)) throw new TypeError(`unknown metadata field: ${name}`);
  }
  const result = {};
  for (const name of Object.keys(METADATA_WEIGHTS)) {
    const field = property(metadata[name], `${id}.${name}`);
    if (field !== null) {
      if (name === "releaseYear") {
        if (!Number.isInteger(field.value) || field.value < 1950 || field.value > 2100)
          throw new TypeError(`${id}.releaseYear must be a year`);
      } else if (name === "platforms") {
        if (!Array.isArray(field.value) || field.value.some(v => typeof v !== "string" || !v.trim()) ||
            new Set(field.value).size !== field.value.length) {
          throw new TypeError(`${id}.platforms must be unique strings`);
        }
        field.value = [...field.value].sort();
      } else text(field.value, `${id}.${name}.value`);
    }
    result[name] = field;
  }
  return result;
}
function normalizeProfile(input) {
  const game = record(input, "game");
  const id = canonicalId(game.id);
  let tags = null;
  if (game.tags !== undefined && game.tags !== null) {
    if (!Array.isArray(game.tags) || game.tags.length === 0 || game.tags.length > MAX_TAGS)
      throw new TypeError(`${id}.tags must have 1-${MAX_TAGS} entries or be null`);
    const seen = new Set();
    tags = game.tags.map((item) => {
      const tag = record(item, `${id}.tag`);
      const key = text(tag.id, `${id}.tag.id`);
      if (!TAG_ID.test(key) || key.length > 96) throw new TypeError(`invalid tag ID: ${key}`);
      if (seen.has(key)) throw new TypeError(`duplicate tag: ${id}/${key}`);
      seen.add(key);
      return { id: key, weight: unit(tag.weight, `${id}/${key}.weight`), source: text(tag.source, `${id}/${key}.source`) };
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const total = tags.reduce((sum, tag) => sum + tag.weight, 0);
    if (Math.abs(total - 1) > 1e-9) throw new RangeError(`tag weights for ${id} must sum to 1; got ${total}`);
  }
  // Legacy complete fixtures retain their existing scoring behavior.
  // Reviewed, selected-fact snapshots must explicitly opt into partial coverage.
  if (game.tagCoverage !== undefined && !["complete", "partial"].includes(game.tagCoverage))
    throw new TypeError(`${id}.tagCoverage must be complete or partial`);
  if (tags === null && game.tagCoverage !== undefined)
    throw new TypeError(`${id}.tagCoverage requires observed tags`);
  const tagCoverage = tags === null ? "unknown" : (game.tagCoverage ?? "complete");
  const metadata = normalizeMetadata(game.metadata, id);
  const coop = game.coop === undefined ? null : game.coop;
  if (coop !== null && typeof coop !== "boolean") throw new TypeError(`${id}.coop must be boolean or null`);
  if (coop !== null) text(game.coopSource, `${id}.coopSource`);
  return { id, tags, tagCoverage, metadata, coop };
}
function pairKey(a, b) { return JSON.stringify(a < b ? [a, b] : [b, a]); }

export function prepareEvidenceModel({ games, relations = [] } = {}) {
  if (!Array.isArray(games) || games.length === 0 || games.length > MAX_GAMES)
    throw new TypeError(`games must contain 1-${MAX_GAMES} profiles`);
  const profiles = new Map();
  for (const input of games) {
    const game = normalizeProfile(input);
    if (profiles.has(game.id)) throw new TypeError(`duplicate game: ${game.id}`);
    profiles.set(game.id, game);
  }
  if (!Array.isArray(relations) || relations.length > 4096) throw new TypeError("invalid relation list");
  const edges = new Map([...profiles.keys()].map(id => [id, new Map()]));
  const seen = new Set();
  for (const input of relations) {
    const relation = record(input, "relation");
    const from = canonicalId(relation.from), to = canonicalId(relation.to);
    if (!profiles.has(from) || !profiles.has(to) || from === to)
      throw new TypeError(`relation endpoints must be distinct catalog games: ${from} -> ${to}`);
    if (!EDGE_TYPES.has(relation.type)) throw new TypeError(`unsupported relation type: ${relation.type}`);
    const strength = unit(relation.strength, "relation.strength");
    const source = text(relation.source, "relation.source");
    const key = pairKey(from, to);
    if (seen.has(key)) throw new TypeError(`duplicate pair relation: ${key}`);
    seen.add(key);
    const edge = { from, to, type: relation.type, strength, source };
    // Affinity works both ways; the causal claim still points from -> to.
    edges.get(from).set(to, edge);
    edges.get(to).set(from, edge);
  }
  return { version: EVIDENCE_METHOD_VERSION, profiles, edges };
}

function unmatchedTagMass(tags, otherById) {
  // Also expose unequal emphasis on a tag shared by two known vectors.
  return tags.flatMap(tag => {
    const matched = Math.min(tag.weight, otherById.get(tag.id)?.weight ?? 0);
    const mass = tag.weight - matched;
    return mass > 0 ? [{ id: tag.id, mass, source: tag.source }] : [];
  });
}
function tagEvidence(a, b) {
  if (a.tags === null || b.tags === null) {
    return { coverage: "unknown", similarity: null, observedOverlap: null,
      shared: [], leftOnly: null, rightOnly: null };
  }
  const left = new Map(a.tags.map(tag => [tag.id, tag]));
  const right = new Map(b.tags.map(tag => [tag.id, tag]));
  const shared = a.tags.filter(tag => right.has(tag.id)).map(tag => {
    const other = right.get(tag.id);
    return { id: tag.id, mass: Math.min(tag.weight, other.weight), sources: [tag.source, other.source] };
  });
  const observedOverlap = shared.reduce((sum, item) => sum + item.mass, 0);
  // Selected facts are not exhaustive observations. Positive shared facts can be
  // reported, but neither missing facts nor remaining weight prove a mismatch.
  // Even a positive selected-fact overlap is not a calibrated full-game affinity.
  if (a.tagCoverage === "partial" || b.tagCoverage === "partial") {
    return { coverage: "partial", similarity: null, observedOverlap,
      shared, leftOnly: null, rightOnly: null };
  }
  return {
    coverage: "complete", similarity: observedOverlap, observedOverlap, shared,
    leftOnly: unmatchedTagMass(a.tags, right),
    rightOnly: unmatchedTagMass(b.tags, left),
  };
}
function secondaryEvidence(a, b) {
  let score = 0, coverage = 0;
  const matches = [];
  for (const [key, weight] of Object.entries(METADATA_WEIGHTS)) {
    const left = a.metadata[key], right = b.metadata[key];
    if (left === null || right === null) continue;
    coverage += weight;
    let match = 0;
    if (key === "platforms") {
      const leftSet = new Set(left.value), rightSet = new Set(right.value);
      const both = [...leftSet].filter(v => rightSet.has(v));
      const unionSize = new Set([...leftSet, ...rightSet]).size;
      match = unionSize ? both.length / unionSize : 0;
    } else if (key === "releaseYear") match = Number(left.value === right.value);
    else match = Number(left.value.trim().toLowerCase() === right.value.trim().toLowerCase());
    if (match > 0) matches.push({ field: key, contribution: match * weight, sources: [left.source, right.source] });
    score += match * weight;
  }
  return { similarity: coverage ? score : null, coverage, matches };
}
function relationEvidence(model, a, b) {
  const direct = model.edges.get(a.id).get(b.id) ?? null;
  if (direct) return { direct, twoHop: null };
  let strongest = null;
  // Only *curated, sourced* relations participate; never diffuse inferred tag neighbors.
  for (const [middle, first] of model.edges.get(a.id)) {
    if (middle === b.id) continue;
    const second = model.edges.get(middle).get(b.id);
    if (!second) continue;
    const strength = first.strength * second.strength * TWO_HOP_DECAY;
    if (!strongest || strength > strongest.strength ||
        (strength === strongest.strength && middle < strongest.via)) {
      // Symmetric affinity never reverses the authored relation claim.
      const hops = [first, second].map(edge => ({
        from: edge.from, to: edge.to, type: edge.type,
        strength: edge.strength, source: edge.source,
      }));
      strongest = { via: middle, strength, sources: hops.map(hop => hop.source), hops };
    }
  }
  return { direct: null, twoHop: strongest };
}
// Presence of an independently sourced relation is known even when tag
// observations are partial. Coverage measures observed lanes, not fit,
// confidence, or proof that an absent edge/attribute is a negative fact.
function observedLaneCoverage(tags, metadata, relations) {
  const lanes = {
    tags: tags.coverage === "complete" ? EVIDENCE_LANES.tags : 0,
    metadata: EVIDENCE_LANES.metadata * metadata.coverage,
    direct: relations.direct ? EVIDENCE_LANES.direct : 0,
    twoHop: relations.twoHop ? EVIDENCE_LANES.twoHop : 0,
  };
  return { lanes, total: Object.values(lanes).reduce((sum, value) => sum + value, 0) };
}

export function compareEvidenceGames(model, leftId, rightId) {
  const a = model.profiles.get(leftId), b = model.profiles.get(rightId);
  if (!a || !b) throw new TypeError("comparison references a missing game");
  const tags = tagEvidence(a, b);
  const metadata = secondaryEvidence(a, b);
  const relations = relationEvidence(model, a, b);
  const observedCoverage = observedLaneCoverage(tags, metadata, relations);
  if (tags.similarity === null) {
    return { status: "uncertain", affinity: null, reason: tags.coverage === "partial" ? "partial-weighted-tags" : "missing-weighted-tags",
      tags, metadata, relations,
      evidenceCoverage: observedCoverage.total, evidenceCoverageByLane: observedCoverage.lanes };
  }
  const direct = relations.direct?.strength ?? 0;
  const twoHop = relations.twoHop?.strength ?? 0;
  const affinity = EVIDENCE_LANES.tags * tags.similarity +
    EVIDENCE_LANES.metadata * (metadata.similarity ?? 0) +
    EVIDENCE_LANES.direct * direct + EVIDENCE_LANES.twoHop * twoHop;
  return { status: "rankable", affinity: Math.min(1, affinity), reason: null,
    tags, metadata, relations, evidenceCoverage: observedCoverage.total,
    evidenceCoverageByLane: observedCoverage.lanes };
}
function eligible(game, { platform, coopOnly, excluded }) {
  if (excluded.has(game.id)) return "fail";
  let unknown = false;
  if (platform !== "any") {
    const value = game.metadata.platforms?.value;
    if (value === undefined) unknown = true;
    else if (!value.includes(platform)) return "fail";
  }
  if (coopOnly) {
    if (game.coop === false) return "fail";
    if (game.coop === null) unknown = true;
  }
  return unknown ? "unknown" : "pass";
}
export function rankEvidenceBasket(model, { seeds, mode = "intersection", lambda = 0.3,
  limit = 6, platform = "any", coopOnly = false, excluded = [] } = {}) {
  if (!Array.isArray(seeds) || !seeds.length || seeds.some(seed => !model.profiles.has(seed?.id)))
    throw new TypeError("seeds must reference known catalog games");
  if (typeof platform !== "string" || !platform || typeof coopOnly !== "boolean" ||
      !Array.isArray(excluded) || new Set(excluded).size !== excluded.length ||
      excluded.some(id => !model.profiles.has(id))) throw new TypeError("invalid hard filters");
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("limit must be a nonnegative integer");
  const hidden = new Set(excluded);
  const evidence = new Map();
  const candidates = [...model.profiles.values()].map(game => {
    const pairs = seeds.map(seed => ({ seedId: seed.id, ...compareEvidenceGames(model, game.id, seed.id) }));
    evidence.set(game.id, pairs);
    return { id: game.id, affinities: Object.fromEntries(pairs.map(pair => [pair.seedId, pair.affinity])),
      evidenceCoverage: Math.min(...pairs.map(pair => pair.evidenceCoverage)),
      hardConstraintState: eligible(game, { platform, coopOnly, excluded: hidden }) };
  });
  const result = mode === "blend" ? blendCandidates(candidates, seeds, { lambda, limit })
    : rankCandidates(candidates, seeds, { mode });
  return { ...result, method: EVIDENCE_METHOD_VERSION,
    ranked: result.ranked.slice(0, limit).map(item => ({ ...item, evidence: evidence.get(item.id) })) };
}
