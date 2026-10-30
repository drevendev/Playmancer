import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalogSnapshot } from '../src/catalog.js';
import { canonicalGenreTag, projectFrozenGenres, runFrozenRealEvidenceComparison,
  REAL_EVIDENCE_PROTOCOL, FROZEN_CATALOG_BLOB, FROZEN_PLAN_BLOB } from '../src/evidence-real-pilot.js';
import { evaluateFrozenPilot } from '../scripts/evaluate-real-pilot.mjs';
import { prepareEvidenceModel, compareEvidenceGames } from '../src/evidence-similarity.js';

const raw = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
const snapshot = validateCatalogSnapshot(JSON.parse(raw), { requirePublishable: true });
const copy = () => structuredClone(plan);

test('real pilot projection uses only approved frozen genre/platform receipts; unknown is not zero', () => {
  const profiles = projectFrozenGenres(snapshot);
  assert.equal(profiles.length, 30);
  assert.equal(profiles.filter(item => item.tags !== null).length, 29);
  assert.equal(profiles.find(item => item.id === 'dreven:devmatch').tags, null);
  assert.ok(profiles.every(item => item.coop === null && !('releaseYear' in item.metadata)));
  for (const profile of profiles) {
    if (profile.tags === null) continue;
    const source = snapshot.sources.find(item => item.id === snapshot.games.find(g => g.id === profile.id).sourceId);
    assert.ok(source.rights.fields.includes('themes'));
    assert.ok(Math.abs(profile.tags.reduce((total, tag) => total + tag.weight, 0) - 1) < 1e-9);
    assert.ok(profile.tags.every(tag => tag.id.startsWith('genre:') && tag.source.includes(profile.id)));
    assert.equal(new Set(profile.tags.map(tag => tag.id)).size, profile.tags.length);
  }
  const model = prepareEvidenceModel({ games: profiles, relations: [] });
  const missing = compareEvidenceGames(model, 'dreven:devmatch', 'wikidata:q23013817');
  assert.equal(missing.status, 'uncertain');
  assert.equal(missing.affinity, null);
  assert.equal(canonicalGenreTag('Metroidvania'), 'genre:metroidvania');
  assert.equal(canonicalGenreTag('2D platform game'), 'genre:2d-platform-game');
});

test('frozen 30-basket real-identity comparison shares exact catalog, filters and exclusions', () => {
  const report = runFrozenRealEvidenceComparison(raw, copy());
  assert.equal(report.report_schema, REAL_EVIDENCE_PROTOCOL);
  assert.equal(report.frozen_catalog_git_blob_sha1, FROZEN_CATALOG_BLOB);
  assert.equal(report.frozen_basket_plan_git_blob_sha1, FROZEN_PLAN_BLOB);
  assert.equal(report.catalog_games, 30);
  assert.equal(report.basket_count, 30);
  assert.equal(report.rows.length, 150);
  assert.deepEqual(report.observed_lanes, ['genre', 'platforms']);
  assert.equal(report.curated_relation_count, 0);
  for (const row of report.rows) {
    assert.deepEqual(row.excluded_v2, row.excluded_old);
    assert.ok(row.old_top.length <= 5 && row.v2_top.length <= 5);
    assert.ok(row.v2_top.every(id => !row.seeds.some(s => s.id === id)));
    assert.ok(row.v2_top.every(id => !row.explicit_exclusions.includes(id)));
    assert.ok(row.shared_top_k >= 0 && row.shared_top_k <= 5);
    assert.equal(row.v2_top.length, row.v2_top_observed_evidence.length);
    assert.equal(row.lost_observed_genre_support,
      row.v2_top_all_seed_genre_support < row.old_top_all_seed_genre_support);
  }
});

test('negative cases remain visible: sparse seed abstention and unknown co-op requirements', () => {
  const report = runFrozenRealEvidenceComparison(raw, copy());
  for (const id of ['sparse-devmatch', 'sparse-devmatch-alt', 'required-coop-unknown']) {
    const rows = report.rows.filter(row => row.basket_id === id);
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.deepEqual(row.old_top, []);
      assert.deepEqual(row.v2_top, []);
      assert.ok(row.unknown_v2.length > 0);
    }
  }
});

test('no silent changes to catalog digest, basket plan, rights or genre taxonomy', () => {
  const altered = raw.replace('Stardew Valley', 'Stardew Valley (changed)');
  assert.throws(() => runFrozenRealEvidenceComparison(altered, copy()), /Frozen catalog blob changed/);
  const wrongHash = copy(); wrongHash.catalogBlobSha1 = 'a'.repeat(40);
  assert.throws(() => runFrozenRealEvidenceComparison(raw, wrongHash), /unexpected frozen catalog hash/);
  const wrongSeed = copy(); wrongSeed.baskets[0].seeds[1].id = wrongSeed.baskets[0].seeds[0].id;
  assert.throws(() => runFrozenRealEvidenceComparison(raw, wrongSeed), /frozen basket plan changed/);
  assert.throws(() => evaluateFrozenPilot(raw, wrongSeed), /Duplicate basket seed/);
  const unlicensed = JSON.parse(raw); unlicensed.sources[0].rights.status = 'unreviewed';
  assert.throws(() => projectFrozenGenres(unlicensed), /Publication rights not approved/);
  const collision = JSON.parse(raw);
  collision.games[0].themes = ['Roguelike', 'roguelike'];
  assert.throws(() => projectFrozenGenres(collision), /genre alias collision/);
});

test('valid changed weights, filters and basket order cannot impersonate the predeclared plan', () => {
  const changedWeight = copy();
  changedWeight.baskets[0].seeds[0].weight = 2; // valid under the legacy schema
  assert.doesNotThrow(() => evaluateFrozenPilot(raw, changedWeight));
  assert.throws(() => runFrozenRealEvidenceComparison(raw, changedWeight),
    /frozen basket plan changed/);

  const changedFilter = copy();
  changedFilter.baskets[0].constraints.platform = 'windows';
  assert.throws(() => runFrozenRealEvidenceComparison(raw, changedFilter),
    /frozen basket plan changed/);

  const changedOrder = copy();
  changedOrder.baskets.reverse();
  assert.throws(() => runFrozenRealEvidenceComparison(raw, changedOrder),
    /frozen basket plan changed/);
});

test('reports byte-stable diagnostics without fabricating quality wins', () => {
  const one = runFrozenRealEvidenceComparison(raw, copy());
  const two = runFrozenRealEvidenceComparison(raw, copy());
  assert.equal(JSON.stringify(one), JSON.stringify(two));
  assert.match(one.warning, /no human labels/);
  assert.deepEqual(one.summary.decreased_observed_genre_support_rows,
    one.rows.filter(row => row.lost_observed_genre_support)
      .map(row => ({ basket_id: row.basket_id, mode: row.mode })));
});
