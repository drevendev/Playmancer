// Experimental, offline-first similarity model. Not wired into the public player.
// Frozen tag weights are a per-game distribution, not crowdsourced popularity.
import { rankCandidates, blendCandidates, normalizeSeeds } from "./ranking.js";

export const EVIDENCE_METHOD_VERSION = "weighted-tags-graph-experiment-10";
export const EVIDENCE_LANES = Object.freeze({ tags: 0.76, metadata: 0.13, direct: 0.08, twoHop: 0.03 });
const METADATA_WEIGHTS = Object.freeze({ franchise: 0.3, creator: 0.27, developer: 0.18,
  publisher: 0.12, releaseYear: 0.05, platforms: 0.08 });
const TAG_ID = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/;
// `any` belongs to a basket filter, never to a source-backed game platform.
const PLATFORM_ID = /^[a-z][a-z0-9-]*$/;
const EDGE_TYPES = new Set(["similar", "inspired-by", "references"]);
const MAX_GAMES = 250;
const MAX_TAGS = 128;
// Nested caller-provided arrays must also be bounded before reading any slots.
const MAX_OBSERVED_PLATFORMS = 250;
const MAX_RAW_BASKET_ITEMS = 250;
const TWO_HOP_DECAY = 0.5;

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${label} must be a plain record`);
  }
  return value;
}
// Typos in observation keys must not silently upgrade selected facts to
// complete affinity vectors (notably misspelled tagCoverage).
const GAME_FIELDS = new Set(["id", "tags", "tagCoverage", "metadata", "coop", "coopSource"]);
const TAG_FIELDS = new Set(["id", "weight", "source"]);
// Before the taxonomy projection required an explicit coverage marker, the
// scorer accepted implicit completeness for *fictional fixtures*. Preserve only
// these unmistakable legacy fixture receipts; an observed external source may
// not silently become a complete whole-game weighted-tag distribution.
const LEGACY_FIXTURE_TAG_SOURCE = /^(?:authored-fixture|authored-fictional-fixture|playmancer:authored-fictional-fixture|playmancer:fictional-capacity-fixture|fixture:[a-z0-9-]+)$/;
const MODEL_FIELDS = new Set(["games", "relations"]);
const FIELD_RECEIPT_FIELDS = new Set(["value", "source"]);
const RELATION_FIELDS = new Set(["from", "to", "type", "strength", "source"]);
function rejectUnknownFields(input, allowed, label) {
  // Enumerable-only inspection silently drops hidden/symbol keys. Ordinary
  // property reads also consult Object.prototype for allowlisted evidence keys.
  for (const field of Reflect.ownKeys(input)) {
    if (!allowed.has(field)) throw new TypeError(`unknown ${label} field: ${String(field)}`);
  }
  for (const field of allowed) {
    if (field in input && !Object.hasOwn(input, field))
      throw new TypeError(`inherited ${label} field: ${field}`);
  }
}
// Snapshot only own, dense data slots: iterators, accessors and inherited
// numeric values cannot change which sourced observations are consumed.
function denseIndexSnapshot(value, expectedLength, maxLength = Number.MAX_SAFE_INTEGER) {
  if (!Array.isArray(value)) return null;
  // A Proxy may change its reported length between validation and copying.
  // Capture it once, or reuse the exact bounded length already validated.
  const length = expectedLength === undefined ? value.length : expectedLength;
  if (!Number.isSafeInteger(length) || length < 0 || length > maxLength) return null;
  const items = [];
  for (let index = 0; index < length; index++) {
    const slot = Object.getOwnPropertyDescriptor(value, index);
    if (!slot || !Object.hasOwn(slot, "value")) return null;
    items.push(slot.value);
  }
  return items;
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
function property(value, label, receiptContext) {
  if (value === undefined || value === null) return null;
  const entry = record(value, label);
  rejectUnknownFields(entry, FIELD_RECEIPT_FIELDS, label);
  const source = observationReceipt(entry.source, `${label}.source`, receiptContext);
  if (!Object.hasOwn(entry, "value")) throw new TypeError(`${label}.value is required`);
  return { value: entry.value, source };
}
function normalizeMetadata(input, id) {
  const metadata = record(input ?? {}, `${id}.metadata`);
  rejectUnknownFields(metadata, new Set(Object.keys(METADATA_WEIGHTS)), `${id}.metadata`);
  const result = {};
  for (const name of Object.keys(METADATA_WEIGHTS)) {
    const field = property(metadata[name], `${id}.${name}`,
      { gameId: id, scope: name === "platforms" ? "platforms" : null });
    if (field !== null) {
      if (name === "releaseYear") {
        if (!Number.isInteger(field.value) || field.value < 1950 || field.value > 2100)
          throw new TypeError(`${id}.releaseYear must be a year`);
      } else if (name === "platforms") {
        const platforms = denseIndexSnapshot(field.value, undefined, MAX_OBSERVED_PLATFORMS);
        if (!platforms || platforms.length === 0 ||
            platforms.some(v => typeof v !== "string" || v.length > 32 ||
              !PLATFORM_ID.test(v) || v === "any") ||
            new Set(platforms).size !== platforms.length) {
          throw new TypeError(`${id}.platforms must be nonempty unique canonical IDs (not 'any')`);
        }
        field.value = platforms.sort();
      } else text(field.value, `${id}.${name}.value`);
    }
    result[name] = field;
  }
  return result;
}
function normalizeProfile(input) {
  const game = record(input, "game");
  rejectUnknownFields(game, GAME_FIELDS, "game");
  const id = canonicalId(game.id);
  let tags = null;
  if (game.tags !== undefined && game.tags !== null) {
    const entries = denseIndexSnapshot(game.tags, undefined, MAX_TAGS);
    if (!entries || entries.length === 0 || entries.length > MAX_TAGS)
      throw new TypeError(`${id}.tags must have 1-${MAX_TAGS} entries or be null`);
    const seen = new Set();
    tags = entries.map((item) => {
      const tag = record(item, `${id}.tag`);
      rejectUnknownFields(tag, TAG_FIELDS, `${id}.tag`);
      const key = text(tag.id, `${id}.tag.id`);
      if (!TAG_ID.test(key) || key.length > 96) throw new TypeError(`invalid tag ID: ${key}`);
      if (seen.has(key)) throw new TypeError(`duplicate tag: ${id}/${key}`);
      seen.add(key);
      return { id: key, weight: unit(tag.weight, `${id}/${key}.weight`), source: observationReceipt(tag.source, `${id}/${key}.source`,
        { gameId: id, scope: "themes" }) };
    }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    const total = tags.reduce((sum, tag) => sum + tag.weight, 0);
    if (Math.abs(total - 1) > 1e-9) throw new RangeError(`tag weights for ${id} must sum to 1; got ${total}`);
  }
  // Legacy complete fixtures retain their existing scoring behavior.
  // Reviewed, selected-fact snapshots must explicitly opt into partial coverage.
  // External/editorial receipts must declare their evidence completeness. The
  // legacy default is permitted only for clearly marked fictional test data.
  if (tags !== null && !Object.hasOwn(game, "tagCoverage") &&
      !tags.every(tag => LEGACY_FIXTURE_TAG_SOURCE.test(tag.source))) {
    throw new TypeError(`${id}.tagCoverage must explicitly be complete or partial for sourced tags`);
  }
  if (game.tagCoverage !== undefined && !["complete", "partial"].includes(game.tagCoverage))
    throw new TypeError(`${id}.tagCoverage must be complete or partial`);
  if (tags === null && game.tagCoverage !== undefined)
    throw new TypeError(`${id}.tagCoverage requires observed tags`);
  const tagCoverage = tags === null ? "unknown" : (game.tagCoverage ?? "complete");
  const metadata = normalizeMetadata(game.metadata, id);
  const coop = game.coop === undefined ? null : game.coop;
  if (coop !== null && typeof coop !== "boolean") throw new TypeError(`${id}.coop must be boolean or null`);
  // An unattached receipt must not be silently discarded as if it validated a
  // missing co-op observation. Preserve unknown, but reject contradictory input.
  if (coop === null && game.coopSource != null)
    throw new TypeError(`${id}.coopSource requires a recorded co-op value`);
  const coopSource = coop !== null ? relationReceipt(game.coopSource, `${id}.coopSource`, true) : null;
  return { id, tags, tagCoverage, metadata, coop, coopSource };
}
// A public editorial graph edge needs an inspectable HTTPS receipt. The only
// non-web marker is explicitly fictional, so test relations cannot be mistaken
// for independently verified real-game links. Syntax is not rights verification.
const FICTIONAL_RELATION_RECEIPT = "playmancer:authored-fictional-fixture";
// Legacy fixture receipts are explicitly marked as fixtures, not public claims.
// Preserve deterministic offline Bridge/capacity tests without admitting opaque
// labels as supposedly inspectable editorial sources.
const FICTIONAL_TEST_RECEIPT = /^(?:fixture:[a-z0-9-]+|playmancer:fictional-capacity-fixture)$/;
// A claimed positive/negative co-op observation can decide strict eligibility.
// Require an inspectable public receipt, not an opaque editorial note. The only
// non-HTTPS exceptions are unmistakably fictional fixture identifiers.
function relationReceipt(value, label = "relation.source", allowLegacyFixture = false) {
  const source = text(value, label);
  if (source === FICTIONAL_RELATION_RECEIPT || FICTIONAL_TEST_RECEIPT.test(source) ||
      (allowLegacyFixture && LEGACY_FIXTURE_TAG_SOURCE.test(source))) return source;
  const invalid = () => new TypeError(`${label} must be a public HTTPS URL or an authored fictional fixture`);
  let url;
  try { url = new URL(source); } catch { throw invalid(); }
  // Reject reserved and malformed DNS names; a syntactically valid HTTPS URL
  // need not have a publicly inspectable origin. This does not perform DNS or
  // establish a receipt's truth, provenance, or redistribution rights.
  const host = url.hostname.toLowerCase();
  const labels = host.split(".");
  const dnsShaped = host.length <= 253 && labels.length >= 2 &&
    labels.every(label => label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
  const reservedSuffix = ["localhost", "local", "internal", "test", "invalid",
    "example", "arpa", "onion"].includes(labels.at(-1));
  const reservedExample = ["example.com", "example.net", "example.org"]
    .some(domain => host === domain || host.endsWith("." + domain));
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      !dnsShaped || reservedSuffix || reservedExample ||
      /^[0-9.]+$/.test(host) || host.startsWith("[") || /\s/.test(source)) {
    throw invalid();
  }
  return source;
}
// Field/tag observations can influence ranking or strict eligibility. Accept
// inspectable public HTTPS receipts and unmistakably fictional fixtures only.
// The frozen 30-game genre proxy appends a *versioned provenance annotation*
// after its public URL. Preserve that historical receipt verbatim, but validate
// the link portion independently; arbitrary notes must not masquerade as URLs.
// This is syntax/inspectability validation, NOT a truth or rights attestation.
function observationReceipt(value, label, context) {
  const source = text(value, label);
  // Existing seed-dedup regression deliberately uses a non-public fixture label.
  // It is NOT in the implicit-complete legacy set: explicit coverage is required.
  if (source === "authored-regression-fixture") return source;
  const frozen = /^(https:\/\/[^ ]+) [(]frozen ([a-z0-9][a-z0-9._-]*) \/ ([a-z][a-z0-9-]*:[a-z0-9._-]+) \/ (themes|platforms)[)]$/.exec(source);
  // A frozen receipt is scoped to one canonical game and one observed field.
  // A valid source URL alone cannot justify borrowing another game's themes
  // or attaching a platform receipt to a taste tag (or scalar metadata).
  if (frozen && (!context || frozen[3] !== context.gameId || frozen[4] !== context.scope)) {
    throw new TypeError(`${label} frozen receipt must match game ID and observation scope`);
  }
  // A matching annotation is insufficient if its clickable Wikidata URL points
  // to another QID, an unrelated property, or a lookalike host. These frozen
  // proxy receipts are emitted by evidence-real-pilot.js in canonical form.
  if (frozen && frozen[3].startsWith("wikidata:")) {
    const qid = /^wikidata:q([1-9][0-9]*)$/.exec(frozen[3]);
    const expected = qid && `https://www.wikidata.org/wiki/Q${qid[1]}#${frozen[4] === "themes" ? "P136" : "P400"}`;
    if (frozen[1] !== expected) {
      throw new TypeError(`${label} frozen Wikidata URL must match game QID and observation field`);
    }
  }
  relationReceipt(frozen ? frozen[1] : source, label, true);
  return source;
}
function pairKey(a, b) { return JSON.stringify(a < b ? [a, b] : [b, a]); }

export function prepareEvidenceModel(input = {}) {
  const modelInput = record(input, "evidence model");
  rejectUnknownFields(modelInput, MODEL_FIELDS, "evidence model");
  const { games, relations = [] } = modelInput;
  // Validate one fixed count before any indexed descriptor reads; reuse it
  // during copying so a length-changing Proxy cannot expand the work bound.
  const gameCount = Array.isArray(games) ? games.length : 0;
  if (!Number.isSafeInteger(gameCount) || gameCount < 1 || gameCount > MAX_GAMES)
    throw new TypeError(`games must contain 1-${MAX_GAMES} profiles`);
  const gameList = denseIndexSnapshot(games, gameCount);
  if (!gameList) throw new TypeError(`games must contain 1-${MAX_GAMES} profiles`);
  const profiles = new Map();
  for (const input of gameList) {
    const game = normalizeProfile(input);
    if (profiles.has(game.id)) throw new TypeError(`duplicate game: ${game.id}`);
    profiles.set(game.id, game);
  }
  // Apply the same fixed-count guard to editorial edges.
  const relationCount = Array.isArray(relations) ? relations.length : -1;
  if (!Number.isSafeInteger(relationCount) || relationCount < 0 || relationCount > 4096)
    throw new TypeError("invalid relation list");
  const relationList = denseIndexSnapshot(relations, relationCount);
  if (!relationList) throw new TypeError("invalid relation list");
  const edges = new Map([...profiles.keys()].map(id => [id, new Map()]));
  const seen = new Set();
  for (const input of relationList) {
    const relation = record(input, "relation");
    rejectUnknownFields(relation, RELATION_FIELDS, "relation");
    const from = canonicalId(relation.from), to = canonicalId(relation.to);
    if (!profiles.has(from) || !profiles.has(to) || from === to)
      throw new TypeError(`relation endpoints must be distinct catalog games: ${from} -> ${to}`);
    if (!EDGE_TYPES.has(relation.type)) throw new TypeError(`unsupported relation type: ${relation.type}`);
    const strength = unit(relation.strength, "relation.strength");
    const source = relationReceipt(relation.source);
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
  let score = 0, coverage = 0, tasteCoverage = 0;
  const matches = [], recordedDifferences = [];
  for (const [key, weight] of Object.entries(METADATA_WEIGHTS)) {
    const left = a.metadata[key], right = b.metadata[key];
    if (left === null || right === null) continue;
    coverage += weight;
    let match = 0;
    if (key === "platforms") {
      // Storefront/platform records are positive observations, not exhaustive
      // compatibility lists. Jaccard penalized a game merely for having more
      // documented platforms, inventing negative evidence from absent receipts.
      // One observed shared platform is a bounded secondary match; zero only
      // means no shared platform was recorded, never proven incompatibility.
      const rightPlatforms = new Set(right.value);
      match = Number(left.value.some(value => rightPlatforms.has(value)));
    } else if (key === "releaseYear") match = Number(left.value === right.value);
    else match = Number(left.value.trim().toLowerCase() === right.value.trim().toLowerCase());
    if (match > 0) {
      matches.push({ field: key, contribution: match * weight, sources: [left.source, right.source] });
    } else if (key !== "platforms") {
      // Scalar metadata differs on two sourced observations. Unlike positive-only
      // platform lists, these values can be compared without inventing a missing
      // platform incompatibility. A difference is evidence, not a taste penalty.
      recordedDifferences.push({ field: key,
        left: { value: left.value, source: left.source },
        right: { value: right.value, source: right.source } });
    }
    score += match * weight;
    // Sourced differences, including scalar mismatches, are observed facts
    // rather than positive taste support. A mismatching receipt must not win
    // a ranking tie over an otherwise identical unknown observation.
    if (match > 0) tasteCoverage += weight;
  }
  return { similarity: coverage ? score : null, coverage, tasteCoverage, matches, recordedDifferences };
}
function relationEvidence(model, a, b, fitEligibleVia = null) {
  // A--B--A traverses the same undirected receipt twice. It is not an
  // independently observed two-hop relation from a game back to itself.
  // Preserve tag/metadata self-comparisons without inventing graph coverage.
  if (a.id === b.id) return { direct: null, twoHop: null, fitTwoHop: null };
  const direct = model.edges.get(a.id).get(b.id) ?? null;
  // Only direct taste similarity supersedes its transitive substitute.
  // A factual direct reference/inspiration can coexist with an independent
  // sourced two-hop similarity path; the fact itself adds no taste boost.
  // A sourced direct similarity supersedes transitive TASTE, but must not erase
  // independently observed explanatory routes (including factual crossovers).
  let strongest = null, strongestFit = null;
  // Route evidence can include reference/inspiration facts. Taste evidence can
  // use only sourced "similar" edges; a stronger reference path must never
  // eclipse an independently supported (weaker) similarity path.
  for (const [middle, first] of model.edges.get(a.id)) {
    if (middle === b.id) continue;
    const second = model.edges.get(middle).get(b.id);
    if (!second) continue;
    const strength = first.strength * second.strength * TWO_HOP_DECAY;
    // Preserve the sourced claim's authored arrow AND the direction in which
    // this candidate route actually traverses it. An inspiration/reference
    // receipt must never be silently described as the reverse causal claim.
    const hops = [
      { edge: first, traversedFrom: a.id, traversedTo: middle },
      { edge: second, traversedFrom: middle, traversedTo: b.id },
    ].map(({ edge, traversedFrom, traversedTo }) => ({
      from: edge.from, to: edge.to, type: edge.type,
      strength: edge.strength, source: edge.source,
      traversedFrom, traversedTo,
      traversalDirection: edge.from === traversedFrom ? "with-source" : "against-source",
    }));
    const candidate = { via: middle, strength, sources: hops.map(hop => hop.source), hops };
    const better = best => !best || strength > best.strength ||
      (strength === best.strength && middle < best.via);
    if (better(strongest)) strongest = candidate;
    if (direct?.type !== "similar" && first.type === "similar" && second.type === "similar" &&
        (fitEligibleVia === null || fitEligibleVia.has(middle)) && better(strongestFit))
      strongestFit = candidate;
  }
  return { direct, twoHop: strongest, fitTwoHop: strongestFit };
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
  // Factual reference/inspiration routes are sourced route evidence, not evidence
  // of taste fit. Ranking tie-breaks must not favor them over otherwise
  // identical candidates merely because a crossover receipt exists.
  const tasteLanes = {
    ...lanes,
    metadata: EVIDENCE_LANES.metadata * metadata.tasteCoverage,
    direct: relations.direct?.type === "similar" ? EVIDENCE_LANES.direct : 0,
    twoHop: relations.fitTwoHop ? EVIDENCE_LANES.twoHop : 0,
  };
  return { lanes, total: Object.values(lanes).reduce((sum, value) => sum + value, 0),
    tasteLanes, tasteTotal: Object.values(tasteLanes).reduce((sum, value) => sum + value, 0) };
}

export function compareEvidenceGames(model, leftId, rightId, { fitEligibleVia = null } = {}) {
  const a = model.profiles.get(leftId), b = model.profiles.get(rightId);
  if (!a || !b) throw new TypeError("comparison references a missing game");
  const tags = tagEvidence(a, b);
  const metadata = secondaryEvidence(a, b);
  const relations = relationEvidence(model, a, b, fitEligibleVia);
  const observedCoverage = observedLaneCoverage(tags, metadata, relations);
  if (tags.similarity === null) {
    return { status: "uncertain", affinity: null, reason: tags.coverage === "partial" ? "partial-weighted-tags" : "missing-weighted-tags",
      tags, metadata, relations,
      evidenceCoverage: observedCoverage.total, evidenceCoverageByLane: observedCoverage.lanes,
      tasteEvidenceCoverage: observedCoverage.tasteTotal,
      tasteEvidenceCoverageByLane: observedCoverage.tasteLanes };
  }
  // A documented crossover/reference or inspiration is route evidence, not
  // independently verified taste similarity. Only editorial "similar" edges
  // may increase the trial affinity; all receipt types remain explainable.
  // A direct similarity edge takes precedence over two-hop taste; factual direct
  // receipts do not suppress independently supported two-hop similarity.
  const direct = relations.direct?.type === "similar" ? relations.direct.strength : 0;
  const twoHop = relations.fitTwoHop?.strength ?? 0;
  const affinity = EVIDENCE_LANES.tags * tags.similarity +
    EVIDENCE_LANES.metadata * (metadata.similarity ?? 0) +
    EVIDENCE_LANES.direct * direct + EVIDENCE_LANES.twoHop * twoHop;
  return { status: "rankable", affinity: Math.min(1, affinity), reason: null,
    tags, metadata, relations, evidenceCoverage: observedCoverage.total,
    evidenceCoverageByLane: observedCoverage.lanes,
    tasteEvidenceCoverage: observedCoverage.tasteTotal,
    tasteEvidenceCoverageByLane: observedCoverage.tasteLanes };
}
// Separate recorded receipts from hard-filter eligibility. In particular,
// a positive-only platform list without the requested value is NOT evidence
// that the game cannot run there, even though it cannot satisfy the filter.
function explainHardConstraints(game, { platform, coopOnly, excluded }) {
  const platforms = game.metadata.platforms;
  const platformEvidence = platform === "any"
    ? { requested: null, status: "not-required", recorded: null, source: null }
    : platforms === null
      ? { requested: platform, status: "unknown", recorded: null, source: null }
      : { requested: platform,
        status: platforms.value.includes(platform) ? "recorded-support" : "no-matching-receipt",
        recorded: [...platforms.value], source: platforms.source };
  const coopEvidence = !coopOnly
    ? { requested: false, status: "not-required", source: null }
    : { requested: true,
      status: game.coop === null ? "unknown" : game.coop ? "recorded-yes" : "recorded-no",
      source: game.coopSource };
  return { excludedByUser: excluded.has(game.id), platform: platformEvidence, coop: coopEvidence };
}
function eligible(game, { platform, coopOnly, excluded }) {
  if (excluded.has(game.id)) return "fail";
  let unknown = false;
  if (platform !== "any") {
    const value = game.metadata.platforms?.value;
    // Platform lists document positive support, not exhaustive availability.
    // A missing requested receipt must abstain, never assert incompatibility.
    if (value === undefined || !value.includes(platform)) unknown = true;
  }
  if (coopOnly) {
    if (game.coop === false) return "fail";
    if (game.coop === null) unknown = true;
  }
  return unknown ? "unknown" : "pass";
}
const BASKET_FIELDS = new Set(["seeds", "mode", "lambda", "limit", "platform", "coopOnly", "excluded"]);
const BASKET_SEED_FIELDS = new Set(["id", "weight"]);
export function rankEvidenceBasket(model, options = {}) {
  // Unknown controls, especially misspelled hard filters, must not silently
  // become an unconstrained recommendation request.
  const input = record(options, "basket options");
  rejectUnknownFields(input, BASKET_FIELDS, "basket option");
  const { seeds, mode = "intersection", lambda = 0.3,
    limit = 6, platform = "any", coopOnly = false, excluded = [] } = input;
  // Bound raw lists before Proxy/index reads; active favorites remain capped at five.
  const seedList = denseIndexSnapshot(seeds, undefined, MAX_RAW_BASKET_ITEMS);
  if (!seedList || !seedList.length)
    throw new TypeError("seeds must reference known catalog games");
  // Validate once and consume only own data fields: getter-backed IDs or
  // weights must not change after membership validation, before ranking.
  const checkedSeeds = seedList.map(seed => {
    const entry = record(seed, "basket seed");
    rejectUnknownFields(entry, BASKET_SEED_FIELDS, "basket seed");
    const id = Object.getOwnPropertyDescriptor(entry, "id");
    const weight = Object.getOwnPropertyDescriptor(entry, "weight");
    if (!id || !Object.hasOwn(id, "value") ||
        (weight && !Object.hasOwn(weight, "value"))) {
      throw new TypeError("basket seed id/weight must be own data fields");
    }
    if (!model.profiles.has(id.value))
      throw new TypeError("seeds must reference known catalog games");
    return weight ? { id: id.value, weight: weight.value } : { id: id.value };
  });
  const exclusionIds = denseIndexSnapshot(excluded, undefined, MAX_RAW_BASKET_ITEMS);
  if (typeof platform !== "string" || (platform !== "any" &&
      (platform.length > 32 || !PLATFORM_ID.test(platform))) || typeof coopOnly !== "boolean" ||
      !exclusionIds || new Set(exclusionIds).size !== exclusionIds.length ||
      exclusionIds.some(id => !model.profiles.has(id))) throw new TypeError("invalid hard filters");
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("limit must be a nonnegative integer");
  // Build pair evidence from the same positive-weight, deduplicated basket used
  // by the scalar/Blend ranker. Zero-weight or repeated inputs are not seeds
  // for coverage, explanations, or eligibility.
  const activeSeeds = normalizeSeeds(checkedSeeds);
  // Keep the experimental ranker within the same one-to-five *active*
  // favorites contract as the player. Duplicate IDs and zero-weight entries
  // are normalized before checking, so inert inputs cannot change the basket.
  // This also bounds pairwise evidence work before a future browser rollout.
  if (activeSeeds.length > 5) throw new RangeError("at most five active favorites are supported");
  const hidden = new Set(exclusionIds);
  // A selected favorite cannot simultaneously be a hard-excluded candidate.
  // Check the normalized active basket so inert zero-weight entries stay inert.
  if (activeSeeds.some(seed => hidden.has(seed.id))) {
    throw new TypeError("active favorites cannot be explicitly excluded");
  }
  // A basket cannot borrow two-hop taste evidence through a game that fails
  // its hard filters, is explicitly excluded, or has unknown required metadata.
  // Raw sourced routes remain observable but cannot enter fit or its tie-break.
  const eligibility = new Map([...model.profiles.values()].map(game => [game.id,
    eligible(game, { platform, coopOnly, excluded: hidden })]));
  const fitEligibleVia = new Set([...eligibility].filter(([, state]) => state === "pass")
    .map(([id]) => id));
  const filterEvidence = new Map([...model.profiles.values()].map(game =>
    [game.id, explainHardConstraints(game, { platform, coopOnly, excluded: hidden })]));
  const evidence = new Map();
  const candidates = [...model.profiles.values()].map(game => {
    const pairs = activeSeeds.map(seed => ({ seedId: seed.id,
      ...compareEvidenceGames(model, game.id, seed.id, { fitEligibleVia }) }));
    evidence.set(game.id, pairs);
    return { id: game.id, affinities: Object.fromEntries(pairs.map(pair => [pair.seedId, pair.affinity])),
      // The scalar/Blend rankers use coverage as a deterministic tie-break:
      // use only taste-comparable evidence, not unrelated factual graph routes.
      evidenceCoverage: Math.min(...pairs.map(pair => pair.tasteEvidenceCoverage)),
      hardConstraintState: eligibility.get(game.id) };
  });
  const result = mode === "blend" ? blendCandidates(candidates, activeSeeds, { lambda, limit })
    : rankCandidates(candidates, activeSeeds, { mode });
  // Abstention is the primary result for partial semantic profiles. Expose the
  // same per-seed receipts and lane coverage as ranked candidates so callers
  // can distinguish observed overlap, missing tags, and unknown hard filters
  // without promoting selected facts into a fabricated affinity.
  const withEvidence = item => ({ ...item, evidence: evidence.get(item.id),
    hardConstraintEvidence: filterEvidence.get(item.id) });
  return { ...result, method: EVIDENCE_METHOD_VERSION,
    ranked: result.ranked.slice(0, limit).map(withEvidence),
    uncertain: result.uncertain.map(withEvidence),
    excluded: result.excluded.map(withEvidence) };
}
