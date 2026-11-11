import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  auditReviewedTagReadiness,
  REVIEWED_TWENTY_NINE_TAGS_BLOB,
  REVIEWED_TWENTY_NINE_TAG_READINESS_PROTOCOL,
} from '../src/reviewed-tag-readiness.js';

const catalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
const reviewed = readFileSync(new URL('../examples/semantic-tags-reviewed-29.v1.json', import.meta.url), 'utf8');
const prior = readFileSync(new URL('../examples/semantic-tags-reviewed-28.v1.json', import.meta.url), 'utf8');
const audit = () => auditReviewedTagReadiness(catalog, plan, reviewed, 'twenty-nine');

test('29 sourced but partial game profiles do not become complete ranking evidence', () => {
  const result = audit();
  assert.equal(result.schema, REVIEWED_TWENTY_NINE_TAG_READINESS_PROTOCOL);
  assert.equal(result.reviewed_tags_git_blob_sha1, REVIEWED_TWENTY_NINE_TAGS_BLOB);
  assert.equal(result.game_count, 30);
  assert.equal(result.basket_count, 30);
  assert.equal(result.scenario_count, 150);
  assert.equal(result.top_k, 5);
  assert.deepEqual(result.modes, ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend']);
  assert.deepEqual(result.tag_profile_coverage, { complete: 0, partial: 29, unknown: 1 });
  assert.deepEqual(result.unordered_game_pairs, {
    rankable: 0, partial: 406, unknown: 29, positive_observed_overlap: 73,
  });
  assert.equal(result.reviewed_nonempty_scenarios, 0);
  assert.ok(result.legacy_nonempty_scenarios > 0);
  assert.equal(result.empty_with_legacy_results, result.legacy_nonempty_scenarios);
  assert.equal(result.eligibility_parity, true);
  assert.equal(result.bridge_evaluated, false);
  assert.equal(result.human_quality_evaluated, false);
  assert.ok(result.rows.every(row => row.reviewed_top.length === 0 &&
    row.eligible_count + row.excluded_count +
    row.hard_constraint_unknown_count === result.game_count));
});

test('Circlanoid observations enlarge compared coverage, not observed overlaps or measured fit', () => {
  const previous = auditReviewedTagReadiness(catalog, plan, prior, 'twenty-eight');
  const current = audit();
  assert.equal(current.unordered_game_pairs.partial - previous.unordered_game_pairs.partial, 28);
  assert.equal(previous.unordered_game_pairs.unknown - current.unordered_game_pairs.unknown, 28);
  assert.equal(current.unordered_game_pairs.positive_observed_overlap, 
    previous.unordered_game_pairs.positive_observed_overlap);
  assert.equal(previous.reviewed_nonempty_scenarios, 0);
  assert.equal(current.reviewed_nonempty_scenarios, 0);
  const profiles = JSON.parse(reviewed).games;
  const ids = new Set(profiles.map(game => game.id));
  assert.equal(profiles.length, 29);
  assert.ok(ids.has('dreven:circlanoid') && !ids.has('dreven:devmatch'));
  assert.ok(profiles.every(game => game.tagCoverage === 'partial'));
  assert.equal(profiles.reduce((n, game) => n + game.tags.length, 0), 118);
});

test('29-profile audit is deterministic and rejects changed catalog, plan and source bytes', () => {
  assert.deepEqual(audit(), audit());
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'twenty-eight'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed + ' ', 'twenty-nine'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog + ' ', plan, reviewed, 'twenty-nine'),
    /catalog blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, { ...plan, topK: 4 }, reviewed, 'twenty-nine'),
    /basket plan changed/);
});

test('--twenty-nine CLI reproduces the exact-blob library report', () => {
  const cli = fileURLToPath(new URL('../scripts/audit-reviewed-tags.mjs', import.meta.url));
  const output = execFileSync(process.execPath, [cli, '--twenty-nine'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(output), audit());
});
