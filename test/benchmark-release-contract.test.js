import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBenchmark } from '../src/benchmark.js';
const fixture = () => ({ catalogSnapshotId: 'synthetic-release-1', methodVersion: 'p03-v0',
  candidates: Array.from({ length: 15 }, (_, i) => ({ id: `game-${String(i).padStart(2, '0')}`,
    affinities: { a: 0.8, b: 0.6 }, evidenceCoverage: 1, hardConstraintState: 'pass' })),
  baskets: [{ id: 'basket-1', seeds: [{ id: 'a' }, { id: 'b' }], constraints: {} }] });
test('default benchmark compares five methods with the same bounded top-k', () => {
  const report = runBenchmark(fixture());
  assert.deepEqual(report.modes, ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend']);
  assert.equal(report.top_k, 10);
  assert.equal(report.report_schema_version, 'p05-report-1');
  assert.equal(report.protocol_version, 'p05-v1');
  for (const result of report.results) assert.equal(result.ranked.length, 10);
});
test('every Blend result records effective parameters, including single-seed runs', () => {
  const input = fixture(); input.blend = { lambda: 0.2 }; input.topK = 3;
  input.baskets[0].seeds = [{ id: 'a' }];
  const report = runBenchmark(input);
  assert.deepEqual(report.blend_parameters, { lambda: 0.2, limit: 3 });
  assert.deepEqual(report.results.find(row => row.mode === 'blend').blend_parameters, { lambda: 0.2, limit: 3 });
  assert.equal(report.results[0].blend_parameters, null);
});
test('unsupported and invalid Blend options are not silently ignored', () => {
  for (const blend of [{ coverageSharpness: 2 }, { lambda: -1 }, { lambda: '0.5' }]) {
    assert.throws(() => runBenchmark({ ...fixture(), blend }), /Blend option|blend.lambda/);
  }
});
test('object key permutations preserve byte-identical JSON reports', () => {
  const input = fixture(); input.baskets[0].constraints = { platform: ['pc'], coop: true };
  input.baskets[0].candidateConstraintStates = Object.fromEntries(input.candidates.map(game => [game.id, 'pass']));
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k,reorder(v)])) : value;
  assert.equal(JSON.stringify(runBenchmark(input)), JSON.stringify(runBenchmark(reorder(input))));
});
test('reports do not retain references to mutable input constraints', () => {
  const input = fixture(); input.baskets[0].constraints = { platform: ['pc'] };
  input.baskets[0].candidateConstraintStates = Object.fromEntries(input.candidates.map(game => [game.id, 'pass']));
  const report = runBenchmark(input); const before = JSON.stringify(report);
  input.baskets[0].constraints.platform.push('console');
  assert.equal(JSON.stringify(report), before);
  report.results[0].constraints.platform.push('test');
  assert.deepEqual(report.results[1].constraints.platform, ['pc']);
});
test('real CLI handles JSON input and errors without partial reports', () => {
  const dir = mkdtempSync(join(tmpdir(), 'playmancer-cli-contract-'));
  try {
    const file = join(dir, 'input.json'); writeFileSync(file, JSON.stringify(fixture()));
    const cli = new URL('../scripts/run-ranking-benchmark.mjs', import.meta.url);
    const run = () => spawnSync(process.execPath, [cli.pathname, file], { encoding: 'utf8' });
    const first = run(), second = run(); assert.equal(first.status, 0, first.stderr); assert.equal(second.stdout, first.stdout);
    assert.equal(JSON.parse(first.stdout).results.length, 5);
    writeFileSync(file, '{bad'); const bad = run(); assert.equal(bad.status, 1); assert.equal(bad.stdout, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
