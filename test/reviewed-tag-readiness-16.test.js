import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  auditReviewedTagReadiness, REVIEWED_SIXTEEN_TAGS_BLOB,
  REVIEWED_SIXTEEN_TAG_READINESS_PROTOCOL,
} from '../src/reviewed-tag-readiness.js';

const catalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
const reviewed = readFileSync(new URL('../examples/semantic-tags-reviewed-16.v1.json', import.meta.url), 'utf8');
const fourteen = readFileSync(new URL('../examples/semantic-tags-reviewed-14.v1.json', import.meta.url), 'utf8');
const audit = () => auditReviewedTagReadiness(catalog, plan, reviewed, 'sixteen');

test('sixteen partial profiles preserve frozen eligibility and abstain in all modes', () => {
  const report = audit();
  assert.equal(report.schema, REVIEWED_SIXTEEN_TAG_READINESS_PROTOCOL);
  assert.equal(report.reviewed_tags_git_blob_sha1, REVIEWED_SIXTEEN_TAGS_BLOB);
  assert.equal(report.game_count, 30);
  assert.equal(report.basket_count, 30);
  assert.equal(report.scenario_count, 150);
  assert.equal(report.top_k, 5);
  assert.deepEqual(report.tag_profile_coverage, { complete: 0, partial: 16, unknown: 14 });
  assert.deepEqual({
    rankable: report.unordered_game_pairs.rankable,
    partial: report.unordered_game_pairs.partial,
    unknown: report.unordered_game_pairs.unknown,
  }, { rankable: 0, partial: 120, unknown: 315 });
  assert.equal(report.unordered_game_pairs.partial + report.unordered_game_pairs.unknown, 435);
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

test('new source-backed Inscryption overlap is observable without manufacturing affinity', () => {
  const current = JSON.parse(reviewed);
  const byId = new Map(current.games.map(game => [game.id, game]));
  const inscryption = byId.get('wikidata:q109051201');
  const slay = byId.get('wikidata:q48078440');
  assert.equal(inscryption.tagCoverage, 'partial');
  assert.equal(slay.tagCoverage, 'partial');
  assert.ok(inscryption.tags.some(tag => tag.id === 'mechanic:deck-building'));
  assert.ok(slay.tags.some(tag => tag.id === 'mechanic:deck-building'));
  const previous = auditReviewedTagReadiness(catalog, plan, fourteen, 'fourteen');
  const now = audit();
  assert.equal(now.unordered_game_pairs.positive_observed_overlap,
    previous.unordered_game_pairs.positive_observed_overlap + 1);
  assert.equal(now.unordered_game_pairs.rankable, 0);
  assert.equal(now.reviewed_nonempty_scenarios, 0);
});

test('sixteen-game audit is deterministic and fails closed on input drift', () => {
  assert.deepEqual(audit(), audit());
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'fourteen'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed, 'seventeen'),
    /unsupported reviewed-tag audit cohort/);
  assert.throws(() => auditReviewedTagReadiness(catalog, plan, reviewed + ' ', 'sixteen'),
    /reviewed tag blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog + ' ', plan, reviewed, 'sixteen'),
    /catalog blob changed/);
  assert.throws(() => auditReviewedTagReadiness(catalog, { ...plan, topK: 4 }, reviewed, 'sixteen'),
    /basket plan changed/);
});

test('standalone --sixteen CLI reproduces the pinned library report', () => {
  const cli = fileURLToPath(new URL('../scripts/audit-reviewed-tags.mjs', import.meta.url));
  const stdout = execFileSync(process.execPath, [cli, '--sixteen'], {
    encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
  });
  assert.deepEqual(JSON.parse(stdout), audit());
});
