// Offline v2 Bridge primitive: traverses only authored, sourced graph edges.
// Not integrated with the live player or the legacy Bridge scorer.
export const CURATED_BRIDGE_VERSION = "curated-bridge-routes-1";
const TWO_HOP_DECAY = 0.5;

function requireModel(model) {
  if (!(model?.profiles instanceof Map) || !(model.edges instanceof Map)) {
    throw new TypeError("expected a prepared evidence model");
  }
}
function constraintState(profile, platform, coopOnly, excluded) {
  if (excluded.has(profile.id)) return "fail";
  let unknown = false;
  if (platform !== "any") {
    const observed = profile.metadata.platforms?.value;
    if (observed == null) unknown = true;
    else if (!observed.includes(platform)) return "fail";
  }
  if (coopOnly) {
    if (profile.coop === false) return "fail";
    if (profile.coop === null) unknown = true;
  }
  return unknown ? "unknown" : "pass";
}
function hop(edge, travelFrom, travelTo) {
  return {
    travelFrom, travelTo,
    authoredFrom: edge.from, authoredTo: edge.to,
    type: edge.type, strength: edge.strength, source: edge.source,
  };
}
function response(from, to, status, reason, nodes = [], hops = [], evidenceStrength = null,
  unknownIntermediates = []) {
  return {
    method: CURATED_BRIDGE_VERSION, from, to, status, reason,
    nodes, hops, evidenceStrength, unknownIntermediates,
  };
}

// Favor an authored direct connection over a transitive explanation. If no
// direct edge exists, choose the strongest eligible two-hop path, breaking
// exact ties by canonical middle ID. No tag/metadata affinity creates edges.
export function findCuratedBridge(model, {
  from, to, platform = "any", coopOnly = false, excluded = [],
} = {}) {
  requireModel(model);
  if (typeof from !== "string" || typeof to !== "string" ||
      !model.profiles.has(from) || !model.profiles.has(to) || from === to) {
    throw new TypeError("Bridge endpoints must be two distinct catalog IDs");
  }
  if (typeof platform !== "string" || !platform.trim() ||
      typeof coopOnly !== "boolean" || !Array.isArray(excluded) ||
      new Set(excluded).size !== excluded.length ||
      excluded.some(id => !model.profiles.has(id))) {
    throw new TypeError("invalid Bridge hard constraints or exclusions");
  }
  const hidden = new Set(excluded);
  const left = constraintState(model.profiles.get(from), platform, coopOnly, hidden);
  const right = constraintState(model.profiles.get(to), platform, coopOnly, hidden);
  if (left === "fail" || right === "fail") {
    return response(from, to, "excluded", "endpoint-hard-constraint-fail");
  }
  if (left === "unknown" || right === "unknown") {
    return response(from, to, "uncertain", "endpoint-required-metadata-unknown");
  }

  const direct = model.edges.get(from).get(to);
  if (direct) {
    return response(from, to, "route", null, [from, to], [hop(direct, from, to)],
      direct.strength);
  }

  let best = null;
  const unknownIntermediates = [];
  for (const [via, first] of model.edges.get(from)) {
    if (via === from || via === to) continue;
    const second = model.edges.get(via)?.get(to);
    if (!second) continue;
    const state = constraintState(model.profiles.get(via), platform, coopOnly, hidden);
    if (state === "unknown") {
      unknownIntermediates.push(via);
      continue;
    }
    if (state === "fail") continue;
    const strength = TWO_HOP_DECAY * first.strength * second.strength;
    if (!best || strength > best.strength ||
        (strength === best.strength && via < best.via)) {
      best = { via, strength, first, second };
    }
  }
  if (best) {
    return response(from, to, "route", null, [from, best.via, to],
      [hop(best.first, from, best.via), hop(best.second, best.via, to)],
      best.strength);
  }
  if (unknownIntermediates.length) {
    return response(from, to, "uncertain", "intermediate-required-metadata-unknown",
      [], [], null, unknownIntermediates.sort());
  }
  return response(from, to, "no-route", "no-eligible-curated-path");
}
