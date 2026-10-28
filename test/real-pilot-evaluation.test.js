import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateFrozenPilot, loadFrozenPilot } from '../scripts/evaluate-real-pilot.mjs';

const sourceText = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));

test('frozen 30-game evaluation is reproducible, explicit and read-only', () => {
  const a = loadFrozenPilot();
  const b = evaluateFrozenPilot(sourceText, plan);
  assert.deepEqual(a, b);
  assert.equal(a.basket_count, 30);
  assert.equal(a.catalog_game_count, 30);
  assert.equal(a.catalog_snapshot_id, plan.catalogSnapshotId);
  assert.equal(a.catalog_git_blob_sha1, plan.catalogBlobSha1);
  assert.equal(a.method_version, 'feature-overlap-2');
  assert.equal(a.top_k, 5);
  assert.deepEqual(a.modes, ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend']);
  assert.equal(a.baskets.length, 30);
  assert.match(a.proxy_only, /not preference/);
  assert.equal(JSON.stringify(a), JSON.stringify(loadFrozenPilot()));
});

test('all methods share eligibility, explicit weights, exclusions and top-k within each basket', () => {
  for (const basket of loadFrozenPilot().baskets) {
    assert.equal(basket.results.length, 5, basket.basket_id);
    assert.equal(basket.single_seed_neighbors.length, basket.seed_ids.length, basket.basket_id);
    const initial = basket.results[0];
    const expectedUncertain = initial.uncertain;
    const expectedExcluded = initial.excluded;
    for (const row of basket.results) {
      assert.equal(row.basket_id, basket.basket_id);
      assert.equal(row.top_k, 5);
      assert.equal(row.catalog_snapshot_id, plan.catalogSnapshotId);
      assert.deepEqual(row.seed_ids, [...basket.seed_ids].sort(), basket.basket_id);
      assert.deepEqual(row.uncertain, expectedUncertain, basket.basket_id + '/' + row.mode);
      assert.deepEqual(row.excluded, expectedExcluded, basket.basket_id + '/' + row.mode);
      assert.ok(row.ranked.length <= 5);
      assert.deepEqual(row.excluded_candidate_ids, [...basket.excluded_candidate_ids].sort());
      for (const item of row.ranked) {
        assert.ok(!basket.seed_ids.includes(item.candidate_id), 'seed leaked into recommendation');
        assert.ok(!basket.excluded_candidate_ids.includes(item.candidate_id), 'exclusion leaked into recommendation');
        assert.equal(item.evidence_coverage, 0.3, 'ranked item has known genre-only evidence');
        for (const seedId of basket.seed_ids) {
          const affinity = item.per_seed_affinity[seedId];
          assert.ok(typeof affinity === 'number' && affinity >= 0 && affinity <= 1);
        }
      }
      assert.deepEqual(basket.mode_diagnostics[row.mode].top_ids,
        row.ranked.map(item => item.candidate_id));
    }
    for (const one of basket.single_seed_neighbors) {
      assert.ok(one.top_ids.length <= 5);
      assert.ok(one.top_ids.every(id => !basket.seed_ids.includes(id)),
        basket.basket_id + '/' + one.seed_id + ': single-seed reference leaked a selected basket game');
      assert.ok(one.top_ids.every(id => !basket.excluded_candidate_ids.includes(id)));
    }
  }
});

test('the platformer single-seed baseline excludes the other selected favorites', () => {
  const basket = loadFrozenPilot().baskets.find(row => row.basket_id === 'coherent-platformer');
  assert.ok(basket);
  const celeste = basket.single_seed_neighbors.find(row => row.seed_id === 'wikidata:q28451532');
  assert.ok(celeste);
  // Spiritfarer and Shadow Runner were formerly ranked #1/#2 despite being seeds.
  assert.deepEqual(celeste.top_ids, [
    'wikidata:q30639210',
    'dreven:circlanoid',
    'dreven:hunter-adventure',
    'dreven:idle-fantasy-shop',
    'wikidata:q109051201',
  ]);
  assert.ok(basket.single_seed_neighbors.every(one =>
    one.top_ids.every(id => !basket.seed_ids.includes(id))));
});

test('missing genres and unknown co-op abstain instead of becoming zero or pass', () => {
  const report = loadFrozenPilot();
  const sparse = report.baskets.find(b => b.basket_id === 'sparse-devmatch');
  assert.ok(sparse);
  for (const row of sparse.results) {
    assert.equal(row.ranked.length, 0);
    assert.ok(row.uncertain.some(item => item.reason === 'missing-seed-affinity'));
  }
  const coop = report.baskets.find(b => b.basket_id === 'required-coop-unknown');
  assert.ok(coop);
  for (const row of coop.results) {
    assert.equal(row.ranked.length, 0);
    assert.equal(row.uncertain.length, 28);
    assert.ok(row.uncertain.every(item => item.reason === 'hard-constraint-unknown'));
  }
  assert.ok(report.summary.all_modes_abstained_baskets.includes(coop.basket_id));
  assert.ok(report.summary.all_modes_abstained_baskets.includes(sparse.basket_id));
});

test('constrained platform rows retain unknown and excluded identities', () => {
  const report = loadFrozenPilot();
  const windows = report.baskets.find(b => b.basket_id === 'required-windows');
  const browser = report.baskets.find(b => b.basket_id === 'required-browser-exclusion');
  assert.ok(windows);
  assert.ok(browser);
  assert.ok(windows.results[0].uncertain.some(row =>
    row.candidate_id === 'wikidata:q24300' && row.reason === 'hard-constraint-unknown'));
  for (const row of browser.results) {
    assert.ok(row.excluded.some(item => item.candidate_id === 'dreven:circlanoid' &&
      item.reason === 'basket-exclusion'));
    assert.ok(row.ranked.every(item =>
      item.candidate_id !== 'dreven:circlanoid'));
  }
});

test('new catalog bits, duplicate seeds and invalid constraints cannot silently change the frozen evaluation', () => {
  const alteredCatalog = sourceText.replace('Stardew Valley', 'Stardew Vally');
  assert.throws(() => evaluateFrozenPilot(alteredCatalog, plan), /Frozen catalog blob changed/);
  const extra = structuredClone(plan);
  extra.baskets[0].seeds[0].id = 'not-a-game';
  assert.throws(() => evaluateFrozenPilot(sourceText, extra), /Unknown basket seed/);
  const duplicate = structuredClone(plan);
  duplicate.baskets[0].seeds[1].id = duplicate.baskets[0].seeds[0].id;
  assert.throws(() => evaluateFrozenPilot(sourceText, duplicate), /Duplicate basket seed/);
  const invalid = structuredClone(plan);
  invalid.baskets[0].constraints = { inventedMultiplayer: true };
  assert.throws(() => evaluateFrozenPilot(sourceText, invalid), /Unknown hard constraint/);
  const excluded = structuredClone(plan);
  excluded.baskets[0].excludedCandidateIds = [excluded.baskets[0].seeds[0].id];
  assert.throws(() => evaluateFrozenPilot(sourceText, excluded), /Invalid exclusion/);
});

test('the frozen pilot retains negative proxy comparisons (not user preference)', () => {
  const report = loadFrozenPilot();
  assert.deepEqual(report.summary.all_modes_abstained_baskets,
    ['sparse-devmatch', 'sparse-devmatch-alt', 'required-coop-unknown']);
  assert.equal(report.summary.no_all_seed_intersection_support_baskets.length, 17);
  assert.equal(report.summary.blend_identical_to_arithmetic_baskets.length, 21);
  // Nine baskets have a different Blend list from the arithmetic baseline;
  // differences in ordering alone are not evidence of improved usefulness.
  assert.equal(report.basket_count - report.summary.blend_identical_to_arithmetic_baskets.length, 9);
});
