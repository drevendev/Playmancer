import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pairedProbeDiagnostics, pairedProbeEvaluation, pairedRankableCohort,
  pairedSignedExposureBalance, summarizeSignedExposureByMode, summarizePairedOrderByMode, runEvidenceComparison } from '../src/evidence-comparison.js';

const fixture = JSON.parse(readFileSync(new URL('../examples/evidence-comparison.synthetic.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(fixture);

test('paired synthetic comparison uses identical catalog, hard filters, exclusions and top-k', () => {
  const report = runEvidenceComparison(clone());
  assert.equal(report.report_schema, 'p76-synthetic-paired-13');
  assert.equal(report.catalog_snapshot_id, 'synthetic-demo-1');
  // The comparator comes from live src/demo.js, not a frozen v2 implementation.
  assert.equal(report.old_method, 'feature-overlap-3');
  assert.equal(report.new_method, 'weighted-tags-graph-experiment-10');
  assert.equal(report.game_count, 12);
  assert.equal(report.rows.length, fixture.baskets.length * 5);
  for (const row of report.rows) {
    assert.ok(row.old.top.length <= report.top_k && row.v2.top.length <= report.top_k);
    assert.deepEqual([...row.v2.excluded, ...row.platform_support_reclassified_to_unknown].sort(),
      row.old.excluded);
    assert.ok(row.platform_support_reclassified_to_unknown.every(id =>
      row.v2.uncertain.includes(id) && !row.v2.top.includes(id)));
    assert.ok(row.old.top.every(id => !row.excluded_ids.includes(id)));
    assert.ok(row.v2.top.every(id => !row.excluded_ids.includes(id)));
    assert.ok(row.old.top.every(id => !row.seeds.some(seed => seed.id === id)));
    assert.ok(row.v2.top.every(id => !row.seeds.some(seed => seed.id === id)));
    assert.ok(row.shared_top_k >= 0 && row.shared_top_k <= report.top_k);
    assert.equal(row.probe_delta, row.probe_hits_v2 - row.probe_hits_old);
    assert.equal(row.paired_probe_delta, row.paired_probe_hits_v2 - row.paired_probe_hits_old);
    assert.deepEqual([...row.comparable_probe_ids, ...row.probe_evidence_unpaired.map(item => item.id)].sort(),
      [...row.probe_ids].sort());
    assert.ok(row.paired_probe_hits_old <= row.comparable_probe_ids.length);
    assert.ok(row.paired_probe_hits_v2 <= row.comparable_probe_ids.length);
    assert.deepEqual(row.comparable_probe_ids,
      row.probe_ids.filter(id => row.paired_rankable_ids.includes(id)));
    assert.ok(row.paired_top_old.every(id => row.paired_rankable_ids.includes(id)));
    assert.ok(row.paired_top_v2.every(id => row.paired_rankable_ids.includes(id)));
    assert.ok(row.paired_top_old.length <= report.top_k && row.paired_top_v2.length <= report.top_k);
    assert.equal(row.paired_shared_top_k, row.paired_top_old.filter(id => row.paired_top_v2.includes(id)).length);
    assert.equal(row.paired_ranked_slots, Math.max(row.paired_top_old.length, row.paired_top_v2.length));
    assert.equal(row.paired_same_rank_slots,
      row.paired_top_old.filter((id, index) => id === row.paired_top_v2[index]).length);
    assert.equal(row.paired_order_equal, row.paired_ranked_slots === 0 ? null :
      JSON.stringify(row.paired_top_old) === JSON.stringify(row.paired_top_v2));
    assert.equal(row.paired_rankable_ids.length + row.old_only_rankable_ids.length, row.rankable_opportunities_old);
    assert.equal(row.paired_rankable_ids.length + row.v2_only_rankable_ids.length, row.rankable_opportunities_v2);
    const cohortIds = [...row.paired_rankable_ids, ...row.old_only_rankable_ids,
      ...row.v2_only_rankable_ids];
    assert.equal(new Set(cohortIds).size, cohortIds.length,
      'paired and one-sided candidate sets must be disjoint');
    assert.ok(row.probe_evidence_unpaired.every(item => ['rankable', 'abstained'].includes(item.old)
      && ['rankable', 'abstained'].includes(item.v2) && (item.old === 'abstained' || item.v2 === 'abstained')));
    assert.equal(row.eligible_candidates + row.hard_unknown_candidates +
      row.hard_excluded_candidates, report.game_count);
    assert.equal(row.eligible_candidates + row.v2_hard_unknown_candidates +
      row.v2_hard_excluded_candidates, report.game_count);
    assert.ok(row.rankable_opportunities_old >= 0 &&
      row.rankable_opportunities_old <= row.eligible_candidates);
    assert.ok(row.rankable_opportunities_v2 >= 0 &&
      row.rankable_opportunities_v2 <= row.eligible_candidates);
    assert.ok(row.old.top.length <= row.rankable_opportunities_old);
    assert.ok(row.v2.top.length <= row.rankable_opportunities_v2);
    assert.ok(row.probe_evidence_unknown_old.every(id => row.probe_ids.includes(id) &&
      !row.old.top.includes(id)));
    assert.ok(row.probe_evidence_unknown_v2.every(id => row.probe_ids.includes(id) &&
      !row.v2.top.includes(id)));
  }
});

test('reports reproducible byte-for-byte rankings and explicit wins/losses without a quality claim', () => {
  const first = runEvidenceComparison(clone());
  assert.equal(JSON.stringify(first), JSON.stringify(runEvidenceComparison(clone())));
  assert.match(first.warning, /NOT real-catalog tags/);
  assert.deepEqual(first.losses, first.rows.filter(row => row.probe_delta < 0)
    .map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.probe_delta })));
  assert.deepEqual(first.gains, first.rows.filter(row => row.probe_delta > 0)
    .map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.probe_delta })));
  assert.deepEqual(first.paired_losses, first.rows.filter(row => row.paired_probe_delta < 0)
    .map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.paired_probe_delta })));
  assert.deepEqual(first.paired_gains, first.rows.filter(row => row.paired_probe_delta > 0)
    .map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.paired_probe_delta })));
});

test('order summaries distinguish empty, stable, saturated and headroom changes without quality labels', () => {
  const row = (cohort, equal, slots, same) => ({
    mode: 'arithmetic', paired_rankable_ids: cohort,
    paired_order_equal: equal, paired_ranked_slots: slots, paired_same_rank_slots: same,
  });
  const rows = [
    row([], null, 0, 0),
    row(['a', 'b'], true, 2, 2),
    row(['a', 'b'], false, 2, 0),
    row(['a', 'b', 'c'], false, 2, 1),
  ];
  assert.deepEqual(summarizePairedOrderByMode(rows, 2).find(entry => entry.mode === 'arithmetic'), {
    mode: 'arithmetic', scenarios: 4, empty_cohort_scenarios: 1,
    nonempty_order_scenarios: 3, identical_order_scenarios: 1,
    reordered_scenarios: 2, saturated_nonempty_scenarios: 2,
    saturated_reordered_scenarios: 1, unsaturated_reordered_scenarios: 1,
    observed_rank_slots: 6, preserved_rank_slots: 3,
  });
  const emptyMode = summarizePairedOrderByMode(rows, 2).find(entry => entry.mode === 'union');
  assert.equal(emptyMode.scenarios, 0);
  assert.equal(emptyMode.reordered_scenarios, 0);
  assert.equal(emptyMode.observed_rank_slots, 0);
});

test('frozen per-mode order summaries reconcile exactly with individual basket rows', () => {
  const report = runEvidenceComparison(clone());
  assert.equal(report.paired_order_by_mode.length, report.modes.length);
  for (const summary of report.paired_order_by_mode) {
    const rows = report.rows.filter(row => row.mode === summary.mode);
    assert.equal(summary.scenarios, rows.length);
    assert.equal(summary.empty_cohort_scenarios + summary.nonempty_order_scenarios, rows.length);
    assert.equal(summary.identical_order_scenarios + summary.reordered_scenarios,
      summary.nonempty_order_scenarios);
    assert.equal(summary.saturated_reordered_scenarios +
      summary.unsaturated_reordered_scenarios, summary.reordered_scenarios);
    assert.equal(summary.observed_rank_slots,
      rows.reduce((sum, row) => sum + row.paired_ranked_slots, 0));
    assert.equal(summary.preserved_rank_slots,
      rows.reduce((sum, row) => sum + row.paired_same_rank_slots, 0));
    assert.ok(summary.preserved_rank_slots <= summary.observed_rank_slots);
  }
});

test('paired benchmark marks non-evaluable zero deltas instead of claiming ties', () => {
  const interpret = (probes, comparable, shared) =>
    pairedProbeEvaluation(probes, comparable, shared);
  assert.deepEqual(interpret([], [], ['shared']), {
    status: 'no-authored-probes', authored_probe_count: 0,
    comparable_probe_count: 0, unpaired_probe_count: 0,
  });
  assert.equal(interpret(['a'], [], []).status, 'no-shared-scoreable-candidates');
  assert.equal(interpret(['a'], [], ['other']).status, 'no-comparable-probes');
  assert.equal(interpret(['a', 'b'], ['b'], ['b']).status, 'comparable');

  const report = runEvidenceComparison(clone());
  assert.equal(report.paired_comparability.length, report.modes.length);
  for (const summary of report.paired_comparability) {
    const group = report.rows.filter(row => row.mode === summary.mode);
    assert.equal(summary.scenarios, group.length);
    assert.equal(summary.comparable_scenarios +
      summary.no_authored_probes_scenarios +
      summary.no_shared_scoreable_candidates_scenarios +
      summary.no_comparable_probes_scenarios, group.length);
    assert.equal(summary.comparable_probe_opportunities,
      group.reduce((n, row) => n + row.comparable_probe_ids.length, 0));
    assert.ok(summary.comparable_probe_opportunities <= summary.authored_probe_opportunities);
    for (const row of group) {
      assert.equal(row.paired_probe_evaluation.comparable_probe_count, row.comparable_probe_ids.length);
      assert.equal(row.paired_probe_evaluation.unpaired_probe_count, row.probe_evidence_unpaired.length);
      if (row.paired_probe_evaluation.status !== 'comparable') {
        assert.equal(row.paired_probe_delta, 0);
        assert.equal(row.paired_probe_evaluation.comparable_probe_count, 0);
      }
    }
  }
  const sparse = report.rows.filter(row => row.basket_id === 'sparse-tag-evidence');
  assert.ok(sparse.length > 0);
  assert.ok(sparse.every(row => row.paired_probe_evaluation.status === 'no-shared-scoreable-candidates'));

  const probeFree = clone();
  probeFree.baskets = [probeFree.baskets[0]];
  probeFree.baskets[0].probeIds = [];
  const empty = runEvidenceComparison(probeFree);
  assert.ok(empty.rows.every(row => row.paired_probe_evaluation.status === 'no-authored-probes'));
  assert.ok(empty.paired_comparability.every(mode => mode.comparable_scenarios === 0 &&
    mode.no_authored_probes_scenarios === 1));
});

test('unrankable evidence cannot masquerade as a paired probe ranking loss or gain', () => {
  const probes = ['stable', 'unobserved', 'unknown-both'];
  const oldTop = ['stable', 'unobserved'], v2Top = ['stable'];
  const paired = pairedProbeDiagnostics(probes, oldTop, v2Top,
    ['unknown-both'], ['unobserved', 'unknown-both']);
  assert.deepEqual(paired.comparable_probe_ids, ['stable']);
  assert.deepEqual(paired.probe_evidence_unpaired, [
    { id: 'unobserved', old: 'rankable', v2: 'abstained' },
    { id: 'unknown-both', old: 'abstained', v2: 'abstained' },
  ]);
  assert.equal(paired.paired_probe_hits_old, 1);
  assert.equal(paired.paired_probe_hits_v2, 1);
  assert.equal(paired.paired_probe_delta, 0);
  // Raw probe delta remains negative and separately visible.
  assert.equal(v2Top.filter(id => probes.includes(id)).length -
    oldTop.filter(id => probes.includes(id)).length, -1);
  const reverse = pairedProbeDiagnostics(['old-missing', 'shared'],
    ['shared'], ['old-missing', 'shared'], ['old-missing'], []);
  assert.deepEqual(reverse.comparable_probe_ids, ['shared']);
  assert.deepEqual(reverse.probe_evidence_unpaired,
    [{ id: 'old-missing', old: 'abstained', v2: 'rankable' }]);
  assert.equal(reverse.paired_probe_delta, 0);
  const bothAbsent = pairedProbeDiagnostics(['x'], [], [], ['x'], ['x']);
  assert.deepEqual(bothAbsent.comparable_probe_ids, []);
  assert.equal(bothAbsent.paired_probe_delta, 0);
});

test('rejects mistyped paired-benchmark controls rather than silently relaxing filters', () => {
  const cases = [
    ['top-k', data => { data.topk = 1; }, /unknown comparison input field: topk/],
    ['co-op filter', data => { data.baskets[0].cooponly = true; }, /unknown basket field: cooponly/],
    ['exclusions', data => { data.baskets[0].excldued = ['demo:tide']; }, /unknown basket field: excldued/],
    ['probe list', data => { data.baskets[0].probeIDs = []; }, /unknown basket field: probeIDs/],
    ['seed weight', data => { data.baskets[0].seeds[0].weigth = 99; }, /unknown seed field: weigth/],
    ['relations', data => { data.relatons = []; }, /unknown comparison input field: relatons/],
    ['injected JSON field', data => {
      Object.defineProperty(data.baskets[0], '__proto__', { value: {}, enumerable: true });
    }, /unknown basket field: __proto__/],
  ];
  for (const [label, mutate, pattern] of cases) {
    const data = clone();
    mutate(data);
    assert.throws(() => runEvidenceComparison(data), pattern, label);
  }
  assert.deepEqual(runEvidenceComparison(clone()), runEvidenceComparison(clone()));
});

test('rejects incompatible catalog, invalid baskets and hidden filter changes', () => {
  const wrong = clone(); wrong.catalogSnapshotId = 'other';
  assert.throws(() => runEvidenceComparison(wrong), /catalog revision mismatch/);
  const duplicate = clone(); duplicate.baskets[0].seeds[1].id = duplicate.baskets[0].seeds[0].id;
  assert.throws(() => runEvidenceComparison(duplicate), /duplicate seed/);
  const unknown = clone(); unknown.baskets[0].platform = 'imagined-console';
  assert.throws(() => runEvidenceComparison(unknown), /unsupported platform/);
  const excludedSeed = clone(); excludedSeed.baskets[0].excluded.push('demo:ember');
  assert.throws(() => runEvidenceComparison(excludedSeed), /seed cannot be excluded/);
  const badRelation = clone(); badRelation.relations[0].to = 'demo:unlicensed';
  assert.throws(() => runEvidenceComparison(badRelation), /endpoints/);
  const duplicateProbe = clone(); duplicateProbe.baskets[0].probeIds.push('demo:tide');
  assert.throws(() => runEvidenceComparison(duplicateProbe), /probeIds/);
});

test('sparse tag evidence abstains, while strict unknown platform and coop filters remain explicit', () => {
  const report = runEvidenceComparison(clone());
  for (const row of report.rows.filter(row => row.basket_id === 'sparse-tag-evidence')) {
    assert.deepEqual(row.old.top, []);
    assert.deepEqual(row.v2.top, []);
    assert.ok(row.old.uncertain.length > 0 && row.v2.uncertain.length > 0);
    assert.deepEqual(row.probe_evidence_unknown_old, ['demo:meadow']);
    assert.deepEqual(row.probe_evidence_unknown_v2, ['demo:meadow']);
    assert.equal(row.rankable_opportunities_old, 0);
    assert.equal(row.rankable_opportunities_v2, 0);
  }
  for (const row of report.rows.filter(row => row.basket_id === 'linux-coop-puzzles')) {
    assert.ok(row.old.excluded.includes('demo:ember'));
    assert.ok(row.old.uncertain.includes('demo:echo'));
    assert.deepEqual([...row.v2.excluded, ...row.platform_support_reclassified_to_unknown].sort(),
      row.old.excluded);
    assert.ok(row.platform_support_reclassified_to_unknown.every(id =>
      row.v2.uncertain.includes(id) && !row.v2.top.includes(id)));
  }
});

test('paired probes cannot be excluded, hard-failed or unknown under either filter', () => {
  const excluded = clone();
  excluded.baskets[0].excluded.push('demo:tide');
  assert.throws(() => runEvidenceComparison(excluded), /probe cannot be explicitly excluded/);

  const unknownPlatform = clone();
  unknownPlatform.baskets[1].probeIds = ['demo:echo']; // Windows unknown.
  assert.throws(() => runEvidenceComparison(unknownPlatform), /probe must pass hard constraints/);

  const failedPlatform = clone();
  failedPlatform.baskets[2].probeIds = ['demo:meadow']; // No Linux, no co-op.
  assert.throws(() => runEvidenceComparison(failedPlatform), /probe must pass hard constraints/);

  const failedCoop = clone();
  failedCoop.baskets[2].probeIds = ['demo:ember']; // Linux is known, co-op is false.
  assert.throws(() => runEvidenceComparison(failedCoop), /probe must pass hard constraints/);
});

test('paired cohort reranks the full shared candidate pool rather than merely filtering probes', () => {
  const seeds = [{ id: 'seed:a', weight: 1 }, { id: 'seed:b', weight: 1 }];
  const item = (id, a, b) => ({
    id, affinities: { 'seed:a': a, 'seed:b': b }, evidenceCoverage: 1,
  });
  const old = { ranked: [
    item('only:old', 1, 1), item('shared:a', 0.9, 0.9), item('shared:b', 0.2, 0.2),
  ] };
  const v2 = { ranked: [
    item('only:v2', 1, 1), item('shared:a', 0.1, 0.1), item('shared:b', 0.95, 0.95),
  ] };
  const paired = pairedRankableCohort(old, v2, seeds, 'arithmetic', 0.3, 1);
  assert.deepEqual(paired.paired_rankable_ids, ['shared:a', 'shared:b']);
  assert.deepEqual(paired.old_only_rankable_ids, ['only:old']);
  assert.deepEqual(paired.v2_only_rankable_ids, ['only:v2']);
  assert.deepEqual(paired.paired_top_old, ['shared:a']);
  assert.deepEqual(paired.paired_top_v2, ['shared:b']);
  const probes = pairedProbeDiagnostics(['shared:a', 'shared:b'], paired.paired_top_old,
    paired.paired_top_v2, [], []);
  assert.equal(probes.paired_probe_delta, 0);
  assert.equal(paired.paired_shared_top_k, 0);
});

test('saturated common pool still discloses positional changes without claiming a signed win', () => {
  const seeds = [{ id: 'seed:a', weight: 1 }];
  const item = (id, affinity) => ({ id, affinities: { 'seed:a': affinity }, evidenceCoverage: 1 });
  const old = { ranked: [item('shared:a', 1), item('shared:b', .5)] };
  const v2 = { ranked: [item('shared:a', .5), item('shared:b', 1)] };
  const changed = pairedRankableCohort(old, v2, seeds, 'arithmetic', .3, 2);
  assert.equal(changed.paired_shared_top_k, 2);
  assert.deepEqual(changed.paired_top_old, ['shared:a', 'shared:b']);
  assert.deepEqual(changed.paired_top_v2, ['shared:b', 'shared:a']);
  assert.equal(changed.paired_ranked_slots, 2);
  assert.equal(changed.paired_same_rank_slots, 0);
  assert.equal(changed.paired_order_equal, false);
  const stable = pairedRankableCohort(old, old, seeds, 'arithmetic', .3, 2);
  assert.equal(stable.paired_order_equal, true);
  assert.equal(stable.paired_same_rank_slots, 2);
  const missing = pairedRankableCohort({ ranked: [] }, { ranked: [] }, seeds,
    'arithmetic', .3, 2);
  assert.equal(missing.paired_ranked_slots, 0);
  assert.equal(missing.paired_same_rank_slots, 0);
  assert.equal(missing.paired_order_equal, null);
});

test('paired Blend recomputes list-level marginal gains on the same shared pool', () => {
  const seeds = [{ id: 'seed:a', weight: 1 }, { id: 'seed:b', weight: 1 }];
  const item = (id, a, b) => ({
    id, affinities: { 'seed:a': a, 'seed:b': b }, evidenceCoverage: 1,
  });
  const old = { ranked: [
    item('old:exclusive', 1, 1), item('shared:a', 1, 0.1),
    item('shared:b', 0.1, 1), item('shared:c', 0.8, 0.8),
  ] };
  const v2 = { ranked: [
    item('v2:exclusive', 1, 1), item('shared:a', 1, 0.1),
    item('shared:b', 0.1, 1), item('shared:c', 0.8, 0.8),
  ] };
  const paired = pairedRankableCohort(old, v2, seeds, 'blend', 0, 2);
  assert.deepEqual(paired.paired_top_old, ['shared:c', 'shared:a']);
  assert.deepEqual(paired.paired_top_v2, paired.paired_top_old);
  assert.equal(paired.paired_shared_top_k, 2);
  assert.equal(paired.paired_rankable_ids.length, 3);
});


test('signed fictional negatives remain distinct from positive probe gains and expose paired coverage', () => {
  const result = runEvidenceComparison(clone());
  assert.ok(result.rows.some(row => row.negative_probe_ids.length > 0));
  assert.deepEqual(result.paired_negative_losses, result.rows
    .filter(row => row.paired_negative_probe_delta > 0)
    .map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.paired_negative_probe_delta })));
  assert.deepEqual(result.paired_negative_gains, result.rows
    .filter(row => row.paired_negative_probe_delta < 0)
    .map(row => ({ basket_id: row.basket_id, mode: row.mode, delta: row.paired_negative_probe_delta })));
  for (const row of result.rows) {
    assert.ok(row.negative_probe_ids.every(id => !row.probe_ids.includes(id)));
    assert.equal(row.negative_probe_delta, row.negative_probe_hits_v2 - row.negative_probe_hits_old);
    assert.equal(row.paired_negative_probe_delta,
      row.paired_negative_probe_hits_v2 - row.paired_negative_probe_hits_old);
    assert.deepEqual(row.paired_negative_probe_ids,
      row.negative_probe_ids.filter(id => row.paired_rankable_ids.includes(id)));
    assert.deepEqual([...row.paired_negative_probe_ids,
      ...row.negative_probe_evidence_unpaired.map(item => item.id)].sort(),
      [...row.negative_probe_ids].sort());
    assert.ok(row.paired_negative_probe_hits_old <= row.paired_negative_probe_ids.length);
    assert.ok(row.paired_negative_probe_hits_v2 <= row.paired_negative_probe_ids.length);
    assert.equal(row.paired_negative_probe_evaluation.comparable_probe_count,
      row.paired_negative_probe_ids.length);
    if (row.negative_probe_ids.length === 0) {
      assert.equal(row.paired_negative_probe_evaluation.status, 'no-authored-probes');
      assert.equal(row.paired_negative_probe_delta, 0);
    }
  }
  assert.deepEqual(result, runEvidenceComparison(clone()));
  for (const summary of result.paired_negative_comparability) {
    const rows = result.rows.filter(row => row.mode === summary.mode);
    assert.equal(summary.scenarios, rows.length);
    assert.equal(summary.authored_probe_opportunities,
      rows.reduce((sum, row) => sum + row.negative_probe_ids.length, 0));
    assert.equal(summary.comparable_probe_opportunities,
      rows.reduce((sum, row) => sum + row.paired_negative_probe_ids.length, 0));
  }
});

test('signed probes fail closed on overlap, unknowns, duplicates and filtered candidates', () => {
  const cases = [
    ['overlap', d => { d.baskets[0].negativeProbeIds = ['demo:tide']; }, /disjoint/],
    ['duplicate negative', d => { d.baskets[0].negativeProbeIds = ['demo:citadel', 'demo:citadel']; }, /negativeProbeIds/],
    ['unknown negative', d => { d.baskets[0].negativeProbeIds = ['demo:imaginary']; }, /unknown game/],
    ['excluded negative', d => { d.baskets[0].excluded.push('demo:citadel'); }, /cannot be explicitly excluded/],
    ['seed negative', d => { d.baskets[0].negativeProbeIds = ['demo:ember']; }, /cannot be a seed/],
    ['unknown platform support', d => { d.baskets[1].negativeProbeIds = ['demo:echo']; }, /must pass hard constraints/],
    ['mistyped field', d => { d.baskets[0].negativeProbeIDs = ['demo:citadel']; }, /unknown basket field/],
  ];
  for (const [label, change, error] of cases) {
    const input = clone();
    change(input);
    assert.throws(() => runEvidenceComparison(input), error, label);
  }
  // Absence of authored negative judgments is an explicitly unevaluable result,
  // not proof of zero false positives.
  const noNegatives = clone();
  for (const basket of noNegatives.baskets) delete basket.negativeProbeIds;
  const result = runEvidenceComparison(noNegatives);
  assert.ok(result.rows.every(row => row.paired_negative_probe_evaluation.status === 'no-authored-probes'));
  assert.ok(result.paired_negative_comparability.every(group => group.comparable_scenarios === 0));
});

test('signed negative paired exposures preserve literal regression and improvement directions', () => {
  // These independently specified outcomes prevent an inverted delta sign from
  // passing tests that derive their expected values from the implementation.
  const negatives = ['demo:unwanted-a', 'demo:unwanted-b'];
  assert.deepEqual(pairedProbeDiagnostics(negatives,
    ['demo:unwanted-a'], negatives, [], []), {
    comparable_probe_ids: negatives,
    probe_evidence_unpaired: [],
    paired_probe_hits_old: 1,
    paired_probe_hits_v2: 2,
    paired_probe_delta: 1, // More unwanted games under v2 is worse.
  });
  assert.deepEqual(pairedProbeDiagnostics(negatives,
    negatives, ['demo:unwanted-b'], [], []), {
    comparable_probe_ids: negatives,
    probe_evidence_unpaired: [],
    paired_probe_hits_old: 2,
    paired_probe_hits_v2: 1,
    paired_probe_delta: -1, // Fewer unwanted games under v2 is better.
  });
  // A missing evidence receipt is not a successful avoidance.
  assert.deepEqual(pairedProbeDiagnostics(['demo:unwanted-a'],
    ['demo:unwanted-a'], [], [], ['demo:unwanted-a']), {
    comparable_probe_ids: [],
    probe_evidence_unpaired: [
      { id: 'demo:unwanted-a', old: 'rankable', v2: 'abstained' },
    ],
    paired_probe_hits_old: 0,
    paired_probe_hits_v2: 0,
    paired_probe_delta: 0,
  });
  assert.deepEqual(pairedProbeEvaluation(['demo:unwanted-a'], [], ['demo:other']), {
    status: 'no-comparable-probes',
    authored_probe_count: 1,
    comparable_probe_count: 0,
    unpaired_probe_count: 1,
  });
});

test('signed exposure balances positive/negative probe rates only when both are comparable', () => {
  const positives = ['demo:liked-a', 'demo:liked-b'];
  const negatives = ['demo:disliked-a', 'demo:disliked-b'];
  const oldTop = ['demo:liked-a', 'demo:disliked-a'];
  const improved = ['demo:liked-a', 'demo:liked-b'];
  const worsened = ['demo:disliked-a', 'demo:disliked-b'];

  // Independent literal rates: old 1/2 - 1/2 = 0,
  // improved 2/2 - 0/2 = 1; worsened 0/2 - 2/2 = -1.
  const positive = pairedProbeDiagnostics(positives, oldTop, improved, [], []);
  const negative = pairedProbeDiagnostics(negatives, oldTop, improved, [], []);
  assert.deepEqual(pairedSignedExposureBalance(positive, negative), {
    status: 'comparable', comparable_positive_count: 2, comparable_negative_count: 2,
    old_balance: 0, v2_balance: 1, balance_delta: 1,
  });
  assert.deepEqual(pairedSignedExposureBalance(
    pairedProbeDiagnostics(positives, oldTop, worsened, [], []),
    pairedProbeDiagnostics(negatives, oldTop, worsened, [], [])), {
    status: 'comparable', comparable_positive_count: 2, comparable_negative_count: 2,
    old_balance: 0, v2_balance: -1, balance_delta: -1,
  });
  // A positive hit can trade off with one negative exposure. Different label
  // counts are normalized *separately*, not pooled into one total hit count.
  assert.deepEqual(pairedSignedExposureBalance(
    pairedProbeDiagnostics(['demo:liked-a'], ['demo:liked-a'], [], [], []),
    pairedProbeDiagnostics(negatives, [], ['demo:disliked-a'], [], [])), {
    status: 'comparable', comparable_positive_count: 1, comparable_negative_count: 2,
    old_balance: 1, v2_balance: -0.5, balance_delta: -1.5,
  });
});

test('exact signed hit fractions classify mathematical ties without phantom improvements', () => {
  // Both signed balances are exactly -1/6, but independent floating division
  // produces -0.16666666666666666 vs -0.16666666666666663.
  const positives = {
    comparable_probe_ids: ['p1', 'p2'], paired_probe_hits_old: 0, paired_probe_hits_v2: 1,
  };
  const negatives = {
    comparable_probe_ids: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6'],
    paired_probe_hits_old: 1, paired_probe_hits_v2: 4,
  };
  const result = pairedSignedExposureBalance(positives, negatives);
  assert.equal(result.status, 'comparable');
  assert.equal(result.old_balance, -1 / 6);
  assert.ok(result.v2_balance > result.old_balance, 'the fixture reproduces floating cancellation');
  assert.equal(result.balance_delta, 0, 'an exact rational tie must not be reported as a win');
  const summary = summarizeSignedExposureByMode([
    { mode: 'union', paired_signed_exposure: result },
  ]).find(row => row.mode === 'union');
  assert.equal(summary.tied_scenarios, 1);
  assert.equal(summary.improved_scenarios, 0);
  assert.equal(summary.worsened_scenarios, 0);

  // Reversing the observations must also remain a tie, not a phantom loss.
  const reverse = pairedSignedExposureBalance(
    { ...positives, paired_probe_hits_old: 1, paired_probe_hits_v2: 0 },
    { ...negatives, paired_probe_hits_old: 4, paired_probe_hits_v2: 1 },
  );
  assert.equal(reverse.balance_delta, 0);
});

test('missing signed comparison groups abstain rather than producing fake zero quality deltas', () => {
  const p = pairedProbeDiagnostics(['demo:liked'], ['demo:liked'], [], [], []);
  const n = pairedProbeDiagnostics(['demo:disliked'], [], [], [], []);
  const noPositive = pairedProbeDiagnostics(['demo:liked'], [], [], ['demo:liked'], []);
  const noNegative = pairedProbeDiagnostics(['demo:disliked'], [], [], ['demo:disliked'], []);
  const cases = [
    [noPositive, n, 'no-comparable-positive-probes', 0, 1],
    [p, noNegative, 'no-comparable-negative-probes', 1, 0],
    [noPositive, noNegative, 'no-comparable-signed-probes', 0, 0],
    [p, pairedProbeDiagnostics([], [], [], [], []), 'no-comparable-negative-probes', 1, 0],
  ];
  for (const [positive, negative, status, pc, nc] of cases) {
    assert.deepEqual(pairedSignedExposureBalance(positive, negative), {
      status, comparable_positive_count: pc, comparable_negative_count: nc,
      old_balance: null, v2_balance: null, balance_delta: null,
    });
  }
  const noNegatives = clone();
  for (const basket of noNegatives.baskets) delete basket.negativeProbeIds;
  const report = runEvidenceComparison(noNegatives);
  assert.ok(report.rows.every(row =>
    row.paired_signed_exposure.status !== 'comparable' &&
    row.paired_signed_exposure.balance_delta === null));
  assert.deepEqual(report.paired_signed_exposure_gains, []);
  assert.deepEqual(report.paired_signed_exposure_losses, []);
});

test('signed exposure report follows paired-only cohort and only classifies comparable deltas', () => {
  const report = runEvidenceComparison(clone());
  assert.deepEqual(report, runEvidenceComparison(clone()));
  for (const row of report.rows) {
    const exposure = row.paired_signed_exposure;
    assert.equal(exposure.comparable_positive_count, row.comparable_probe_ids.length);
    assert.equal(exposure.comparable_negative_count, row.paired_negative_probe_ids.length);
    if (exposure.status === 'comparable') {
      assert.equal(exposure.old_balance,
        row.paired_probe_hits_old / exposure.comparable_positive_count -
        row.paired_negative_probe_hits_old / exposure.comparable_negative_count);
      assert.equal(exposure.v2_balance,
        row.paired_probe_hits_v2 / exposure.comparable_positive_count -
        row.paired_negative_probe_hits_v2 / exposure.comparable_negative_count);
      const signedNumerator =
        (row.paired_probe_hits_v2 - row.paired_probe_hits_old) * exposure.comparable_negative_count -
        (row.paired_negative_probe_hits_v2 - row.paired_negative_probe_hits_old) *
          exposure.comparable_positive_count;
      assert.equal(exposure.balance_delta, signedNumerator /
        (exposure.comparable_positive_count * exposure.comparable_negative_count));
    } else {
      assert.equal(exposure.balance_delta, null);
      assert.equal(exposure.old_balance, null);
      assert.equal(exposure.v2_balance, null);
    }
  }
  for (const [key, sign] of [['paired_signed_exposure_gains', 1],
    ['paired_signed_exposure_losses', -1]]) {
    assert.deepEqual(report[key], report.rows.filter(row =>
      row.paired_signed_exposure.balance_delta !== null &&
      sign * row.paired_signed_exposure.balance_delta > 0)
      .map(row => ({ basket_id: row.basket_id, mode: row.mode,
        delta: row.paired_signed_exposure.balance_delta })));
  }
});


test('per-mode signed balance counts non-comparable scenarios and averages baskets equally', () => {
  const exposure = (status, old_balance = null, v2_balance = null, balance_delta = null) =>
    ({ paired_signed_exposure: { status, old_balance, v2_balance, balance_delta } });
  const rows = [
    { mode: 'union', ...exposure('comparable', 0, 1, 1) },
    { mode: 'union', ...exposure('comparable', 0, -1, -1) },
    { mode: 'union', ...exposure('comparable', 0, 0, 0) },
    { mode: 'union', ...exposure('no-comparable-positive-probes') },
    { mode: 'union', ...exposure('no-comparable-signed-probes') },
    { mode: 'union', ...exposure('no-ranking-headroom') },
    { mode: 'arithmetic', ...exposure('no-comparable-negative-probes') },
  ];
  const byMode = summarizeSignedExposureByMode(rows);
  assert.deepEqual(byMode.find(item => item.mode === 'union'), {
    mode: 'union', scenarios: 6, comparable_scenarios: 3,
    no_comparable_positive_scenarios: 1,
    no_comparable_negative_scenarios: 0,
    no_comparable_signed_scenarios: 1,
    no_ranking_headroom_scenarios: 1,
    improved_scenarios: 1, worsened_scenarios: 1, tied_scenarios: 1,
    mean_old_balance: 0, mean_v2_balance: 0, mean_balance_delta: 0,
  });
  assert.deepEqual(byMode.find(item => item.mode === 'arithmetic'), {
    mode: 'arithmetic', scenarios: 1, comparable_scenarios: 0,
    no_comparable_positive_scenarios: 0,
    no_comparable_negative_scenarios: 1,
    no_comparable_signed_scenarios: 0,
    no_ranking_headroom_scenarios: 0,
    improved_scenarios: 0, worsened_scenarios: 0, tied_scenarios: 0,
    mean_old_balance: null, mean_v2_balance: null, mean_balance_delta: null,
  });
  assert.ok(byMode.filter(item => item.scenarios === 0).every(item =>
    item.mean_balance_delta === null && item.comparable_scenarios === 0));
});

test('saturated paired top-k cohorts abstain rather than inflate signed ties', () => {
  const full = clone();
  full.topK = 12; // The immutable authored fixture has exactly twelve games.
  const report = runEvidenceComparison(full);
  const signed = report.rows.filter(row =>
    row.paired_signed_exposure.comparable_positive_count > 0 &&
    row.paired_signed_exposure.comparable_negative_count > 0);
  assert.ok(signed.length > 0, 'the frozen fixture must exercise the saturation gate');
  assert.ok(signed.every(row => row.paired_rankable_ids.length <= full.topK &&
    row.paired_signed_exposure.status === 'no-ranking-headroom' &&
    row.paired_signed_exposure.balance_delta === null &&
    row.paired_signed_exposure.old_balance === null &&
    row.paired_signed_exposure.v2_balance === null));
  assert.ok(report.rows.every(row => row.paired_signed_exposure.status !== 'comparable'));
  assert.deepEqual(report.paired_signed_exposure_gains, []);
  assert.deepEqual(report.paired_signed_exposure_losses, []);
  for (const summary of report.paired_signed_exposure_by_mode) {
    const rows = report.rows.filter(row => row.mode === summary.mode);
    assert.equal(summary.no_ranking_headroom_scenarios,
      rows.filter(row => row.paired_signed_exposure.status === 'no-ranking-headroom').length);
    assert.equal(summary.comparable_scenarios, 0);
    assert.equal(summary.tied_scenarios, 0);
    assert.equal(summary.mean_balance_delta, null);
  }
  // The authored observations and raw hit totals are still reported.
  assert.ok(signed.every(row => row.probe_ids.length > 0 &&
    row.negative_probe_ids.length > 0 && row.paired_top_old.length > 0));
  const selective = runEvidenceComparison(clone());
  assert.ok(selective.rows.every(row => row.paired_signed_exposure.status !== 'comparable' ||
    row.paired_rankable_ids.length > selective.top_k));
});

test('frozen paired signed mode report never treats missing labels as zero or a win', () => {
  const report = runEvidenceComparison(clone());
  assert.deepEqual(report, runEvidenceComparison(clone()));
  assert.equal(report.paired_signed_exposure_by_mode.length, report.modes.length);
  for (const mode of report.modes) {
    const rows = report.rows.filter(row => row.mode === mode);
    const summary = report.paired_signed_exposure_by_mode.find(item => item.mode === mode);
    const comparable = rows.filter(row => row.paired_signed_exposure.status === 'comparable');
    assert.equal(summary.scenarios, rows.length);
    assert.equal(summary.comparable_scenarios, comparable.length);
    assert.equal(summary.improved_scenarios + summary.worsened_scenarios + summary.tied_scenarios,
      comparable.length);
    assert.equal(summary.comparable_scenarios + summary.no_comparable_positive_scenarios +
      summary.no_comparable_negative_scenarios + summary.no_comparable_signed_scenarios +
      summary.no_ranking_headroom_scenarios, summary.scenarios);
    if (comparable.length === 0) assert.equal(summary.mean_balance_delta, null);
    else assert.ok(Math.abs(summary.mean_balance_delta -
      comparable.reduce((sum, row) => sum + row.paired_signed_exposure.balance_delta, 0) /
      comparable.length) < 1e-12);
  }

  const noNegatives = clone();
  for (const basket of noNegatives.baskets) delete basket.negativeProbeIds;
  const unscored = runEvidenceComparison(noNegatives);
  assert.ok(unscored.paired_signed_exposure_by_mode.every(group =>
    group.comparable_scenarios === 0 && group.mean_old_balance === null &&
    group.mean_v2_balance === null && group.mean_balance_delta === null &&
    group.tied_scenarios === 0));
});
