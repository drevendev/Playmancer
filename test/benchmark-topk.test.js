import assert from 'node:assert/strict';
import test from 'node:test';
import { runBenchmark } from '../src/benchmark.js';

const candidates = ['A', 'B', 'C', 'D'].map((id, index) => ({
  id,
  evidenceCoverage: 1,
  affinities: { seedA: 0.85 - index * 0.1, seedB: 0.8 - index * 0.1 },
  hardConstraintState: 'pass',
}));

function fixture() {
  return {
    catalogSnapshotId: 'synthetic-p05-topk-v1',
    methodVersion: 'p03-v0',
    candidates: structuredClone(candidates),
    baskets: [{
      id: 'two-seeds',
      seeds: [{ id: 'seedA', weight: 2 }, { id: 'seedB', weight: 1 }],
      constraints: { platform: ['pc'] },
      candidateConstraintStates: Object.fromEntries(candidates.map(({ id }) => [id, 'pass'])),
    }],
    modes: ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend'],
    blend: { lambda: 0.5, limit: 2 },
  };
}

test('legacy Blend limit applies to every baseline under identical eligibility', () => {
  const report = runBenchmark(fixture());
  assert.equal(report.top_k, 2);
  assert.equal(report.candidate_count, 4);
  assert.equal(report.results.length, 5);
  for (const row of report.results) {
    assert.equal(row.top_k, 2, row.mode);
    assert.equal(row.ranked.length, 2, row.mode);
    assert.deepEqual(row.ranked.map(({ rank }) => rank), [1, 2], row.mode);
    assert.deepEqual(row.constraints, { platform: ['pc'] });
    assert.equal(row.constraint_state_source, 'basket');
    assert.deepEqual(row.uncertain, []);
    assert.deepEqual(row.excluded, []);
  }
});

test('explicit topK controls all modes, independent of Blend', () => {
  const input = fixture();
  input.topK = 1;
  input.blend = { lambda: 0.5 };
  const report = runBenchmark(input);
  assert.equal(report.top_k, 1);
  for (const row of report.results) {
    assert.equal(row.top_k, 1);
    assert.equal(row.ranked.length, 1, row.mode);
  }
});

test('topK zero yields an honest empty top list without fabricated fallback', () => {
  const input = fixture();
  input.topK = 0;
  input.blend.limit = 0;
  const report = runBenchmark(input);
  for (const row of report.results) assert.deepEqual(row.ranked, []);
});

test('conflicting or invalid top-k values fail before reporting results', () => {
  const conflict = fixture();
  conflict.topK = 1;
  assert.throws(() => runBenchmark(conflict), /blend.limit must match topK/);
  for (const bad of [-1, 1.5, NaN, '3', Infinity]) {
    const input = fixture();
    input.blend = { lambda: 0.5 };
    input.topK = bad;
    assert.throws(() => runBenchmark(input), /topK must be a non-negative integer/);
  }
});

test('hard-constraint failures and unknowns remain excluded with shared top-k', () => {
  const input = fixture();
  input.baskets[0].candidateConstraintStates.A = 'fail';
  input.baskets[0].candidateConstraintStates.B = 'unknown';
  const report = runBenchmark(input);
  for (const row of report.results) {
    assert.equal(row.ranked.length, 2, row.mode);
    assert.deepEqual(row.excluded.map((item) => item.candidate_id), ['A']);
    assert.deepEqual(row.uncertain.map((item) => item.candidate_id), ['B']);
    assert.deepEqual(row.ranked.map((item) => item.candidate_id).sort(), ['C', 'D']);
  }
});
