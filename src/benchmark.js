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
    score: mode === 'blend' ? item.blend?.objective ?? null : item.scores?.[mode] ?? null,
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
  const blend = input.blend ?? {};
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

    for (const mode of modes) {
      const partition = mode === 'blend'
        ? blendCandidates(scoped.candidates, basket.seeds, blend)
        : rankCandidates(scoped.candidates, basket.seeds, { mode });

      results.push({
        protocol_version: protocolVersion,
        catalog_snapshot_id: catalogSnapshotId,
        basket_id: basketId,
        mode,
        method_version: methodVersion,
        seed_ids: partition.seeds.map((seed) => seed.id),
        seed_weights: partition.seeds.map((seed) => seed.weight),
        constraints,
        constraint_state_source: scoped.source,
        ranked: partition.ranked.map((item, index) => rankedRecord(item, index + 1, mode)),
        uncertain: partition.uncertain.map(partitionRecord),
        excluded: partition.excluded.map(partitionRecord),
      });
    }
  }

  return {
    protocol_version: protocolVersion,
    catalog_snapshot_id: catalogSnapshotId,
    method_version: methodVersion,
    candidate_count: input.candidates.length,
    basket_count: input.baskets.length,
    modes,
    results,
  };
}
