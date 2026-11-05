import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  auditReviewedTagReadiness, REVIEWED_FOURTEEN_TAGS_BLOB,
  REVIEWED_FOURTEEN_TAG_READINESS_PROTOCOL,
} from '../src/reviewed-tag-readiness.js';

const catalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
const reviewed = readFileSync(new URL('../examples/semantic-tags-reviewed-14.v1.json', import.meta.url), 'utf8');
const audit = () => auditReviewedTagReadiness(catalog, plan, reviewed, 'fourteen');

test('fourteen selected-fact games preserve strict same-catalog eligibility and v2 abstention', () => {
  const report = audit();
  assert.equal(report.schema, REVIEWED_FOURTEEN_TAG_READINESS_PROTOCOL);
  assert.equal(report.reviewed_tags_git_blob_sha1, REVIEWED_FOURTEEN_TAGS_BLOB);
  assert.equal(report.game_count, 30);
  assert.equal(report.basket_count, 30);
  assert.equal(report.scenario_count, 150);
  assert.equal(report.top_k, 5);
  assert.deepEqual(report.tag_profile_coverage, { complete: 0, partial: 14, unknown: 16 });
  assert.deepEqual({
    rankable: report.unordered_game_pairs.rankable,
    partial: report.unordered_game_pairs.partial,
    unknown: report.unordered_game_pairs.unknown,
  }, { rankable: 0, partial: 91, unknown: 344 });
  assert.equal(report.unordered_game_pairs.partial + report.unordered_game_pairs.unknown, 435);
  assert.ok(report.unordered_game_pairs.positive_observed_overlap > 0);
  assert.equal(report.reviewed_nonempty_scenarios, 0);
  assert.ok(report.legacy_nonempty_scenarios > 0);
  assert.equal(report.empty_with_legacy_results, report.legacy_nonempty_scenarios);
  assert.equal(report.eligibility_parity, true);
  assert.equal(report.bridge_evaluated, false);
  assert.equal(report.human_quality_evaluated, false);
  assert.deepEqual(report.modes, ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend']);
  assert.ok(report.rows.every(row => row.reviewed_top.length === 0));
  assert.ok(report.rows.every(row => row.eligible_count + row.excluded_count +
    row.hard_constraint_unknown_count === report.game_count));
  assert.ok(report.rows.filter(row => row.basket_id === 'required-coop-unknown')
    .every(row => row.hard_constraint_unknown_count === 28 && row.eligible_count === 0));
});

test('fourteen-game readiness is deterministic and rejects source or plan drift', () => {
  assert.deepEqual(audit(), audit());
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'twelve'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'fifteen'),
    /unsupported reviewed-tag audit cohort/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed + ' ', 'fourteen'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog + ' ', plan, reviewed, 'fourteen'),
    /catalog blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, { ...plan, topK: 4 }, reviewed, 'fourteen'),
    /basket plan changed/);
});

test('standalone --fourteen CLI reproduces the exact frozen library report', () => {
  const cliPath = fileURLToPath(new URL('../scripts/audit-reviewed-tags.mjs', import.meta.url));
  const stdout = execFileSync(process.execPath, [cliPath, '--fourteen'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(stdout), audit());
});
