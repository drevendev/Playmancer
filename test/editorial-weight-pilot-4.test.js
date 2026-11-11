import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditEditorialSelectedWeights, EDITORIAL_WEIGHT_PROTOCOL } from '../src/editorial-weight-pilot.js';

const base = new URL('../examples/', import.meta.url);
const catalog = readFileSync(new URL('catalog.multistore-30.real.json', base), 'utf8');
const observed = readFileSync(new URL('semantic-tags-reviewed-29.v1.json', base), 'utf8');
const proposal = readFileSync(new URL('semantic-weights-editorial-4.v1.json', base), 'utf8');
const run = data => auditEditorialSelectedWeights(catalog, observed, JSON.stringify(data));
const pilot = JSON.parse(proposal);

test('four pre-reviewed real games receive editorial nonuniform weights, never complete coverage', () => {
  const result = auditEditorialSelectedWeights(catalog, observed, proposal);
  assert.equal(result.protocol, EDITORIAL_WEIGHT_PROTOCOL);
  assert.equal(result.edited_profiles, 4);
  assert.equal(result.selected_positive_tags, 16);
  assert.deepEqual(result.coverage, { complete: 0, partial: 29, unknown: 1 });
  assert.equal(result.pair_count, 4);
  assert.equal(result.pairs.length, 4);
  assert.ok(result.pairs.every(pair => pair.status === 'uncertain' &&
    pair.rankable_affinity === null && pair.shared_positive_tag_ids.length >= 1));
  assert.equal(result.scenarios.length, 4);
  assert.ok(result.scenarios.every(item => item.ranked === 0 &&
    item.uncertain === 28 && item.excluded === 2));
});

test('source-backed positive overlap changes under editorial hypotheses without inventing mismatch', () => {
  const pairs = auditEditorialSelectedWeights(catalog, observed, proposal).pairs;
  assert.deepEqual(pairs.map(p => [
    p.equal_mass_observed_overlap, p.editorial_observed_overlap, p.difference,
  ]), [
    [0.25, 0.16, -0.09], // Factorio / Terraria: building
    [0.25, 0.16, -0.09], // Factorio / Dwarf Fortress: building
    [0.5, 0.53, 0.03],   // RimWorld / Dwarf Fortress: colony + building
    [0.5, 0.47, -0.03],  // Terraria / Dwarf Fortress: building + digging
  ]);
  assert.deepEqual(pairs[2].shared_positive_tag_ids,
    ['activity:colony-management', 'mechanic:building']);
  assert.deepEqual(pairs[3].shared_positive_tag_ids,
    ['mechanic:building', 'mechanic:digging']);
});

test('fail closed on drift, spurious tags, incomplete mass, typos and false coverage claims', () => {
  const mutate = fn => {
    const changed = structuredClone(pilot);
    fn(changed);
    return changed;
  };
  assert.throws(() => run(mutate(p => { p.catalogGitBlobSha1 = '0000000000000000000000000000000000000000'; })),
    /provenance/);
  assert.throws(() => run(mutate(p => { p.reviewedFactsGitBlobSha1 = 'wrong'; })),
    /provenance/);
  assert.throws(() => run(mutate(p => { p.coverage = 'complete'; })),
    /provenance/);
  assert.throws(() => run(mutate(p => { p.profiles[0].weightByTag['mechanic:unknown'] = 0.01; })),
    /weights/);
  assert.throws(() => run(mutate(p => { delete p.profiles[0].weightByTag['mechanic:logistics']; })),
    /weights/);
  assert.throws(() => run(mutate(p => { p.profiles[0].weightByTag['mechanic:automation'] = 0.5; })),
    /mass must equal 1/);
  assert.throws(() => run(mutate(p => { p.profiles[0].weightByTag['mechanic:automation'] = '0.38'; })),
    /invalid weight/);
  assert.throws(() => run(mutate(p => { p.profiles[0].weightByTag['mechanic:automation'] = -0.1; })),
    /invalid weight/);
  assert.throws(() => run(mutate(p => { p.profiles[0].weightByTag['mechanic:automation'] = null; })),
    /invalid weight/);
  assert.throws(() => run(mutate(p => { p.profiles[2].id = p.profiles[0].id; })),
    /cohort/);
  assert.throws(() => run(mutate(p => { p.profiles[0].tagCoverage = 'complete'; })),
    /fields/);
  assert.throws(() => run(mutate(p => { p.profiles[0].weigths = {}; })),
    /fields/);
  assert.throws(() => auditEditorialSelectedWeights(catalog + '\n', observed, proposal),
    /frozen real catalog changed/);
  assert.throws(() => auditEditorialSelectedWeights(catalog, observed + '\n', proposal),
    /frozen 29-game observation source changed/);
});

test('offline report remains byte-deterministic across repeats', () => {
  const first = auditEditorialSelectedWeights(catalog, observed, proposal);
  const second = auditEditorialSelectedWeights(catalog, observed, proposal);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});
