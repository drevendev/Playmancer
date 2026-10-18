import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const cli = join(root, 'scripts/run-bridge-preview.mjs');
const fixture = JSON.parse(readFileSync(join(root, 'examples/bridge.synthetic.json'), 'utf8'));
const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const withPayload = (payload, fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-cli-'));
  try { const path = join(dir, 'input.json'); writeFileSync(path, JSON.stringify(payload)); return fn(path); }
  finally { rmSync(dir, { recursive: true, force: true }); }
};
test('default fixture returns explainable two-hop route', () => {
  const report = JSON.parse(run());
  assert.equal(report.status, 'route');
  assert.deepEqual(report.nodes, ['demo:ember','demo:tide','demo:harvest']);
  assert.equal(report.hops, 2);
  assert.equal(report.catalog_snapshot_id, 'synthetic-bridge-cli-1');
  assert.equal(report.steps.length, 2);
  assert.ok(report.steps.every(s => s.groups.some(g => g.shared.length > 0)));
  assert.equal(report.route_method_version, 'bridge-features-preview-1');
});
test('identical input reproduces byte-identical JSON without invented timestamps', () => {
  assert.equal(run(), run());
  assert.doesNotMatch(run(), /generatedAt|timestamp|confidencePercentage/);
});
test('hop cap refuses intermediate route instead of relaxing it', () => {
  withPayload({...fixture, maxHops:1}, path => {
    const report=JSON.parse(run(path)); assert.equal(report.status,'no-route');
  });
});
test('hard constraint failure excludes endpoint with reason', () => {
  withPayload({...fixture, platform:'mac'}, path => {
    const report=JSON.parse(run(path));
    assert.equal(report.status,'unavailable-endpoint'); assert.equal(report.reason,'fail');
    assert.equal(report.affected_id,'demo:ember');
  });
});
test('unknown required filter evidence is not a pass', () => {
  withPayload({...fixture, startId:'demo:unknown',platform:'linux'}, path => {
    const report=JSON.parse(run(path));
    assert.equal(report.status,'unavailable-endpoint'); assert.equal(report.reason,'unknown');
  });
});
test('malformed input returns nonzero without pretending to have a report', () => {
  const bad=spawnSync(process.execPath,[cli,'--invalid'],{encoding:'utf8'});
  assert.notEqual(bad.status,0);
  assert.equal(bad.stdout,'');
  assert.match(bad.stderr,/Bridge preview failed:/);
});
