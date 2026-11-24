import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalogSnapshot, catalogCoverage } from '../src/catalog.js';

const read = name => JSON.parse(readFileSync(new URL('../examples/' + name, import.meta.url), 'utf8'));
const previous = read('catalog.multistore-30.real.json');
const candidate = read('catalog.multistore-31.real.json');

test('Bellbloom candidate preserves all prior records and uses a new snapshot identity', () => {
  assert.equal(previous.games.length, 30);
  assert.equal(candidate.games.length, 31);
  assert.equal(candidate.snapshotId, 'multi-store-genre-pilot-31-2026-11-24');
  assert.notEqual(candidate.snapshotId, previous.snapshotId);
  assert.deepEqual(candidate.games.slice(0, 30), previous.games);
  assert.deepEqual(candidate.sources.slice(0, previous.sources.length), previous.sources);
  assert.equal(candidate.sources.length, previous.sources.length + 1);
});

test('Bellbloom has a publishable field receipt, explicit unknowns and a unique store identity', () => {
  const valid = validateCatalogSnapshot(candidate, { requirePublishable: true });
  const game = valid.games.at(-1);
  assert.equal(game.id, 'dreven:bellbloom');
  assert.equal(game.sourceId, 'dreven-owned-bellbloom');
  assert.deepEqual(game.themes, ['simulation video game']);
  assert.deepEqual(game.platforms, ['browser']);
  assert.deepEqual(game.externalIds, [{ provider: 'itch', id: 'bellbloom' }]);
  assert.deepEqual(game.storeLinks, [{ store: 'itch', url: 'https://drevengames.itch.io/bellbloom' }]);
  for (const key of ['mechanics', 'coop', 'description', 'parentId']) assert.equal(game[key], null);
  assert.deepEqual(game.aliases, []);
  const priorCoverage = catalogCoverage(previous);
  const nextCoverage = catalogCoverage(candidate);
  for (const key of ['mechanics', 'themes', 'platforms', 'coop']) {
    assert.equal(nextCoverage[key].total, 31);
    assert.equal(nextCoverage[key].known, priorCoverage[key].known + (['themes', 'platforms'].includes(key) ? 1 : 0));
  }
});

test('candidate rejects duplicate store identity and unapproved field expansion', () => {
  const duplicate = structuredClone(candidate);
  duplicate.games.push({ ...duplicate.games.at(-1), id: 'dreven:bellbloom-duplicate' });
  assert.throws(() => validateCatalogSnapshot(duplicate, { requirePublishable: true }), /External ID collision/);
  const unapproved = structuredClone(candidate);
  unapproved.games.at(-1).mechanics = ['clicker'];
  assert.throws(() => validateCatalogSnapshot(unapproved, { requirePublishable: true }), /Field not cleared/);
});
