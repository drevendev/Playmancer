import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeState, initialState, BRIDGE_STATE_VERSION } from '../src/demo.js';
import { BRIDGE_ROUTE_METHOD_VERSION } from '../src/bridge-preview.js';

test('v4 route semantics reject old v3/v2/v1 saved Bridge URLs', () => {
  assert.equal(BRIDGE_ROUTE_METHOD_VERSION, 'bridge-features-preview-4');
  for (const oldMethod of ['bridge-features-preview-1', 'bridge-features-preview-2', 'bridge-features-preview-3']) {
    const state = { ...initialState(), bridge: { version: BRIDGE_STATE_VERSION,
      method: oldMethod, startId: 'demo:ember', endId: 'demo:harvest',
      maxHops: 3, minSimilarity: 0.05 } };
    assert.throws(() => decodeState('#basket=' + encodeURIComponent(JSON.stringify(state))),
      /incompatible route version/);
  }
});
