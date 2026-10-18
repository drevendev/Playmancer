import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBenchmark } from '../src/benchmark.js';

const modes = ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend'];
const seeds = [{ id: 'seed-a' }, { id: 'seed-b' }];
const candidate = (id, state = 'pass') => ({
  id, affinities: { 'seed-a': 0.8, 'seed-b': 0.6 },
  evidenceCoverage: 1, hardConstraintState: state,
});
const fixture = () => ({
  catalogSnapshotId: 'synthetic-constraints-v1', methodVersion: 'p03-v0', modes,
  candidates: [candidate('pc-only'), candidate('console-only')],
  baskets: [
    { id: 'pc', seeds, constraints: { platform: ['pc'] },
      candidateConstraintStates: { 'pc-only': 'pass', 'console-only': 'fail' } },
    { id: 'console', seeds, constraints: { platform: ['console'] },
      candidateConstraintStates: { 'pc-only': 'fail', 'console-only': 'pass' } },
  ],
});
const ids = (items) => items.map((item) => item.candidate_id);

for (const mode of modes) {
  test(`basket constraints are isolated for ${mode}`, () => {
    const report = runBenchmark({ ...fixture(), modes: [mode] });
    assert.deepEqual(ids(report.results[0].ranked), ['pc-only']);
    assert.deepEqual(ids(report.results[1].ranked), ['console-only']);
    assert.deepEqual(ids(report.results[0].excluded), ['console-only']);
    assert.deepEqual(ids(report.results[1].excluded), ['pc-only']);
    for (const result of report.results) assert.equal(result.constraint_state_source, 'basket');
  });
}

test('nonempty constraints without a basket map fail closed', () => {
  const input = fixture();
  delete input.baskets[0].candidateConstraintStates;
  assert.throws(() => runBenchmark(input), /basket pc requires candidateConstraintStates/);
});

test('incomplete maps never inherit a global pass or a prototype value', () => {
  for (const map of [{ 'pc-only': 'pass' }, Object.create({ 'pc-only': 'pass', 'console-only': 'pass' })]) {
    const input = fixture();
    input.baskets[0].candidateConstraintStates = map;
    assert.throws(() => runBenchmark(input), /missing constraint state/);
  }
});

test('invalid map objects, invalid states and unknown candidate IDs are rejected', () => {
  for (const map of [null, [], 'pass', 1]) {
    const input = fixture();
    input.baskets[0].candidateConstraintStates = map;
    assert.throws(() => runBenchmark(input), /must be an object/);
  }
  for (const state of [undefined, null, true, 'PASS', '', 0, 'unsupported']) {
    const input = fixture();
    input.baskets[0].candidateConstraintStates['pc-only'] = state;
    assert.throws(() => runBenchmark(input), /invalid constraint state/);
  }
  const input = fixture();
  input.baskets[0].candidateConstraintStates.ghost = 'pass';
  assert.throws(() => runBenchmark(input), /unknown candidate id: ghost/);
});

test('unknown and fail produce no fallback, consistently in every mode', () => {
  const input = fixture();
  input.baskets = [{ ...input.baskets[0], candidateConstraintStates: {
    'pc-only': 'unknown', 'console-only': 'fail',
  } }];
  for (const result of runBenchmark(input).results) {
    assert.deepEqual(result.ranked, []);
    assert.deepEqual(result.uncertain.map((item) => [item.candidate_id, item.reason]),
      [['pc-only', 'hard-constraint-unknown']]);
    assert.deepEqual(result.excluded.map((item) => [item.candidate_id, item.reason]),
      [['console-only', 'hard-constraint-fail']]);
  }
});

test('unconstrained legacy fixtures preserve global candidate classifications', () => {
  const input = fixture();
  input.candidates[1].hardConstraintState = 'unknown';
  input.baskets = [{ id: 'unconstrained', seeds }];
  for (const result of runBenchmark(input).results) {
    assert.equal(result.constraint_state_source, 'candidate');
    assert.deepEqual(ids(result.ranked), ['pc-only']);
    assert.deepEqual(ids(result.uncertain), ['console-only']);
  }
});

test('explicit maps are authoritative even with empty constraints and stale global states', () => {
  const input = fixture();
  input.candidates[0].hardConstraintState = 'fail';
  input.baskets = [{ ...input.baskets[0], constraints: {} }];
  for (const result of runBenchmark(input).results) {
    assert.equal(result.constraint_state_source, 'basket');
    assert.deepEqual(ids(result.ranked), ['pc-only']);
    assert.deepEqual(ids(result.excluded), ['console-only']);
  }
});

test('constraint pass does not erase missing affinity or seed exclusion', () => {
  const input = fixture();
  delete input.candidates[0].affinities['seed-b'];
  input.candidates.push(candidate('seed-a'));
  for (const basket of input.baskets) basket.candidateConstraintStates['seed-a'] = 'pass';
  const pc = runBenchmark({ ...input, modes: ['intersection'] }).results[0];
  assert.deepEqual(pc.ranked, []);
  assert.equal(pc.uncertain[0].reason, 'missing-seed-affinity');
  assert.deepEqual(pc.uncertain[0].missing_seed_ids, ['seed-b']);
  assert.ok(pc.excluded.some((item) => item.candidate_id === 'seed-a' && item.reason === 'seed'));
});

test('inputs remain immutable and repeated/reordered basket runs are deterministic', () => {
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const input = freeze(fixture());
  const before = JSON.stringify(input);
  const report = runBenchmark(input);
  assert.deepEqual(runBenchmark(input), report);
  const reversed = runBenchmark({ ...input, baskets: [...input.baskets].reverse() });
  for (const record of report.results) {
    assert.deepEqual(reversed.results.find((item) =>
      item.basket_id === record.basket_id && item.mode === record.mode), record);
  }
  assert.equal(JSON.stringify(input), before);
});

test('catalog duplicate IDs and malformed candidates cannot make map scope ambiguous', () => {
  const input = fixture();
  input.candidates.push({ ...input.candidates[0] });
  assert.throws(() => runBenchmark(input), /duplicate candidate id: pc-only/);
  for (const bad of [null, [], {}, { id: '' }]) {
    assert.throws(() => runBenchmark({ ...fixture(), candidates: [bad] }), TypeError);
  }
});

test('empty catalogs with explicit empty maps are valid and remain empty', () => {
  const input = fixture();
  input.candidates = [];
  for (const basket of input.baskets) basket.candidateConstraintStates = {};
  for (const result of runBenchmark(input).results) {
    assert.deepEqual(result.ranked, []);
    assert.deepEqual(result.uncertain, []);
    assert.deepEqual(result.excluded, []);
  }
});

test('candidate IDs matching prototype properties are treated as ordinary data', () => {
  const input = fixture();
  input.candidates = [candidate('__proto__'), candidate('constructor')];
  input.baskets = [{ id: 'reserved-ids', seeds, constraints: { platform: ['pc'] },
    candidateConstraintStates: JSON.parse('{"__proto__":"pass","constructor":"fail"}') }];
  for (const result of runBenchmark(input).results) {
    assert.deepEqual(ids(result.ranked), ['__proto__']);
    assert.deepEqual(ids(result.excluded), ['constructor']);
  }
});

test('explicit malformed constraints are not silently interpreted as no constraints', () => {
  for (const constraints of [null, false, 1, '', []]) {
    const input = fixture();
    input.baskets[0].constraints = constraints;
    assert.throws(() => runBenchmark(input), /constraints for pc must be an object/);
  }
});

test('CLI emits complete valid JSON, but no partial report for a later invalid basket', () => {
  const dir = mkdtempSync(join(tmpdir(), 'playmancer-constraint-'));
  try {
    const path = join(dir, 'fixture.json');
    const cli = fileURLToPath(new URL('../scripts/run-ranking-benchmark.mjs', import.meta.url));
    const input = fixture();
    writeFileSync(path, JSON.stringify(input));
    const valid = spawnSync(process.execPath, [cli, path], { encoding: 'utf8', timeout: 10000 });
    assert.equal(valid.status, 0, valid.stderr);
    assert.deepEqual(ids(JSON.parse(valid.stdout).results[0].ranked), ['pc-only']);
    delete input.baskets[1].candidateConstraintStates;
    writeFileSync(path, JSON.stringify(input));
    const invalid = spawnSync(process.execPath, [cli, path], { encoding: 'utf8', timeout: 10000 });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.match(invalid.stderr, /basket console requires candidateConstraintStates/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
