import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BY_ID, CATALOG, BRIDGE_STATE_VERSION, initialState,
  encodeState, decodeState, recommend,
} from '../src/demo.js';
import { BRIDGE_ROUTE_METHOD_VERSION } from '../src/bridge-preview.js';

// Deterministic, bounded cross-product, not a random oracle. Every case replays
// the same versioned link with its original seed ordering and hard filters.
const basketShapes = [
  [0],
  [0, 1],
  [0, 1, 2, 3, 4],
];
const weights = [10, 2, 7, 3, 1];
const excludedIds = CATALOG.slice(-4).map((game) => game.id);
const freezeDeep = (value) => {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freezeDeep(nested);
    Object.freeze(value);
  }
  return value;
};

test('basket share replay matrix preserves taste, constraints and deterministic eligibility', () => {
  let checked = 0;
  const reversedCatalog = [...CATALOG].reverse();
  for (const basket of basketShapes) {
    const seeds = basket.map((index, position) => ({
      id: CATALOG[index].id, weight: weights[position],
    }));
    for (const mode of ['intersection', 'blend', 'arithmetic']) {
      for (const platform of ['any', 'windows', 'linux', 'mac']) {
        for (const coopOnly of [false, true]) {
          for (const withExclusions of [false, true]) {
            const state = freezeDeep({
              ...initialState(),
              seeds,
              mode,
              lambda: 0.7,
              platform,
              coopOnly,
              excluded: withExclusions ? excludedIds : [],
              ...(basket.length >= 2 ? { bridge: {
                version: BRIDGE_STATE_VERSION,
                method: BRIDGE_ROUTE_METHOD_VERSION,
                startId: seeds[0].id,
                endId: seeds[1].id,
                maxHops: 3,
                minSimilarity: 0.31,
              } } : {}),
            });
            const label = [mode, seeds.length, platform, coopOnly, withExclusions].join('/');
            const link = encodeState(state);
            const restored = decodeState(link);
            assert.deepEqual(restored, state, label + ': lost saved basket fields');
            assert.equal(encodeState(restored), link, label + ': unstable canonical link');

            const result = recommend(restored);
            assert.deepEqual(result, recommend(state), label + ': share replay changed ranking');
            assert.deepEqual(result, recommend(restored, reversedCatalog),
              label + ': catalog order changed ranking/evidence');
            const forbidden = new Set([...seeds.map((seed) => seed.id), ...state.excluded]);
            const rankedIds = result.ranked.map((item) => item.id);
            assert.equal(new Set(rankedIds).size, rankedIds.length, label + ': duplicate results');
            for (const candidate of result.ranked) {
              assert.ok(!forbidden.has(candidate.id), label + ': excluded/seed game ranked');
              const game = BY_ID.get(candidate.id);
              assert.ok(game, label + ': unknown catalog identity');
              if (platform !== 'any') {
                assert.ok(game.platforms?.includes(platform), label + ': relaxed platform');
              }
              if (coopOnly) assert.equal(game.coop, true, label + ': relaxed co-op');
              assert.deepEqual(candidate.evidence.map((pair) => pair.id),
                seeds.map((seed) => seed.id), label + ': per-seed evidence out of order');
            }
            assert.equal(result.ranked.some((item) => item.status === 'uncertain'), false,
              label + ': unknown evidence ranked');
            ++checked;
          }
        }
      }
    }
  }
  assert.equal(checked, 144, 'keep the replay/constraint matrix intentionally bounded');
});

test('alternating saved baskets cannot mutate prior shares or recommendation snapshots', () => {
  const first = freezeDeep({
    ...initialState(),
    mode: 'blend',
    seeds: [{ id: CATALOG[1].id, weight: 9 }, { id: CATALOG[0].id, weight: 1 }],
    platform: 'linux',
    coopOnly: true,
    excluded: [CATALOG[4].id],
  });
  const second = freezeDeep({
    ...initialState(),
    mode: 'intersection',
    seeds: [{ id: CATALOG[0].id, weight: 1 }, { id: CATALOG[1].id, weight: 9 }],
    platform: 'mac',
    coopOnly: false,
    excluded: [CATALOG[5].id],
  });
  const oldHash = encodeState(first);
  const oldRanking = recommend(first);
  assert.deepEqual(recommend(decodeState(encodeState(second))), recommend(second));
  assert.equal(encodeState(first), oldHash, 'a later basket mutated an earlier share');
  assert.deepEqual(recommend(decodeState(oldHash)), oldRanking,
    'a later basket contaminated earlier recommendation state');
});
