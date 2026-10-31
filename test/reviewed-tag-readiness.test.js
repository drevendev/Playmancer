import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditReviewedTagReadiness, REVIEWED_EIGHT_TAGS_BLOB } from '../src/reviewed-tag-readiness.js';

const catalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
const reviewed = readFileSync(new URL('../examples/semantic-tags-reviewed-8.v1.json', import.meta.url), 'utf8');

test('frozen eight-game selected-fact audit proves abstention across identical 30-basket eligibility', () => {
  const report = auditReviewedTagReadiness(catalog, plan, reviewed);
  assert.equal(report.schema, 'p76-reviewed-eight-readiness-1');
  assert.equal(report.reviewed_tags_git_blob_sha1, REVIEWED_EIGHT_TAGS_BLOB);
  assert.equal(report.game_count, 30);
  assert.equal(report.basket_count, 30);
  assert.equal(report.scenario_count, 150);
  assert.equal(report.top_k, 5);
  assert.deepEqual(report.tag_profile_coverage, { complete: 0, partial: 8, unknown: 22 });
  assert.deepEqual(report.unordered_game_pairs, {
    rankable: 0, partial: 28, unknown: 407,
    positive_observed_overlap: report.unordered_game_pairs.positive_observed_overlap,
  });
  assert.ok(report.unordered_game_pairs.positive_observed_overlap > 0);
  assert.equal(report.reviewed_nonempty_scenarios, 0);
  assert.ok(report.legacy_nonempty_scenarios > 0);
  assert.equal(report.empty_with_legacy_results, report.legacy_nonempty_scenarios);
  assert.equal(report.eligibility_parity, true);
  assert.equal(report.bridge_evaluated, false);
  assert.equal(report.human_quality_evaluated, false);
  assert.deepEqual(report.modes, ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend']);
  assert.ok(report.rows.every(row => row.reviewed_top.length === 0));
  assert.deepEqual(report.rows.filter(row => row.basket_id === 'required-coop-unknown')
    .map(row => row.mode), report.modes);
  assert.ok(report.rows.filter(row => row.basket_id === 'required-coop-unknown')
    .every(row => row.hard_constraint_unknown_count === 28 && row.eligible_count === 0));
  assert.ok(report.rows.every(row => row.eligible_count + row.excluded_count +
    row.hard_constraint_unknown_count === report.game_count));
});

test('audit is stable and rejects any unversioned change to source, plan or selected facts', () => {
  const first = auditReviewedTagReadiness(catalog, plan, reviewed);
  const second = auditReviewedTagReadiness(catalog, plan, reviewed);
  assert.deepEqual(first, second);
  assert.throws(() => auditReviewedTagReadiness(catalog.replace('Stardew Valley', 'Other Name'), plan, reviewed),
    /catalog blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed.replace('0.25', '0.24')),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, { ...plan, topK: 4 }, reviewed),
    /basket plan changed/);
});

test('standalone audit CLI produces the same exact-blob report as the library', () => {
  const cliPath = fileURLToPath(new URL('../scripts/audit-reviewed-tags.mjs', import.meta.url));
  // Run the actual public CLI entry point, not only its imported audit function.
  const stdout = execFileSync(process.execPath, [cliPath], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  const fromCli = JSON.parse(stdout);
  const fromLibrary = auditReviewedTagReadiness(catalog, plan, reviewed);
  assert.deepEqual(fromCli, fromLibrary);
  assert.equal(fromCli.scenario_count, 150);
  assert.equal(fromCli.reviewed_nonempty_scenarios, 0);
});
