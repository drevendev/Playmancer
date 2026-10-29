import assert from 'node:assert/strict';
import test from 'node:test';
import { runBenchmark } from '../src/benchmark.js';

// Issue #16: independent score/selection oracle, never reuse the ranking
// implementation to define expected output. Synthetic deterministic data.
const MODES = ['union', 'arithmetic', 'leastMisery', 'intersection', 'blend'];
const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const near = (actual, expected, label) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-12,
    label + ': expected ' + expected + ', got ' + actual);

function expectedRanking(candidates, seeds, mode, lambda, topK) {
  const sum = seeds.reduce((total, seed) => total + seed.weight, 0);
  const weighted = seeds.map((seed) => ({ id: seed.id, share: seed.weight / sum }));
  const rankable = candidates
    .filter((item) => item.hardConstraintState === 'pass' &&
      !seeds.some((seed) => seed.id === item.id) &&
      seeds.every((seed) => Number.isFinite(item.affinities[seed.id])))
    .map((item) => {
      const values = weighted.map((seed) => item.affinities[seed.id]);
      const arithmetic = weighted.reduce((total, seed, i) =>
        total + seed.share * values[i], 0);
      const scores = {
        union: Math.max(...values),
        arithmetic,
        leastMisery: Math.min(...values),
        intersection: values.includes(0) ? 0 : 1 /
          weighted.reduce((total, seed, i) => total + seed.share / values[i], 0),
      };
      return { item, scores };
    });
  const tie = (a, b) =>
    b.item.evidenceCoverage - a.item.evidenceCoverage ||
    compareIds(a.item.id, b.item.id);

  if (mode !== 'blend') {
    return rankable
      .sort((a, b) => b.scores[mode] - a.scores[mode] || tie(a, b))
      .slice(0, topK)
      .map(({ item, scores }) => ({ id: item.id, score: scores[mode] }));
  }

  const remaining = [...rankable];
  const covered = Object.fromEntries(weighted.map((seed) => [seed.id, 0]));
  const ordered = [];
  while (remaining.length && ordered.length < topK) {
    const options = remaining.map((entry) => {
      const gain = weighted.reduce((total, seed) =>
        total + seed.share * Math.max(0, entry.item.affinities[seed.id] - covered[seed.id]), 0);
      return { ...entry, gain,
        objective: lambda * entry.scores.arithmetic + (1 - lambda) * gain,
        before: { ...covered } };
    });
    options.sort((a, b) => b.objective - a.objective ||
      b.gain - a.gain ||
      b.scores.arithmetic - a.scores.arithmetic || tie(a, b));
    const chosen = options[0];
    ordered.push({ id: chosen.item.id, score: chosen.objective,
      gain: chosen.gain, before: chosen.before });
    for (const seed of weighted) {
      covered[seed.id] = Math.max(covered[seed.id], chosen.item.affinities[seed.id]);
    }
    remaining.splice(remaining.findIndex((entry) => entry.item.id === chosen.item.id), 1);
  }
  return ordered;
}

function fixture(index) {
  // Prototype-like canonical IDs must behave like ordinary own-property keys.
  const ids = index % 7 === 0 ? ['__proto__', 'constructor'] : ['seed:a', 'seed:b'];
  const candidates = Array.from({ length: 12 }, (_, i) => ({
    id: 'game:' + i,
    affinities: Object.fromEntries(ids.map((id, j) =>
      [id, (i * 17 + index * 13 + j * 31) % 11 === 0
        ? null : ((i * 53 + j * 29 + index * 11) % 101) / 100])),
    evidenceCoverage: ((i * 7 + index * 19) % 11) / 10,
    hardConstraintState: (i + index) % 13 === 0 ? 'unknown' :
      (i + index) % 17 === 0 ? 'fail' : 'pass',
  }));
  const states = Object.fromEntries(candidates.map((item) =>
    [item.id, item.hardConstraintState]));
  return {
    catalogSnapshotId: 'synthetic-independent-oracle-' + index,
    methodVersion: 'feature-oracle-1',
    topK: 5, blend: { lambda: 0.35, limit: 5 }, modes: MODES,
    candidates,
    baskets: [{
      id: 'B1',
      seeds: ids.map((id, i) => ({ id, weight: 1 + ((index + i * 3) % 9) })),
      constraints: { platform: ['pc'] },
      candidateConstraintStates: states,
      excludedCandidateIds: [index % 3 === 0 ? 'game:0' : 'game:8'],
    }],
  };
}

test('independent oracle checks 600 identical-scope scalar/Blend benchmark rows', () => {
  let checked = 0;
  for (let i = 0; i < 120; i++) {
    const input = fixture(i);
    const original = JSON.parse(JSON.stringify(input));
    const result = runBenchmark(input);
    const basket = input.baskets[0];
    const hidden = new Set(basket.excludedCandidateIds);
    const available = input.candidates.filter((item) => !hidden.has(item.id));
    const uncertain = available
      .filter((item) => item.hardConstraintState === 'unknown' ||
        (item.hardConstraintState === 'pass' &&
          basket.seeds.some((seed) => item.affinities[seed.id] == null)))
      .map((item) => item.id).sort(compareIds);
    const excluded = input.candidates
      .filter((item) => hidden.has(item.id) || item.hardConstraintState === 'fail')
      .map((item) => item.id).sort(compareIds);

    assert.deepEqual(input, original, 'benchmark mutated caller input');
    assert.equal(result.results.length, MODES.length);
    for (const [j, mode] of MODES.entries()) {
      const row = result.results[j];
      const scope = 'case ' + i + '/' + mode;
      assert.equal(row.mode, mode, scope);
      assert.equal(row.top_k, 5, scope);
      assert.equal(row.constraint_state_source, 'basket', scope);
      assert.deepEqual(row.constraints, basket.constraints, scope);
      assert.deepEqual(row.excluded_candidate_ids, [...hidden].sort(compareIds), scope);
      assert.deepEqual(row.uncertain.map((item) => item.candidate_id), uncertain, scope);
      assert.deepEqual(row.excluded.map((item) => item.candidate_id), excluded, scope);

      const expected = expectedRanking(available, basket.seeds, mode, 0.35, 5);
      assert.deepEqual(row.ranked.map((item) => item.candidate_id),
        expected.map((item) => item.id), scope + ': oracle order differs');
      for (const [rank, item] of row.ranked.entries()) {
        near(item.score, expected[rank].score, scope + ' score ' + rank);
        assert.equal(item.rank, rank + 1, scope);
        for (const seed of basket.seeds) {
          assert.ok(Object.hasOwn(item.per_seed_affinity, seed.id),
            scope + ': missing own affinity key ' + seed.id);
        }
        if (mode === 'blend') {
          near(item.diagnostics.gain, expected[rank].gain, scope + ' gain ' + rank);
          for (const seed of basket.seeds) {
            near(item.diagnostics.coverageBefore[seed.id],
              expected[rank].before[seed.id], scope + ' coverage ' + rank);
          }
        }
      }
      checked++;
    }
    // Candidate input order cannot change canonical benchmark output.
    const reversed = { ...input, candidates: [...input.candidates].reverse() };
    assert.deepEqual(runBenchmark(reversed), result, 'candidate reorder altered report ' + i);
  }
  assert.equal(checked, 600);
});
