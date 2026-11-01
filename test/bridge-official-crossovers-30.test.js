import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  loadOfficialCrossoverReport, compareOfficialCrossoverReceipts,
  validateOfficialCrossoverReceipts, OFFICIAL_CROSSOVER_PROTOCOL,
} from '../scripts/compare-bridge-curated-receipts-30.mjs';
import { projectFrozenGenres } from '../src/evidence-real-pilot.js';
import { prepareEvidenceModel } from '../src/evidence-similarity.js';
import { findCuratedBridge } from '../src/evidence-bridge.js';

const SOURCE = new URL('../examples/curated-relations.official-3.json', import.meta.url);
const CATALOG = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const manifest = () => JSON.parse(readFileSync(SOURCE, 'utf8'));
const graph = () => prepareEvidenceModel({
  games: projectFrozenGenres(JSON.parse(readFileSync(CATALOG, 'utf8'))),
  relations: validateOfficialCrossoverReceipts(manifest()),
});
const DEAD = 'wikidata:q30639210';
const HOLLOW = 'wikidata:q29300592';
const TERRARIA = 'wikidata:q332697';
const SPIRE = 'wikidata:q48078440';

test('pins three first-party factual crossover receipts, not inferred genre links', () => {
  const input = manifest();
  assert.equal(input.relations.length, 3);
  assert.deepEqual(validateOfficialCrossoverReceipts(input).map(r => [r.from, r.to, r.type]), [
    [DEAD, HOLLOW, 'references'], [DEAD, TERRARIA, 'references'],
    [DEAD, SPIRE, 'references'],
  ]);
  assert.deepEqual(input.relations.map(r => r.source), [
    'https://deadcells.com/patchnotes/26',
    'https://deadcells.com/patchnotes/32',
    'https://deadcells.com/patchnotes/32',
  ]);
  assert.ok(input.relations.every(r => r.from === DEAD && r.strength === 1));
});

test('author direction and receipts survive direct and two-step route traversal', () => {
  const prepared = graph();
  const direct = findCuratedBridge(prepared, { from: SPIRE, to: DEAD });
  assert.equal(direct.status, 'route');
  assert.deepEqual(direct.nodes, [SPIRE, DEAD]);
  assert.equal(direct.hops[0].travelFrom, SPIRE);
  assert.equal(direct.hops[0].authoredFrom, DEAD);
  assert.equal(direct.hops[0].authoredTo, SPIRE);
  assert.equal(direct.hops[0].source, 'https://deadcells.com/patchnotes/32');

  const two = findCuratedBridge(prepared, { from: HOLLOW, to: TERRARIA, platform: 'windows' });
  assert.equal(two.status, 'route');
  assert.deepEqual(two.nodes, [HOLLOW, DEAD, TERRARIA]);
  assert.equal(two.hops.length, 2);
  assert.equal(two.evidenceStrength, 0.5);
  assert.ok(two.hops.every(h => h.authoredFrom === DEAD));
});

test('hard constraints and unknown metadata still override available references', () => {
  const prepared = graph();
  assert.equal(findCuratedBridge(prepared, {
    from: HOLLOW, to: TERRARIA, excluded: [DEAD],
  }).status, 'no-route');
  assert.equal(findCuratedBridge(prepared, {
    from: HOLLOW, to: TERRARIA, excluded: [HOLLOW],
  }).status, 'excluded');
  assert.equal(findCuratedBridge(prepared, {
    from: HOLLOW, to: TERRARIA, platform: 'android',
  }).status, 'excluded');
  assert.equal(findCuratedBridge(prepared, {
    from: HOLLOW, to: TERRARIA, coopOnly: true,
  }).status, 'uncertain');
  assert.equal(findCuratedBridge(prepared, {
    from: 'wikidata:q59756366', to: SPIRE,
  }).status, 'no-route');
});

test('receipt changes, unsourced edges, duplicates and accidental reversals fail closed', () => {
  const sample = manifest();
  const altered = mutate => {
    const copy = structuredClone(sample);
    mutate(copy);
    assert.throws(() => validateOfficialCrossoverReceipts(copy),
      /Unsupported|Unverified|duplicated|changed/);
  };
  altered(copy => { copy.relations[0].source = 'https://example.com/claim'; });
  altered(copy => { copy.relations[0].to = 'wikidata:q59756366'; });
  altered(copy => { const r = copy.relations[0]; [r.from, r.to] = [r.to, r.from]; });
  altered(copy => { copy.relations[0].type = 'similar'; });
  altered(copy => { copy.relations[0].strength = 0.8; });
  altered(copy => { copy.relations[1] = { ...copy.relations[0] }; });
  altered(copy => { copy.catalogBlobSha1 = 'new-source'; });
  altered(copy => { copy.relations[0].observedFact = 'No official fact'; });
  altered(copy => { copy.relations.push({ ...copy.relations[0] }); });
});

test('the frozen 50 tasks gain sourced evidence without losing explicit negative cases', () => {
  const report = loadOfficialCrossoverReport();
  assert.equal(report.report_schema, OFFICIAL_CROSSOVER_PROTOCOL);
  assert.equal(report.frozen_catalog_git_blob_sha1,
    '0570fd610b14fb336c0de65e6cc3062892abe301');
  assert.equal(report.frozen_plan_git_blob_sha1,
    'e28809801448df2f73c604d0349ce71c042d7f53');
  assert.equal(report.authored_reference_edges, 3);
  assert.equal(report.documented_graph_games, 4);
  assert.equal(report.pairs.length, 50);
  assert.deepEqual(report.summary.zero_receipt_curated_statuses,
    { route: 0, 'no-route': 49, uncertain: 1, excluded: 0 });
  assert.ok(report.summary.newly_sourced_route_tasks.length >= 3);
  assert.equal(report.summary.with_official_receipts_statuses.route,
    report.summary.newly_sourced_route_tasks.length);
  assert.equal(Object.values(report.summary.with_official_receipts_statuses)
    .reduce((a,b) => a + b,0), 50);
  assert.ok(report.summary.still_without_sourced_route_tasks > 0);
  const row = report.pairs.find(p => p.basket_id === 'required-coop-unknown');
  assert.equal(row.with_official_receipts_status, 'uncertain');
  const direct = report.pairs.find(p => p.from === SPIRE && p.to === DEAD);
  assert.equal(direct.with_official_receipts_status, 'route');
  const two = report.pairs.find(p => p.from === SPIRE && p.to === HOLLOW);
  assert.equal(two.with_official_receipts_status, 'route');
  assert.deepEqual(two.nodes, [SPIRE, DEAD, HOLLOW]);
  assert.equal(report.summary.latency, 'NOT_MEASURED');
  assert.equal(report.summary.human_relevance, 'NOT_MEASURED');
  assert.ok(report.warning.includes('NOT relevance'));
});

test('the offline receipt benchmark is deterministic and does not mutate inputs', () => {
  const before = manifest(), original = structuredClone(before);
  const first = compareOfficialCrossoverReceipts(before);
  const second = compareOfficialCrossoverReceipts(before);
  assert.deepEqual(before, original);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
});
