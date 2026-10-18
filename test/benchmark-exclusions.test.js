import assert from 'node:assert/strict';
import test from 'node:test';
import { runBenchmark } from '../src/benchmark.js';

const modes = ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend'];
const candidate = (id, a, b, state = 'pass') => ({
  id, affinities: { a, b }, evidenceCoverage: 1, hardConstraintState: state,
});
function fixture() {
  return {
    catalogSnapshotId: 'synthetic-exclusions-v1', methodVersion: 'p03-v0',
    topK: 2, modes,
    candidates: [
      candidate('balanced', 0.7, 0.7),
      candidate('specialist-a', 0.95, 0.1),
      candidate('specialist-b', 0.1, 0.95),
      candidate('unknown', 0.8, 0.8, 'unknown'),
    ],
    baskets: [{
      id: 'B01', seeds: [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }],
      constraints: { platform: ['pc'] },
      candidateConstraintStates: {
        balanced: 'pass', 'specialist-a': 'pass',
        'specialist-b': 'pass', unknown: 'unknown',
      },
      excludedCandidateIds: ['specialist-a', 'unknown'],
    }],
  };
}
const ids = (items) => items.map((item) => item.candidate_id);

test('explicit exclusions restrict the identical eligible catalog for all five methods', () => {
  const result = runBenchmark(fixture());
  assert.equal(result.results.length, modes.length);
  for (const row of result.results) {
    assert.deepEqual(row.excluded_candidate_ids, ['specialist-a', 'unknown']);
    assert.deepEqual(ids(row.ranked).includes('specialist-a'), false);
    assert.deepEqual(ids(row.ranked).includes('unknown'), false);
    assert.deepEqual(row.uncertain, []);
    assert.deepEqual(ids(row.excluded), ['specialist-a', 'unknown']);
    assert.deepEqual(row.excluded.map((item) => item.reason), ['basket-exclusion', 'basket-exclusion']);
    assert.deepEqual(row.top_k, 2);
  }
});

test('each basket retains its own exclusions and shared constraint scope without mutations', () => {
  const input = fixture();
  const second = {
    ...structuredClone(input.baskets[0]), id: 'B02', excludedCandidateIds: ['balanced'],
  };
  input.baskets.push(second);
  const before = structuredClone(input);
  const report = runBenchmark(input);
  assert.deepEqual(input, before);
  assert.equal(report.results.length, 2 * modes.length);
  for (const row of report.results.slice(0, modes.length)) {
    assert.deepEqual(row.excluded_candidate_ids, ['specialist-a', 'unknown']);
  }
  for (const row of report.results.slice(modes.length)) {
    assert.deepEqual(row.excluded_candidate_ids, ['balanced']);
    assert.ok(!ids(row.ranked).includes('balanced'));
  }
  assert.deepEqual(runBenchmark(input), report);
});

test('invalid, duplicate, stale and seed-overlapping exclusions fail closed', () => {
  const cases = [
    [null, /excludedCandidateIds must be an array/],
    ['specialist-a', /excludedCandidateIds must be an array/],
    [['specialist-a', 'specialist-a'], /duplicate excluded candidate id/],
    [['not-in-catalog'], /unknown excluded candidate id/],
    [['a'], /seed cannot be explicitly excluded/],
    [[42], /excluded candidate id must be a non-empty string/],
  ];
  for (const [excludedCandidateIds, error] of cases) {
    const input = fixture();
    input.baskets[0].excludedCandidateIds = excludedCandidateIds;
    assert.throws(() => runBenchmark(input), error);
  }
});

test('excluded candidates with malformed coverage do not escape validation', () => {
  const input = fixture();
  input.candidates[1].evidenceCoverage = NaN;
  assert.throws(() => runBenchmark(input), /invalid evidenceCoverage for excluded candidate/);
});

test('no explicit exclusions preserves the original partitioning', () => {
  const input = fixture();
  delete input.baskets[0].excludedCandidateIds;
  for (const row of runBenchmark(input).results) {
    assert.deepEqual(row.excluded_candidate_ids, []);
    assert.ok(ids(row.ranked).includes('specialist-a') || ids(row.ranked).includes('balanced'));
    assert.deepEqual(ids(row.uncertain), ['unknown']);
  }
});
