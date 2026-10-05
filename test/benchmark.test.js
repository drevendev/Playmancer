import assert from 'node:assert/strict';
import test from 'node:test';
import { runBenchmark } from '../src/benchmark.js';

const candidate = (id, affinities, evidenceCoverage = 1, hardConstraintState = 'pass') => ({
  id,
  affinities,
  evidenceCoverage,
  hardConstraintState,
});

const input = {
  protocolVersion: 'p05-v0',
  catalogSnapshotId: 'synthetic-v1',
  methodVersion: 'p03-v0',
  candidates: [
    candidate('balanced', { a: 0.7, b: 0.7 }),
    candidate('specialist-a', { a: 0.95, b: 0.1 }, 0.9),
    candidate('unknown', { a: 0.8, b: 0.8 }, 0.5, 'unknown'),
    candidate('blocked', { a: 1, b: 1 }, 1, 'fail'),
  ],
  baskets: [{
    id: 'B001',
    seeds: [{ id: 'a', weight: 1 }, { id: 'b', weight: 1 }],
    constraints: { platform: ['pc'] },
    candidateConstraintStates: {
      balanced: 'pass', 'specialist-a': 'pass', unknown: 'unknown', blocked: 'fail',
    },
  }],
  modes: ['intersection', 'blend'],
  blend: { lambda: 0.3, limit: 2 },
};

test('benchmark emits versioned records and preserves uncertain/excluded partitions', () => {
  const report = runBenchmark(input);
  assert.equal(report.protocol_version, 'p05-v0');
  assert.equal(report.candidate_count, 4);
  assert.equal(report.results.length, 2);

  const intersection = report.results[0];
  assert.equal(intersection.mode, 'intersection');
  assert.equal(intersection.ranked[0].candidate_id, 'balanced');
  assert.equal(intersection.ranked[0].rank, 1);
  assert.deepEqual(intersection.constraints, { platform: ['pc'] });
  assert.deepEqual(intersection.uncertain.map((item) => [item.candidate_id, item.reason]), [['unknown', 'hard-constraint-unknown']]);
  assert.deepEqual(intersection.excluded.map((item) => [item.candidate_id, item.reason]), [['blocked', 'hard-constraint-fail']]);

  const blend = report.results[1];
  assert.equal(blend.mode, 'blend');
  assert.equal(blend.ranked.length, 2);
  assert.equal(typeof blend.ranked[0].score, 'number');
  assert.ok(blend.ranked[0].diagnostics);
});

test('benchmark preserves empty ranked results instead of inventing fallback recommendations', () => {
  const report = runBenchmark({
    ...input,
    candidates: [candidate('blocked', { a: 1, b: 1 }, 1, 'fail')],
    baskets: [{ ...input.baskets[0], candidateConstraintStates: { blocked: 'fail' } }],
    modes: ['intersection'],
  });
  assert.deepEqual(report.results[0].ranked, []);
  assert.deepEqual(report.results[0].excluded.map((item) => item.candidate_id), ['blocked']);
});

test('duplicate basket ids and unsupported modes fail fast', () => {
  assert.throws(() => runBenchmark({ ...input, baskets: [input.baskets[0], input.baskets[0]] }), /duplicate basket id/);
  assert.throws(() => runBenchmark({ ...input, modes: ['bridge'] }), /unsupported benchmark mode/);
});
