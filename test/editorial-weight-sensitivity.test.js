import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { auditEditorialSelectedWeights } from '../src/editorial-weight-pilot.js';
import { auditEditorialWeightSensitivity, EDITORIAL_SENSITIVITY_PROTOCOL } from '../src/editorial-weight-sensitivity.js';

const folder = new URL('../examples/', import.meta.url);
const catalog = readFileSync(new URL('catalog.multistore-30.real.json', folder), 'utf8');
const reviewed = readFileSync(new URL('semantic-tags-reviewed-29.v1.json', folder), 'utf8');
const proposalText = readFileSync(new URL('semantic-weights-editorial-4.v1.json', folder), 'utf8');
const proposal = JSON.parse(proposalText);
const baseline = auditEditorialSelectedWeights(catalog, reviewed, proposalText);
const audit = () => auditEditorialWeightSensitivity(proposal, baseline);

test('exact-blob-vetted 4-game experiment yields 32 normalized sensitivity variants, never rankable', () => {
  const report = audit();
  assert.equal(report.protocol, EDITORIAL_SENSITIVITY_PROTOCOL);
  assert.equal(report.variants, 32);
  assert.equal(report.evaluated_scenarios_including_baseline, 33);
  assert.equal(report.complete_profile_count, 0);
  assert.equal(report.v2_rankable_scenarios, 0);
  assert.deepEqual(report.observed_pair_envelopes.map(row => row.baseline_selected_overlap),
    [0.16, 0.16, 0.53, 0.47]);
  assert.deepEqual(report.observed_pair_envelopes.map(row => [
    row.min_selected_overlap, row.max_selected_overlap, row.changed_variants,
  ]), [
    [0.11, 0.21, 8],
    [0.11, 0.21, 8],
    [0.48, 0.577778, 16],
    [0.42, 0.52, 16],
  ]);
  assert.ok(report.observed_pair_envelopes.every(row =>
    row.status === 'uncertain' && row.rankable_affinity === null &&
    row.min_selected_overlap <= row.baseline_selected_overlap &&
    row.max_selected_overlap >= row.baseline_selected_overlap &&
    row.changed_variants > 0));
});

test('finite envelope is deterministic and sensitive to manually allocated weights', () => {
  assert.deepEqual(audit(), audit());
  const first = audit();
  const changed = structuredClone(proposal);
  changed.profiles[0].weightByTag['mechanic:building'] += 0.01;
  changed.profiles[0].weightByTag['mechanic:automation'] -= 0.01;
  assert.throws(() => auditEditorialWeightSensitivity(changed, baseline),
    /vetted overlap|valid partial-only/);
  assert.equal(first.observed_pair_envelopes.length, 4);
});

test('rejects unvetted rows, false complete coverage, and corrupted normalized weights', () => {
  assert.throws(() => auditEditorialWeightSensitivity(proposal, {
    ...baseline, coverage: { complete: 1, partial: 28, unknown: 1 },
  }), /partial-only/);
  assert.throws(() => auditEditorialWeightSensitivity(proposal, {
    ...baseline, pairs: baseline.pairs.map((pair, index) => index === 0 ?
      { ...pair, rankable_affinity: 0.7 } : pair),
  }), /uncertain/);
  const invalid = structuredClone(proposal);
  invalid.profiles[0].weightByTag['mechanic:automation'] = 0.99;
  assert.throws(() => auditEditorialWeightSensitivity(invalid, baseline), /domain|mass/);
});

test('CLI report matches imported library and retains exact source snapshot ids', () => {
  const output = execFileSync(process.execPath,
    [new URL('../scripts/audit-editorial-weight-sensitivity.mjs', import.meta.url).pathname],
    { encoding: 'utf8' });
  const report = JSON.parse(output);
  assert.deepEqual(report, audit());
  assert.equal(report.catalog_git_blob_sha1, baseline.catalog_git_blob_sha1);
  assert.equal(report.reviewed_facts_blob_sha1, baseline.reviewed_facts_blob_sha1);
});
