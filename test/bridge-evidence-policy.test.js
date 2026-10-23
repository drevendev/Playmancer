import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBridgePreview } from '../src/bridge-preview.js';
import { initialState, encodeState, decodeState, BRIDGE_STATE_VERSION } from '../src/demo.js';
const game = (id, mechanics, themes = [], platforms = ['linux']) => ({
  id: `test:${id}`, mechanics, themes, platforms, coop: true
});
const run = (catalog, extra = {}) => buildBridgePreview({ catalog,
  snapshotId: 'synthetic-evidence-policy-1', startId: catalog[0].id,
  endId: catalog[1].id, maxHops: 3, minSimilarity: 0, ...extra });

test('a zero threshold never creates a connection with zero shared evidence', () => {
  const result = run([game('a', ['combat']), game('b', ['farming'])]);
  assert.equal(result.status, 'no-route');
  assert.equal(result.edge_count, 0);
  assert.deepEqual(result.pair_evidence, { insufficient: 0, zero_support: 1, below_threshold: 0, connected: 0 });
});
test('known-empty features are zero support, not invented similarity or unknown data', () => {
  const result = run([game('a', []), game('b', [])]);
  assert.equal(result.status, 'no-route');
  assert.equal(result.pair_evidence.zero_support, 1);
  assert.equal(result.pair_evidence.insufficient, 0);
});
test('insufficient feature evidence is counted separately from filter uncertainty', () => {
  const result = run([game('a', null, ['nature']), game('b', ['farming'], ['nature'])]);
  assert.equal(result.status, 'no-route');
  assert.equal(result.pair_evidence.insufficient, 1);
  assert.equal(result.pair_evidence.zero_support, 0);
  assert.equal(result.eligibility.unknown, 0);
});
test('eligible pairs have mutually exclusive diagnoses and stable catalog-order results', () => {
  const catalog = [game('a', ['combat']), game('b', ['combat', 'farming']),
    game('c', ['puzzle']), game('unknown', null, null)];
  const result = run(catalog, { minSimilarity: .4 });
  assert.equal(result.status, 'no-route');
  assert.deepEqual(result.pair_evidence, { insufficient: 3, zero_support: 2, below_threshold: 1, connected: 0 });
  assert.equal(Object.values(result.pair_evidence).reduce((a, b) => a + b, 0), 6);
  assert.deepEqual(run(catalog.toReversed(), { startId: 'test:a', endId: 'test:b', minSimilarity: .4 }), result);
});
test('valid intermediary routes retain positive evidence and respect explicit exclusions', () => {
  const catalog = [game('a', ['combat']), game('b', ['farming']), game('middle', ['combat', 'farming'])];
  const result = run(catalog);
  assert.deepEqual(result.nodes, ['test:a', 'test:middle', 'test:b']);
  assert.equal(result.pair_evidence.connected, 2);
  assert.ok(result.steps.every(step => step.affinity > 0 && step.groups.some(group => group.shared.length)));
  const excluded = run(catalog, { excluded: ['test:middle'], platform: 'linux' });
  assert.equal(excluded.status, 'no-route');
  assert.deepEqual(excluded.constraints, { platform: 'linux', coopOnly: false });
  assert.deepEqual(excluded.excluded_candidate_ids, ['test:middle']);
});
test('previous Bridge topology versions fail visibly rather than silently changing routes', () => {
  const state = { ...initialState(), bridge: { version: BRIDGE_STATE_VERSION,
    method: 'bridge-features-preview-1', startId: 'demo:ember', endId: 'demo:harvest',
    maxHops: 3, minSimilarity: .31 } };
  assert.throws(() => decodeState('#basket=' + encodeURIComponent(JSON.stringify(state))), /incompatible route version/);
  const legacy = initialState();
  assert.deepEqual(decodeState(encodeState(legacy)), legacy);
});
