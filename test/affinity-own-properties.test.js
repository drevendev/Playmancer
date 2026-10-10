import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreCandidate, rankCandidates, blendCandidates } from '../src/ranking.js';

const seed = (id) => [{ id, weight: 1 }];
const candidate = (id, affinities) => ({ id, affinities, evidenceCoverage: 1, hardConstraintState: 'pass' });

test('inherited affinity cannot turn absent evidence into a rankable candidate', () => {
  const inherited = Object.create({ 'seed:a': 0.99 });
  const out = scoreCandidate(candidate('game:unknown', inherited), seed('seed:a'));
  assert.equal(out.status, 'uncertain');
  assert.equal(out.reason, 'missing-seed-affinity');
  assert.deepEqual(out.missingSeedIds, ['seed:a']);
  assert.deepEqual(out.affinities, {});
  assert.deepEqual(rankCandidates([candidate('game:unknown', inherited)], seed('seed:a')).ranked, []);
});

test('special canonical key __proto__ is ordinary evidence and yields finite ranks', () => {
  const own = JSON.parse('{"__proto__":0.8}');
  const c = candidate('game:normal', own);
  const out = scoreCandidate(c, seed('__proto__'));
  assert.equal(out.status, 'rankable');
  assert.equal(out.scores.intersection, 0.8);
  assert.equal(out.scores.arithmetic, 0.8);
  assert.equal(out.scores.union, 0.8);
  assert.equal(out.scores.leastMisery, 0.8);
  assert.equal(Object.hasOwn(out.affinities, '__proto__'), true);
  assert.equal(out.affinities.__proto__, 0.8);
  assert.equal(Object.getPrototypeOf(out.affinities), Object.prototype);
  assert.deepEqual(blendCandidates([c], seed('__proto__'), { lambda: 0.3 }).ranked.map(x => x.id), ['game:normal']);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, '__proto__'), true);
});

test('other inherited Object.prototype names stay missing rather than throwing or ranking', () => {
  for (const id of ['constructor', 'toString', 'valueOf']) {
    const out = scoreCandidate(candidate('game:no-evidence', {}), seed(id));
    assert.equal(out.status, 'uncertain', id);
    assert.deepEqual(out.missingSeedIds, [id]);
  }
});

test('own zero remains observed mismatch, null stays unknown, and input is unchanged', () => {
  const input = Object.create({ 'seed:b': 0.95 });
  input['seed:a'] = 0;
  const before = Object.getOwnPropertyDescriptors(input);
  const out = scoreCandidate(candidate('game:partial', input), [{ id: 'seed:a', weight: 1 }, { id: 'seed:b', weight: 1 }]);
  assert.equal(out.status, 'uncertain');
  assert.equal(out.affinities['seed:a'], 0);
  assert.deepEqual(out.missingSeedIds, ['seed:b']);
  assert.deepEqual(Object.getOwnPropertyDescriptors(input), before);
  assert.equal(scoreCandidate(candidate('game:zero', { 'seed:a': 0 }), seed('seed:a')).scores.intersection, 0);
  assert.equal(scoreCandidate(candidate('game:null', { 'seed:a': null }), seed('seed:a')).status, 'uncertain');
});

test('multi-seed __proto__ works for Blend coverage bookkeeping', () => {
  const make = (id, special, other) => candidate(id, Object.fromEntries([['__proto__',special],['seed:b',other]]));
  const ranked = blendCandidates([
    make('game:a', 0.9, 0.2),make('game:b',0.1,0.8)
  ], [{ id:'__proto__',weight:1 },{ id:'seed:b',weight:1 }], { lambda:0,limit:2 });
  assert.equal(ranked.ranked.length, 2);
  assert.ok(ranked.ranked.every(x => Number.isFinite(x.blend.objective)));
  assert.equal(Object.hasOwn(ranked.ranked[0].affinities,'__proto__'),true);
});
