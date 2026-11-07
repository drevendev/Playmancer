import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  auditReviewedTagReadiness,
  REVIEWED_TWENTY_EIGHT_TAGS_BLOB,
  REVIEWED_TWENTY_EIGHT_TAG_READINESS_PROTOCOL,
} from '../src/reviewed-tag-readiness.js';

const catalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
const reviewed = readFileSync(new URL('../examples/semantic-tags-reviewed-28.v1.json', import.meta.url), 'utf8');
const previous = readFileSync(new URL('../examples/semantic-tags-reviewed-22.v1.json', import.meta.url), 'utf8');
const audit = () => auditReviewedTagReadiness(catalog, plan, reviewed, 'twenty-eight');

test('28 partial profiles never masquerade as complete v2 affinity on frozen baskets', () => {
  const report = audit();
  assert.equal(report.schema, REVIEWED_TWENTY_EIGHT_TAG_READINESS_PROTOCOL);
  assert.equal(report.reviewed_tags_git_blob_sha1, REVIEWED_TWENTY_EIGHT_TAGS_BLOB);
  assert.equal(report.game_count, 30);
  assert.equal(report.basket_count, 30);
  assert.equal(report.scenario_count, 150);
  assert.equal(report.top_k, 5);
  assert.deepEqual(report.modes, ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend']);
  assert.deepEqual(report.tag_profile_coverage, { complete: 0, partial: 28, unknown: 2 });
  assert.deepEqual(report.unordered_game_pairs, {
    rankable: 0, partial: 378, unknown: 57, positive_observed_overlap: 73,
  });
  assert.equal(report.reviewed_nonempty_scenarios, 0);
  assert.ok(report.legacy_nonempty_scenarios > 0);
  assert.equal(report.empty_with_legacy_results, report.legacy_nonempty_scenarios);
  assert.equal(report.eligibility_parity, true);
  assert.equal(report.bridge_evaluated, false);
  assert.equal(report.human_quality_evaluated, false);
  assert.ok(report.rows.every(row => row.reviewed_top.length === 0 &&
    row.eligible_count + row.excluded_count +
    row.hard_constraint_unknown_count === report.game_count));
  assert.ok(report.rows.filter(row => row.basket_id === 'required-coop-unknown')
    .every(row => row.hard_constraint_unknown_count === 28 && row.eligible_count === 0));
});

test('additional positive observations widen only factual overlap, not rankable evidence', () => {
  const prior = auditReviewedTagReadiness(catalog, plan, previous, 'twenty-two');
  const current = audit();
  assert.equal(prior.unordered_game_pairs.positive_observed_overlap, 42);
  assert.equal(current.unordered_game_pairs.positive_observed_overlap, 73);
  assert.equal(current.unordered_game_pairs.positive_observed_overlap -
    prior.unordered_game_pairs.positive_observed_overlap, 31);
  assert.equal(prior.reviewed_nonempty_scenarios, 0);
  assert.equal(current.reviewed_nonempty_scenarios, 0);
  const games = new Map(JSON.parse(reviewed).games.map(game => [game.id, game]));
  assert.ok(games.get('dreven:shadow-runner').tags.some(tag => tag.id === 'mechanic:platforming'));
  assert.ok(games.get('wikidata:q28451532').tags.some(tag => tag.id === 'mechanic:platforming'));
  assert.ok([...games.values()].every(game => game.tagCoverage === 'partial'));
  assert.ok(!games.has('dreven:devmatch') && !games.has('dreven:circlanoid'));
});

test('28-profile cohort is deterministic, version-pinned and fails closed on drift', () => {
  assert.deepEqual(audit(), audit());
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'twenty-two'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed + ' ', 'twenty-eight'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog + ' ', plan, reviewed, 'twenty-eight'),
    /catalog blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, { ...plan, topK: 4 }, reviewed, 'twenty-eight'),
    /basket plan changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'twenty-nine'),
    /unsupported reviewed-tag audit cohort/);
});

test('--twenty-eight CLI reproduces the exact-blob library report', () => {
  const cli = fileURLToPath(new URL('../scripts/audit-reviewed-tags.mjs', import.meta.url));
  const stdout = execFileSync(process.execPath, [cli, '--twenty-eight'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(stdout), audit());
});
