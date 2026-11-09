import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pairedProbeDiagnostics, pairedRankableCohort, runEvidenceComparison } from '../src/evidence-comparison.js';

const fixture = JSON.parse(readFileSync(new URL('../examples/evidence-comparison.synthetic.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(fixture);

test('paired synthetic comparison uses identical catalog, hard filters, exclusions and top-k', () => {
  const report = runEvidenceComparison(clone());
  assert.equal(report.report_schema, 'p76-synthetic-paired-5');
  assert.equal(report.catalog_snapshot_id, 'synthetic-demo-1');
  assert.equal(report.new_method, 'weighted-tags-graph-experiment-9');
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
