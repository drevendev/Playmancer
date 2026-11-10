import test from 'node:test';
import assert from 'node:assert/strict';
import { basketName, validateBasketEntries, exportBasketBackup, importBasketBackup,
  mergeBasketEntries, changeBasketEntry, openBasketLibrary, BASKET_BACKUP_BYTES } from '../src/basket-library.js';
const hash = state => '#basket=' + encodeURIComponent(JSON.stringify(state));
const state = { v: 1, catalog: 'frozen', method: 'current', mode: 'blend',
  seeds: [{ id: 'game:b', weight: 7 }, { id: 'game:a', weight: 2 }],
  platform: 'windows', coopOnly: true, lambda: 0.6, excluded: ['game:c'],
  bridge: { version: 'bridge-ui-1', method: 'bridge-1', startId: 'game:b', endId: 'game:a', maxHops: 3, minSimilarity: 0.31 } };
const entry = (name = 'Weekend', input = state) => ({ name, hash: hash(input) });
const decode = value => {
  const parsed = JSON.parse(decodeURIComponent(value.slice(8)));
  if (parsed.catalog !== 'frozen' || parsed.method !== 'current') throw new Error('Incompatible version');
  return parsed;
};

test('backup round-trip retains ordered weights, hard filters, exclusions and Bridge', () => {
  const text = exportBasketBackup([entry()]);
  assert.deepEqual(importBasketBackup(text, decode), [entry()]);
  assert.deepEqual(decode(importBasketBackup(text, decode)[0].hash), state);
});
test('stable export order, detached records and deterministic bytes', () => {
  const input = [entry('Z'), entry('A')];
  const before = structuredClone(input);
  assert.equal(exportBasketBackup(input), exportBasketBackup([...input].reverse()));
  const result = validateBasketEntries(input); result[0].name = 'Changed';
  assert.deepEqual(input, before);
});
test('names allow literal markup and Unicode without interpreting them', () => {
  assert.equal(basketName('  Игры 🎮  '), 'Игры 🎮');
  assert.equal(basketName('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>');
  for (const bad of ['', ' ', null, 'x'.repeat(65), 'a\nb', 'a\u0000b']) assert.throws(() => basketName(bad));
});
test('unknown envelope versions, keys and shapes are rejected', () => {
  const good = JSON.parse(exportBasketBackup([entry()]));
  for (const value of [null, [], {}, { ...good, version: 2 }, { ...good, extra: true },
    { ...good, format: 'other' }, { ...good, baskets: [] }])
    assert.throws(() => importBasketBackup(JSON.stringify(value), decode));
  for (const value of ['{', '%', 'null']) assert.throws(() => importBasketBackup(value, decode));
});
test('records reject extra/inherited fields, bad hashes and noncanonical names', () => {
  const good = entry();
  for (const value of [null, [], { ...good, extra: true }, Object.create(good),
    { ...good, name: ' Weekend ' }, { ...good, hash: 'https://example.org/' },
    { ...good, hash: '#basket=' + 'x'.repeat(100001) }])
    assert.throws(() => validateBasketEntries([value]));
});
test('import validates every basket and rejects incompatible versions atomically', () => {
  let checked = 0;
  const text = exportBasketBackup([entry('A'), entry('B', { ...state, method: 'future' })]);
  assert.throws(() => importBasketBackup(text, value => { checked++; return decode(value); }), /Incompatible/);
  assert.equal(checked, 2);
  const stale = entry('Old', { ...state, catalog: 'old' });
  assert.deepEqual(JSON.parse(exportBasketBackup([stale])).baskets, [stale]); // preserve, do not upgrade
});
test('duplicates and library capacity never silently replace or evict', () => {
  const existing = [entry()];
  assert.throws(() => mergeBasketEntries(existing, [entry()]), /Duplicate/);
  assert.deepEqual(existing, [entry()]);
  const full = Array.from({ length: 20 }, (_, i) => entry(String(i)));
  assert.equal(mergeBasketEntries([], full).length, 20);
  assert.throws(() => mergeBasketEntries(full, [entry('overflow')]), /20/);
});
test('rename/delete require exact previously read record', () => {
  assert.deepEqual(changeBasketEntry([entry()], entry(), 'New'), [entry('New')]);
  assert.deepEqual(changeBasketEntry([entry()], entry()), []);
  assert.throws(() => changeBasketEntry([entry('Changed')], entry(), 'New'), /another tab/);
  assert.throws(() => changeBasketEntry([entry('Weekend', { ...state, lambda: 0.1 })], entry()), /another tab/);
  assert.throws(() => changeBasketEntry([entry(), entry('New')], entry(), 'New'), /Duplicate/);
});
test('byte and character bounds apply before JSON parse and persistence', () => {
  assert.throws(() => importBasketBackup(' '.repeat(BASKET_BACKUP_BYTES + 1), decode), /1 MiB/);
  assert.throws(() => importBasketBackup('😀'.repeat(300000), decode), /1 MiB/);
  const large = Array.from({ length: 20 }, (_, i) => ({ name: String(i), hash: '#basket=' + 'a'.repeat(99980) }));
  assert.throws(() => exportBasketBackup(large), /1 MiB/);
  assert.throws(() => mergeBasketEntries([], large), /1 MiB/);
});
test('absent or throwing storage fails explicitly, never pretends a save', async () => {
  await assert.rejects(openBasketLibrary(null), /unavailable/);
  await assert.rejects(openBasketLibrary({ open() { throw new Error('SecurityError'); } }), /SecurityError/);
});
