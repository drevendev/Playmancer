import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runEvidenceComparison } from '../src/evidence-comparison.js';

const fixture = JSON.parse(readFileSync(new URL('../examples/evidence-comparison.synthetic.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(fixture);

test('paired synthetic comparison uses identical catalog, hard filters, exclusions and top-k', () => {
  const report = runEvidenceComparison(clone());
  assert.equal(report.report_schema, 'p76-synthetic-paired-1');
  assert.equal(report.catalog_snapshot_id, 'synthetic-demo-1');
  assert.equal(report.game_count, 12);
  assert.equal(report.rows.length, fixture.baskets.length * 5);
  for (const row of report.rows) {
    assert.ok(row.old.top.length <= report.top_k && row.v2.top.length <= report.top_k);
    assert.deepEqual(row.old.excluded, row.v2.excluded);
    assert.ok(row.old.top.every(id => !row.excluded_ids.includes(id)));
    assert.ok(row.v2.top.every(id => !row.excluded_ids.includes(id)));
    assert.ok(row.old.top.every(id => !row.seeds.some(seed => seed.id === id)));
    assert.ok(row.v2.top.every(id => !row.seeds.some(seed => seed.id === id)));
    assert.ok(row.shared_top_k >= 0 && row.shared_top_k <= report.top_k);
    assert.equal(row.probe_delta, row.probe_hits_v2 - row.probe_hits_old);
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
  }
  for (const row of report.rows.filter(row => row.basket_id === 'linux-coop-puzzles')) {
    assert.ok(row.old.excluded.includes('demo:ember'));
    assert.ok(row.old.uncertain.includes('demo:echo'));
    assert.deepEqual(row.old.excluded, row.v2.excluded);
  }
});
