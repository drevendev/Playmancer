import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  auditReviewedTagReadiness,
  REVIEWED_TWENTY_TWO_TAGS_BLOB,
  REVIEWED_TWENTY_TWO_TAG_READINESS_PROTOCOL,
} from '../src/reviewed-tag-readiness.js';

const catalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
const reviewed = readFileSync(new URL('../examples/semantic-tags-reviewed-22.v1.json', import.meta.url), 'utf8');
const prior = readFileSync(new URL('../examples/semantic-tags-reviewed-16.v1.json', import.meta.url), 'utf8');
const audit = () => auditReviewedTagReadiness(catalog, plan, reviewed, 'twenty-two');

test('22 partial profiles preserve identical frozen eligibility but cannot rank full-game similarity', () => {
  const report = audit();
  assert.equal(report.schema, REVIEWED_TWENTY_TWO_TAG_READINESS_PROTOCOL);
  assert.equal(report.reviewed_tags_git_blob_sha1, REVIEWED_TWENTY_TWO_TAGS_BLOB);
  assert.equal(report.game_count, 30);
  assert.equal(report.basket_count, 30);
  assert.equal(report.scenario_count, 150);
  assert.equal(report.top_k, 5);
  assert.deepEqual(report.modes, ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend']);
  assert.deepEqual(report.tag_profile_coverage, { complete: 0, partial: 22, unknown: 8 });
  assert.deepEqual(report.unordered_game_pairs, {
    rankable: 0, partial: 231, unknown: 204, positive_observed_overlap: 42,
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

test('new positive observations expand paired evidence without changing the abstention gate', () => {
  const previous = auditReviewedTagReadiness(catalog, plan, prior, 'sixteen');
  const current = audit();
  assert.equal(previous.unordered_game_pairs.positive_observed_overlap, 26);
  assert.equal(current.unordered_game_pairs.positive_observed_overlap -
    previous.unordered_game_pairs.positive_observed_overlap, 16);
  assert.equal(previous.reviewed_nonempty_scenarios, 0);
  assert.equal(current.reviewed_nonempty_scenarios, 0);
  const games = new Map(JSON.parse(reviewed).games.map(game => [game.id, game]));
  const shared = (left, right, id) =>
    games.get(left).tags.some(tag => tag.id === id) &&
    games.get(right).tags.some(tag => tag.id === id);
  // Super Meat Boy and Celeste share selected platforming/wall-jumping facts.
  assert.ok(shared('wikidata:q1784048', 'wikidata:q28451532', 'mechanic:wall-jumping'));
  // Portal 2 and The Witness share selected puzzle-solving facts.
  assert.ok(shared('wikidata:q279446', 'wikidata:q1711359', 'mechanic:puzzle-solving'));
  // These positives cannot be inverted into negative claims for missing tags.
  assert.ok([...games.values()].every(game => game.tagCoverage === 'partial'));
});

test('22-profile report is deterministic, exact-blob pinned and fails closed on drift', () => {
  assert.deepEqual(audit(), audit());
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'sixteen'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed + ' ', 'twenty-two'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog + ' ', plan, reviewed, 'twenty-two'),
    /catalog blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, { ...plan, topK: 4 }, reviewed, 'twenty-two'),
    /basket plan changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'twenty-three'),
    /unsupported reviewed-tag audit cohort/);
});

test('standalone --twenty-two CLI reproduces the pinned library report', () => {
  const cli = fileURLToPath(new URL('../scripts/audit-reviewed-tags.mjs', import.meta.url));
  const stdout = execFileSync(process.execPath, [cli, '--twenty-two'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(stdout), audit());
});
