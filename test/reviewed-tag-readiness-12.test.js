import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  auditReviewedTagReadiness, REVIEWED_TWELVE_TAGS_BLOB,
  REVIEWED_TWELVE_TAG_READINESS_PROTOCOL,
} from '../src/reviewed-tag-readiness.js';

const catalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
const reviewed = readFileSync(new URL('../examples/semantic-tags-reviewed-12.v1.json', import.meta.url), 'utf8');
const audit = () => auditReviewedTagReadiness(catalog, plan, reviewed, 'twelve');

test('twelve-game readiness uses the same frozen baskets, exclusions, hard filters and top-k', () => {
  const result = audit();
  assert.equal(result.schema, REVIEWED_TWELVE_TAG_READINESS_PROTOCOL);
  assert.equal(result.reviewed_tags_git_blob_sha1, REVIEWED_TWELVE_TAGS_BLOB);
  assert.equal(result.game_count, 30);
  assert.equal(result.basket_count, 30);
  assert.equal(result.scenario_count, 150);
  assert.equal(result.top_k, 5);
  assert.deepEqual(result.tag_profile_coverage, { complete: 0, partial: 12, unknown: 18 });
  assert.equal(result.unordered_game_pairs.rankable, 0);
  assert.equal(result.unordered_game_pairs.partial, 66);
  assert.equal(result.unordered_game_pairs.unknown, 369);
  assert.ok(result.unordered_game_pairs.positive_observed_overlap > 0);
  assert.equal(result.reviewed_nonempty_scenarios, 0);
  assert.ok(result.legacy_nonempty_scenarios > 0);
  assert.equal(result.empty_with_legacy_results, result.legacy_nonempty_scenarios);
  assert.equal(result.eligibility_parity, true);
  assert.equal(result.bridge_evaluated, false);
  assert.equal(result.human_quality_evaluated, false);
  assert.deepEqual(result.modes, ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend']);
  assert.ok(result.rows.every(row => row.reviewed_top.length === 0));
  assert.ok(result.rows.every(row => row.eligible_count + row.excluded_count +
    row.hard_constraint_unknown_count === result.game_count));
  assert.ok(result.rows.filter(row => row.basket_id === 'required-coop-unknown')
    .every(row => row.hard_constraint_unknown_count === 28 && row.eligible_count === 0));
});

test('twelve-game audit is deterministic and rejects fixture, catalog and plan drift', () => {
  assert.deepEqual(audit(), audit());
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'eight'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'thirteen'),
    /unsupported reviewed-tag audit cohort/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed.replace('0.25', '0.24'), 'twelve'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog + ' ', plan, reviewed, 'twelve'),
    /catalog blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, { ...plan, topK: 4 }, reviewed, 'twelve'),
    /basket plan changed/);
});

test('standalone --twelve CLI emits the exact twelve-game library report', () => {
  const cliPath = fileURLToPath(new URL('../scripts/audit-reviewed-tags.mjs', import.meta.url));
  const stdout = execFileSync(process.execPath, [cliPath, '--twelve'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(stdout), audit());
  assert.equal(JSON.parse(stdout).scenario_count, 150);
});
