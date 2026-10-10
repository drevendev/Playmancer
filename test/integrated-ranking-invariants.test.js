import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSeeds, rankCandidates, blendCandidates } from '../src/ranking.js';

// Both invariants must hold *together*: large finite weights are still meaningful,
// and the shared-list order must be independent of language settings.
test('huge weighted, tied recommendations preserve ratios and canonical order', () => {
  const seeds = [
    { id: 'seed:ä', weight: 1e308 },
    { id: 'seed:z', weight: 1e308 },
  ];
  const games = ['game:ä', 'game:z'].map(id => ({
    id,
    evidenceCoverage: 0.7,
    hardConstraintState: 'pass',
    affinities: { 'seed:ä': 0.4, 'seed:z': 0.4 },
  }));
  const original = structuredClone({ seeds, games });
  assert.deepEqual(normalizeSeeds(seeds), [
    { id: 'seed:z', weight: 0.5 },
    { id: 'seed:ä', weight: 0.5 },
  ]);
  for (const mode of ['union', 'arithmetic', 'leastMisery', 'intersection']) {
    for (const ordered of [games, games.toReversed()]) {
      assert.deepEqual(rankCandidates(ordered, seeds, { mode }).ranked.map(({ id }) => id),
        ['game:z', 'game:ä'], mode);
    }
  }
  for (const lambda of [0, 0.5, 1]) {
    const result = blendCandidates(games, seeds, { lambda });
    assert.deepEqual(result.ranked.map(({ id }) => id), ['game:z', 'game:ä']);
    assert.ok(result.ranked.every(({ scores, blend }) =>
      Number.isFinite(scores.intersection) && Number.isFinite(blend.objective)));
  }
  assert.deepEqual({ seeds, games }, original, 'ranking must not mutate the input');
});
