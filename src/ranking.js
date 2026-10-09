const MODES = new Set(["union", "arithmetic", "leastMisery", "intersection"]);

// Canonical IDs are identifiers, not display names: use a locale-free UTF-16 ordering.
function compareCanonicalIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function assertCanonicalId(value, label = "canonical id") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertUnitInterval(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be a finite number in [0, 1]`);
  }
  return value;
}

export function normalizeSeeds(seeds) {
  if (!Array.isArray(seeds) || seeds.length === 0) {
    throw new TypeError("seeds must be a non-empty array");
  }

  // Scale first: summing two finite 1e308 weights would otherwise overflow.
  // Scale individual entries before merging duplicates so ratios stay finite.
  const accepted = [];
  let maxWeight = 0;
  for (const seed of seeds) {
    if (!seed || typeof seed !== "object") {
      throw new TypeError("each seed must be an object");
    }
    const id = assertCanonicalId(seed.id, "seed id");
    const weight = seed.weight ?? 1;
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`weight for ${id} must be a finite non-negative number`);
    }
    if (weight === 0) continue;
    accepted.push({ id, weight });
    maxWeight = Math.max(maxWeight, weight);
  }

  if (maxWeight === 0) {
    throw new RangeError("at least one seed must have positive weight");
  }
  const weights = new Map();
  for (const { id, weight } of accepted) {
    weights.set(id, (weights.get(id) ?? 0) + weight / maxWeight);
  }
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);

  return [...weights.entries()]
    .sort(([a], [b]) => compareCanonicalIds(a, b))
    .map(([id, weight]) => ({ id, weight: weight / total }));
}

function hardConstraintState(candidate) {
  const state = candidate.hardConstraintState ?? "pass";
  if (!new Set(["pass", "fail", "unknown"]).has(state)) {
    throw new TypeError(`invalid hardConstraintState for ${candidate.id}`);
  }
  return state;
}

function candidateBase(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("candidate must be an object");
  }
  const id = assertCanonicalId(candidate.id, "candidate id");
  const evidenceCoverage = assertUnitInterval(candidate.evidenceCoverage, `evidenceCoverage for ${id}`);
  if (!candidate.affinities || typeof candidate.affinities !== "object" || Array.isArray(candidate.affinities)) {
    throw new TypeError(`affinities for ${id} must be an object keyed by seed id`);
  }
  return { id, evidenceCoverage };
}

export function scoreCandidate(candidate, seedsInput) {
  return scoreWithSeeds(candidate, normalizeSeeds(seedsInput));
}

// Only public entry points normalize. Batch scoring and Blend share these exact weights.
function scoreWithSeeds(candidate, seeds) {
  const { id, evidenceCoverage } = candidateBase(candidate);
  const seedIds = new Set(seeds.map((seed) => seed.id));

  if (seedIds.has(id)) {
    return {
      id,
      status: "excluded",
      reason: "seed",
      evidenceCoverage,
      seedWeights: seeds,
      affinities: null,
      scores: null,
    };
  }

  const constraintState = hardConstraintState(candidate);
  if (constraintState === "fail") {
    return {
      id,
      status: "excluded",
      reason: "hard-constraint-fail",
      evidenceCoverage,
      seedWeights: seeds,
      affinities: null,
      scores: null,
    };
  }
  if (constraintState === "unknown") {
    return {
      id,
      status: "uncertain",
      reason: "hard-constraint-unknown",
      evidenceCoverage,
      seedWeights: seeds,
      affinities: null,
      scores: null,
    };
  }

  const affinities = {};
  const missingSeedIds = [];
  for (const seed of seeds) {
    const value = candidate.affinities[seed.id];
    if (value === undefined || value === null) {
      missingSeedIds.push(seed.id);
      continue;
    }
    affinities[seed.id] = assertUnitInterval(value, `affinity ${id} -> ${seed.id}`);
  }

  if (missingSeedIds.length > 0) {
    return {
      id,
      status: "uncertain",
      reason: "missing-seed-affinity",
      missingSeedIds,
      evidenceCoverage,
      seedWeights: seeds,
      affinities,
      scores: null,
    };
  }

  const weighted = seeds.map((seed) => ({ ...seed, affinity: affinities[seed.id] }));
  const union = Math.max(...weighted.map((item) => item.affinity));
  const arithmetic = weighted.reduce((sum, item) => sum + item.weight * item.affinity, 0);
  const leastMisery = Math.min(...weighted.map((item) => item.affinity));
  const intersection = weighted.some((item) => item.affinity === 0)
    ? 0
    : 1 / weighted.reduce((sum, item) => sum + item.weight / item.affinity, 0);

  return {
    id,
    status: "rankable",
    reason: null,
    evidenceCoverage,
    seedWeights: seeds,
    affinities,
    scores: { union, arithmetic, leastMisery, intersection },
  };
}

function scalarComparator(mode) {
  return (a, b) => {
    const scoreDelta = b.scores[mode] - a.scores[mode];
    if (scoreDelta !== 0) return scoreDelta;
    const coverageDelta = b.evidenceCoverage - a.evidenceCoverage;
    if (coverageDelta !== 0) return coverageDelta;
    return compareCanonicalIds(a.id, b.id);
  };
}

export function rankCandidates(candidates, seedsInput, { mode = "intersection" } = {}) {
  if (!Array.isArray(candidates)) throw new TypeError("candidates must be an array");
  if (!MODES.has(mode)) throw new TypeError(`unsupported scalar mode: ${mode}`);
  const seeds = normalizeSeeds(seedsInput);
  const seen = new Set();
  const scored = candidates.map((candidate) => {
    const id = assertCanonicalId(candidate?.id, "candidate id");
    if (seen.has(id)) throw new TypeError(`duplicate candidate id: ${id}`);
    seen.add(id);
    return scoreWithSeeds(candidate, seeds);
  });
  return {
    mode,
    seeds,
    ranked: scored.filter((item) => item.status === "rankable").sort(scalarComparator(mode)),
    uncertain: scored.filter((item) => item.status === "uncertain").sort((a, b) => compareCanonicalIds(a.id, b.id)),
    excluded: scored.filter((item) => item.status === "excluded").sort((a, b) => compareCanonicalIds(a.id, b.id)),
  };
}

export function blendCandidates(candidates, seedsInput, { lambda = 0.5, limit = candidates.length } = {}) {
  if (!Array.isArray(candidates)) throw new TypeError("candidates must be an array");
  assertUnitInterval(lambda, "lambda");
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("limit must be a non-negative integer");

  const partition = rankCandidates(candidates, seedsInput, { mode: "arithmetic" });
  const seeds = partition.seeds;
  if (seeds.length === 1) {
    return {
      mode: "blend",
      lambda,
      seeds,
      ranked: partition.ranked.slice(0, limit).map((item) => ({ ...item, blend: null })),
      uncertain: partition.uncertain,
      excluded: partition.excluded,
    };
  }

  const remaining = [...partition.ranked];
  const coverage = Object.fromEntries(seeds.map((seed) => [seed.id, 0]));
  const ranked = [];

  while (remaining.length > 0 && ranked.length < limit) {
    const evaluated = remaining.map((item) => {
      const gain = seeds.reduce((sum, seed) => {
        const delta = Math.max(0, item.affinities[seed.id] - coverage[seed.id]);
        return sum + seed.weight * delta;
      }, 0);
      const arithmetic = item.scores.arithmetic;
      const objective = lambda * arithmetic + (1 - lambda) * gain;
      return { item, objective, gain, arithmetic };
    });

    evaluated.sort((a, b) => {
      // Relevance-only Blend must use arithmetic ranking's exact tie-breaks.
      if (lambda === 1) return scalarComparator("arithmetic")(a.item, b.item);
      if (b.objective !== a.objective) return b.objective - a.objective;
      if (b.gain !== a.gain) return b.gain - a.gain;
      if (b.arithmetic !== a.arithmetic) return b.arithmetic - a.arithmetic;
      if (b.item.evidenceCoverage !== a.item.evidenceCoverage) {
        return b.item.evidenceCoverage - a.item.evidenceCoverage;
      }
      return compareCanonicalIds(a.item.id, b.item.id);
    });

    const chosen = evaluated[0];
    ranked.push({
      ...chosen.item,
      blend: {
        objective: chosen.objective,
        gain: chosen.gain,
        arithmetic: chosen.arithmetic,
        coverageBefore: { ...coverage },
      },
    });
    for (const seed of seeds) {
      coverage[seed.id] = Math.max(coverage[seed.id], chosen.item.affinities[seed.id]);
    }
    remaining.splice(remaining.findIndex((item) => item.id === chosen.item.id), 1);
  }

  return {
    mode: "blend",
    lambda,
    seeds,
    ranked,
    uncertain: partition.uncertain,
    excluded: partition.excluded,
  };
}
