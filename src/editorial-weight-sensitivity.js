// Offline one-at-a-time robustness check of the existing four-game editorial
// selected-positive hypothesis. It does NOT establish complete tag coverage,
// similarity, ranking performance, confidence intervals, or source weights.
export const EDITORIAL_SENSITIVITY_PROTOCOL = 'p76-editorial-one-tag-sensitivity-1';
export const EDITORIAL_SENSITIVITY_STEP = 0.05;
// Frozen four-pair cohort from auditEditorialSelectedWeights. An otherwise
// valid fifth/sixth pair must never silently replace a measured comparison.
const FROZEN_PAIRS = Object.freeze([
  ['wikidata:q16972008', 'wikidata:q332697'], // Factorio / Terraria
  ['wikidata:q16972008', 'wikidata:q248810'],  // Factorio / Dwarf Fortress
  ['wikidata:q19581568', 'wikidata:q248810'],  // RimWorld / Dwarf Fortress
  ['wikidata:q332697', 'wikidata:q248810'],    // Terraria / Dwarf Fortress
]);

function requireValid(ok, message) {
  if (!ok) throw new TypeError(message);
}
function rounded(value) { return Math.round(value * 1e6) / 1e6; }
function orderedKeys(object) { return Object.keys(object).sort(); }
function validateWeights(profiles) {
  requireValid(Array.isArray(profiles) && profiles.length === 4, 'exactly four editorial profiles required');
  const map = new Map();
  for (const profile of profiles) {
    requireValid(typeof profile?.id === 'string' && !map.has(profile.id), 'duplicate or invalid game');
    const weights = profile.weightByTag;
    requireValid(weights && typeof weights === 'object' && !Array.isArray(weights), 'missing tag weights');
    const tags = orderedKeys(weights);
    requireValid(tags.length === 4, 'four selected tags required per game');
    let sum = 0;
    for (const tag of tags) {
      const weight = weights[tag];
      requireValid(typeof weight === 'number' && Number.isFinite(weight) &&
        weight > EDITORIAL_SENSITIVITY_STEP && weight < 1 - EDITORIAL_SENSITIVITY_STEP,
      'weight outside the one-tag perturbation domain');
      sum += weight;
    }
    requireValid(Math.abs(sum - 1) < 1e-9, 'selected-positive tag mass must equal 1');
    map.set(profile.id, { weights, tags });
  }
  return map;
}
function observedOverlap(weightsById, pair) {
  const left = weightsById.get(pair.left).weights;
  const right = weightsById.get(pair.right).weights;
  return rounded(pair.shared_positive_tag_ids.reduce((sum, tag) =>
    sum + Math.min(left[tag], right[tag]), 0));
}

// Pass ONLY the exact-blob-vetted output of auditEditorialSelectedWeights.
// The independent source/catalog guard is intentionally NOT duplicated here.
export function auditEditorialWeightSensitivity(pilot, vettedAudit) {
  requireValid(pilot?.protocol === 'p76-editorial-selected-weights-4' &&
    vettedAudit?.protocol === pilot.protocol &&
    vettedAudit.coverage?.complete === 0 && vettedAudit.coverage?.partial === 29 &&
    vettedAudit.coverage?.unknown === 1 &&
    vettedAudit.edited_profiles === 4 && vettedAudit.selected_positive_tags === 16,
  'requires a valid partial-only editorial baseline audit');
  const weightsById = validateWeights(pilot.profiles);
  const pairs = vettedAudit.pairs;
  requireValid(Array.isArray(pairs) && pairs.length === 4, 'requires four vetted pairs');
  const seenPairs = new Set();
  for (const [index, pair] of pairs.entries()) {
    requireValid(weightsById.has(pair.left) && weightsById.has(pair.right) &&
      pair.left !== pair.right && pair.status === 'uncertain' &&
      pair.rankable_affinity === null &&
      Array.isArray(pair.shared_positive_tag_ids) && pair.shared_positive_tag_ids.length > 0,
    'pair must be an uncertain positive-observation comparison');
    // Neither a repeated/reversed pair nor a duplicated/omitted shared positive
    // may inflate or selectively suppress the finite uncertainty envelope.
    const pairKey = [pair.left, pair.right].sort().join('|');
    requireValid(!seenPairs.has(pairKey), 'duplicate editorial comparison pair');
    seenPairs.add(pairKey);
    // The baseline audit intentionally tests four named comparisons, not any
    // four pairs with plausible positive intersections and identical overlaps.
    const expected = FROZEN_PAIRS[index];
    requireValid(pair.left === expected[0] && pair.right === expected[1],
      'editorial comparison cohort or order changed');
    const left = weightsById.get(pair.left).weights;
    const right = weightsById.get(pair.right).weights;
    const expectedShared = Object.keys(left).filter(tag => Object.hasOwn(right, tag));
    const reported = pair.shared_positive_tag_ids;
    requireValid(reported.length === expectedShared.length &&
      new Set(reported).size === expectedShared.length &&
      reported.every(tag => expectedShared.includes(tag)),
    'shared positive tags differ from both vetted profile observations');
    requireValid(Math.abs(observedOverlap(weightsById, pair) -
      pair.editorial_observed_overlap) < 1e-6, 'vetted overlap does not match supplied weights');
  }

  const values = pairs.map(pair => [{ value: observedOverlap(weightsById, pair), label: 'baseline' }]);
  let variantCount = 0;
  // Exactly one manually allocated tag moves +/-5 percentage points. The
  // remaining three tags of that same game compensate proportionally.
  // Every other game and its positive observations remain unchanged.
  for (const [id, profile] of weightsById) {
    for (const tag of profile.tags) {
      for (const direction of [-1, 1]) {
        const change = direction * EDITORIAL_SENSITIVITY_STEP;
        const before = profile.weights[tag];
        const mutated = {};
        for (const other of profile.tags) {
          mutated[other] = other === tag ? before + change :
            profile.weights[other] * (1 - change / (1 - before));
          requireValid(mutated[other] > 0 && mutated[other] < 1,
            'perturbation produced a nonpositive or invalid tag weight');
        }
        requireValid(Math.abs(Object.values(mutated).reduce((sum, x) => sum + x, 0) - 1) < 1e-9,
          'perturbation did not conserve weight mass');
        const copy = new Map(weightsById);
        copy.set(id, { tags: profile.tags, weights: mutated });
        const label = `${id}/${tag}/${direction === 1 ? '+' : '-'}0.05`;
        pairs.forEach((pair, i) => values[i].push({ value: observedOverlap(copy, pair), label }));
        variantCount++;
      }
    }
  }
  requireValid(variantCount === 32, 'unexpected sensitivity variant count');
  // Compare ONLY the order of the four selected-positive overlap observations,
  // not candidates or full-game taste. Each of the 32 weight changes must be
  // compared against the same six frozen pair-to-pair baseline relationships.
  const pairOrder = [];
  for (let first = 0; first < pairs.length; first++) {
    for (let second = first + 1; second < pairs.length; second++) {
      const baseline = Math.sign(values[first][0].value - values[second][0].value);
      const reversalCases = [], tieChangeCases = [];
      for (let n = 1; n <= variantCount; n++) {
        requireValid(values[first][n].label === values[second][n].label,
          'sensitivity variant alignment changed');
        const observed = Math.sign(values[first][n].value - values[second][n].value);
        if (baseline !== 0 && observed === -baseline) reversalCases.push(values[first][n].label);
        if ((baseline === 0) !== (observed === 0)) tieChangeCases.push(values[first][n].label);
      }
      pairOrder.push({
        first_pair: [pairs[first].left, pairs[first].right],
        second_pair: [pairs[second].left, pairs[second].right],
        baseline_relation: baseline === 0 ? 'tie' : baseline > 0 ? 'higher' : 'lower',
        reversed_variants: reversalCases.length, reversal_cases: reversalCases,
        tie_changed_variants: tieChangeCases.length, tie_change_cases: tieChangeCases,
      });
    }
  }
  return {
    protocol: EDITORIAL_SENSITIVITY_PROTOCOL,
    source_protocol: vettedAudit.protocol,
    catalog_snapshot_id: vettedAudit.catalog_snapshot_id,
    catalog_git_blob_sha1: vettedAudit.catalog_git_blob_sha1,
    reviewed_facts_blob_sha1: vettedAudit.reviewed_facts_blob_sha1,
    step_absolute: EDITORIAL_SENSITIVITY_STEP,
    perturbation_policy: "one selected-positive tag per game +/-0.05; proportional compensation among that game's other three positives; all 29 reviewed profiles retain partial coverage",
    variants: variantCount,
    evaluated_scenarios_including_baseline: variantCount + 1,
    pair_order_comparisons: pairOrder.length * variantCount,
    pair_order_reversals: pairOrder.reduce((sum, item) => sum + item.reversed_variants, 0),
    pair_order_tie_changes: pairOrder.reduce((sum, item) => sum + item.tie_changed_variants, 0),
    observed_pair_order_sensitivity: pairOrder,
    complete_profile_count: 0,
    v2_rankable_scenarios: 0,
    observed_pair_envelopes: pairs.map((pair, i) => {
      const samples = values[i];
      const min = samples.reduce((best, item) => item.value < best.value ? item : best);
      const max = samples.reduce((best, item) => item.value > best.value ? item : best);
      return {
        left: pair.left, right: pair.right,
        shared_positive_tag_ids: [...pair.shared_positive_tag_ids],
        baseline_selected_overlap: samples[0].value,
        min_selected_overlap: min.value, min_case: min.label,
        max_selected_overlap: max.value, max_case: max.label,
        changed_variants: samples.slice(1).filter(item => item.value !== samples[0].value).length,
        status: 'uncertain', rankable_affinity: null,
      };
    }),
    interpretation: 'Finite one-at-a-time editorial sensitivity envelope; pair-order reversals concern selected observed overlaps only, NOT basket recommendations, confidence intervals or real-game similarity ranges. All 29 observed tag profiles remain partial; no v2 ranking is licensed by these values.',
  };
}
