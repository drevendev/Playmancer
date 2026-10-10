import { blendCandidates, rankCandidates } from './ranking.js';

const SCALAR_MODES = new Set(['union', 'arithmetic', 'leastMisery', 'intersection']);
const DEFAULT_MODES = ['union', 'arithmetic', 'intersection', 'blend'];
const CONSTRAINT_STATES = new Set(['pass', 'fail', 'unknown']);

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function normalizeModes(modes = DEFAULT_MODES) {
  if (!Array.isArray(modes) || modes.length === 0) {
    throw new TypeError('modes must be a non-empty array');
  }
  const seen = new Set();
  return modes.map((mode) => {
    assertString(mode, 'mode');
    if (!SCALAR_MODES.has(mode) && mode !== 'blend') {
      throw new TypeError(`unsupported benchmark mode: ${mode}`);
    }
    if (seen.has(mode)) throw new TypeError(`duplicate benchmark mode: ${mode}`);
    seen.add(mode);
    return mode;
  });
}

function rankedRecord(item, rank, mode) {
  return {
    candidate_id: item.id,
    rank,
    score: mode === 'blend' ? (item.blend?.objective ?? item.scores?.arithmetic ?? null) : (item.scores?.[mode] ?? null),
    per_seed_affinity: item.affinities,
    evidence_coverage: item.evidenceCoverage,
    diagnostics: mode === 'blend' ? item.blend : null,
  };
}

function partitionRecord(item) {
  return {
    candidate_id: item.id,
    reason: item.reason,
    evidence_coverage: item.evidenceCoverage,
    missing_seed_ids: item.missingSeedIds ?? [],
  };
}

// The runner consumes pre-evaluated constraint states; it does not infer platform
// or mode support from affinity scores. A constrained basket must supply a final,
// complete classification for this exact candidate catalog. Never fall back to a
// global candidate state when a basket-specific constraint is present.
function candidatesForBasket(candidates, candidateIds, basket, constraints) {
  const label = `candidateConstraintStates for basket ${basket.id}`;
  if (!Object.hasOwn(basket, 'candidateConstraintStates')) {
    if (Object.keys(constraints).length > 0) {
      throw new TypeError(`basket ${basket.id} requires candidateConstraintStates`);
    }
    return { candidates, source: 'candidate' };
  }

  const states = assertObject(basket.candidateConstraintStates, label);
  for (const id of Object.keys(states).sort()) {
    if (!candidateIds.has(id)) throw new TypeError(`${label}: unknown candidate id: ${id}`);
  }
  for (const id of [...candidateIds].sort()) {
    if (!Object.hasOwn(states, id)) throw new TypeError(`${label}: missing constraint state for ${id}`);
    if (!CONSTRAINT_STATES.has(states[id])) {
      throw new TypeError(`${label}: invalid constraint state for ${id}; expected pass, fail, or unknown`);
    }
  }

  return {
    candidates: candidates.map((candidate) => ({ ...candidate, hardConstraintState: states[candidate.id] })),
    source: 'basket',
  };
}


function excludedIdsForBasket(basket, candidateIds) {
  const raw = Object.hasOwn(basket, 'excludedCandidateIds') ? basket.excludedCandidateIds : [];
  if (!Array.isArray(raw)) throw new TypeError('excludedCandidateIds must be an array');
  const seen = new Set();
  const seeds = new Set(basket.seeds.map((seed) => seed.id));
  for (const id of raw) {
    assertString(id, 'excluded candidate id');
    if (seeds.has(id)) throw new TypeError('seed cannot be explicitly excluded: ' + id);
    if (!candidateIds.has(id)) throw new TypeError('unknown excluded candidate id: ' + id);
    if (seen.has(id)) throw new TypeError('duplicate excluded candidate id: ' + id);
    seen.add(id);
  }
  return [...seen].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
}

export function runBenchmark(input) {
  assertObject(input, 'benchmark input');
  const protocolVersion = assertString(input.protocolVersion ?? 'p05-v0', 'protocolVersion');
  const catalogSnapshotId = assertString(input.catalogSnapshotId, 'catalogSnapshotId');
  const methodVersion = assertString(input.methodVersion, 'methodVersion');
  if (!Array.isArray(input.candidates)) throw new TypeError('candidates must be an array');
  if (!Array.isArray(input.baskets) || input.baskets.length === 0) {
    throw new TypeError('baskets must be a non-empty array');
  }

  const candidateIds = new Set();
  for (const candidate of input.candidates) {
    assertObject(candidate, 'candidate');
    const id = assertString(candidate.id, 'candidate id');
    if (candidateIds.has(id)) throw new TypeError(`duplicate candidate id: ${id}`);
    candidateIds.add(id);
  }

  const modes = normalizeModes(input.modes);
  const blend = assertObject(input.blend ?? {}, 'blend');
  // Same candidate catalog, basket constraints, and top-k across every method.
  // Accept legacy blend.limit as a shared top-k, never as a Blend-only cap.
  const topK = input.topK ?? blend.limit ?? input.candidates.length;
  if (!Number.isInteger(topK) || topK < 0) {
    throw new RangeError('topK must be a non-negative integer');
  }
  if (blend.limit !== undefined && blend.limit !== topK) {
    throw new RangeError('blend.limit must match topK');
  }
  const results = [];
  const basketIds = new Set();

  for (const basket of input.baskets) {
    assertObject(basket, 'basket');
    const basketId = assertString(basket.id, 'basket id');
    if (basketIds.has(basketId)) throw new TypeError(`duplicate basket id: ${basketId}`);
    basketIds.add(basketId);
    if (!Array.isArray(basket.seeds) || basket.seeds.length === 0) {
      throw new TypeError(`basket ${basketId} must have a non-empty seeds array`);
    }
    const constraints = basket.constraints === undefined ? {} : basket.constraints;
    assertObject(constraints, `constraints for ${basketId}`);
    const scoped = candidatesForBasket(input.candidates, candidateIds, basket, constraints);
    const excludedIds = excludedIdsForBasket(basket, candidateIds);
    const hidden = new Set(excludedIds);
    const eligibleCandidates = scoped.candidates.filter((candidate) => !hidden.has(candidate.id));
    const explicitlyExcluded = scoped.candidates
      .filter((candidate) => hidden.has(candidate.id))
      .map((candidate) => {
        if (!Number.isFinite(candidate.evidenceCoverage) ||
            candidate.evidenceCoverage < 0 || candidate.evidenceCoverage > 1) {
          throw new RangeError('invalid evidenceCoverage for excluded candidate: ' + candidate.id);
        }
        return { id: candidate.id, reason: 'basket-exclusion', evidenceCoverage: candidate.evidenceCoverage };
      });

    for (const mode of modes) {
      const partition = mode === 'blend'
        ? blendCandidates(eligibleCandidates, basket.seeds, { ...blend, limit: topK })
        : rankCandidates(eligibleCandidates, basket.seeds, { mode });

      results.push({
        protocol_version: protocolVersion,
        catalog_snapshot_id: catalogSnapshotId,
        basket_id: basketId,
        mode,
        method_version: methodVersion,
        seed_ids: partition.seeds.map((seed) => seed.id),
        seed_weights: partition.seeds.map((seed) => seed.weight),
        constraints,
        excluded_candidate_ids: excludedIds,
        constraint_state_source: scoped.source,
        top_k: topK,
        ranked: partition.ranked.slice(0, topK).map((item, index) => rankedRecord(item, index + 1, mode)),
        uncertain: partition.uncertain.map(partitionRecord),
        excluded: [...partition.excluded, ...explicitlyExcluded]
          .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
          .map(partitionRecord),
      });
    }
  }

  return {
    protocol_version: protocolVersion,
    catalog_snapshot_id: catalogSnapshotId,
    method_version: methodVersion,
    candidate_count: input.candidates.length,
    basket_count: input.baskets.length,
    top_k: topK,
    modes,
    results,
  };
}
