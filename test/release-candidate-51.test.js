import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { appendReviewedSteam } from '../scripts/import-reviewed-steam.mjs';
import { validateCatalogSnapshot } from '../src/catalog.js';
import { readReleaseObservations, gitObservationBlob } from '../scripts/build-observations.mjs';
import { CATALOG_51_ID, CATALOG_51_SHA, OBSERVATIONS_51_SHA, compareObservations,
  searchObservations, encodeObservationState, decodeObservationState } from '../src/observations.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root, path));
const oldBytes = read('examples/catalog.multistore-35.real.json');
const bytes = read('examples/catalog.multistore-51.real.json');
const batch = JSON.parse(read('examples/reviewed-steam-batch-2026-11-25.json'));
const base = JSON.parse(oldBytes);
const catalog = JSON.parse(bytes);

test('51-profile candidate is an exact deterministic reviewed import, with no false coverage', async () => {
  const valid = validateCatalogSnapshot(catalog, { requirePublishable: true });
  assert.deepEqual(appendReviewedSteam(base, batch), valid);
  assert.deepEqual(appendReviewedSteam(base, {...batch, games: [...batch.games].reverse()}), valid);
  assert.equal(JSON.stringify(appendReviewedSteam(base, batch), null, 2) + '\n', bytes.toString('utf8'));
  assert.deepEqual(valid.games.slice(0, 35), validateCatalogSnapshot(base).games);
  assert.equal(valid.games.length, 51);
  assert.equal(valid.games.filter(g => g.kind === 'game' && g.storeLinks.length).length, 50);
  assert.equal(valid.games.filter(g => g.storeLinks.some(l => l.store === 'steam')).length, 44);
  assert.equal(gitObservationBlob(bytes), CATALOG_51_SHA);
  const old = await readReleaseObservations(root, base, oldBytes);
  const model = await readReleaseObservations(root, catalog, bytes);
  assert.equal(model.catalog, CATALOG_51_ID);
  assert.equal(model.evidence, OBSERVATIONS_51_SHA);
  assert.equal(model.games.length, 51);
  assert.equal(model.observedGames, 30);
  assert.equal(model.factCount, 122);
  for (const game of old.games) assert.deepEqual(model.games.find(g => g.id === game.id), game);
  for (const game of catalog.games.slice(35)) {
    assert.equal(game.themes, null);
    assert.equal(game.mechanics, null);
    assert.equal(game.platforms, null);
    assert.equal(game.coop, null);
    assert.deepEqual(model.games.find(g => g.id === game.id), {id: game.id, name: game.name, coverage: 'unknown', facts: []});
    assert.ok(searchObservations(model, game.name).some(g => g.id === game.id));
  }
  const late = 'wikidata:q115641620';
  assert.equal(compareObservations(model, 'wikidata:q59756366', late).status, 'unknown');
  const state = {version: model.version, catalog: model.catalog, evidence: model.evidence,
    pair: ['wikidata:q59756366', late], query: 'Hades II', tag: ''};
  const hash = encodeObservationState(model, state);
  assert.deepEqual(decodeObservationState(model, hash), state);
  assert.throws(() => decodeObservationState(old, hash));
  await assert.rejects(readReleaseObservations(root, catalog, Buffer.concat([bytes, Buffer.from(' ')])), /blob mismatch/);
});

test('51-profile historical build packages all five files, passes strict preflight, and preserves explicit 35', () => {
  const dir = mkdtempSync(join(tmpdir(), 'playmancer-release51-'));
  const run = (command, args) => {
    const result = spawnSync(command, args, {cwd: root, encoding: 'utf8',
      env: {...process.env, PLAYMANCER_REVISION: 'a'.repeat(40)}});
    assert.equal(result.status, 0, result.stdout + result.stderr);
  };
  try {
    const a = join(dir, 'a'), b = join(dir, 'b'), previous = join(dir, 'historical35');
    for (const [site, flags] of [[a, ['--candidate-51']], [b, ['--candidate-51']]]) {
      run(process.execPath, ['scripts/build-release.mjs', site, ...flags]);
      run('python3', ['scripts/release-preflight.py', site, ...flags]);
    }
    run(process.execPath, ['scripts/build-release.mjs', previous, '--candidate-35']);
    run('python3', ['scripts/release-preflight.py', previous, '--candidate-35']);
    const files = ['.nojekyll','bridge-worker.js','index.html','observations.html','player.css'];
    assert.deepEqual(readdirSync(a).sort(), files);
    for (const f of files) assert.deepEqual(readFileSync(join(a,f)), readFileSync(join(b,f)), f);
    const index = readFileSync(join(a,'index.html'), 'utf8');
    const explorer = readFileSync(join(a,'observations.html'), 'utf8');
    for (const row of batch.games) assert.ok(index.includes(row.storeUrl), row.name);
    assert.ok(explorer.includes('name="playmancer-catalog" content="' + CATALOG_51_ID + '"'));
    assert.ok(explorer.includes('name="playmancer-observations" content="' + OBSERVATIONS_51_SHA + '"'));
    assert.ok(readFileSync(join(previous,'index.html'),'utf8').includes('multi-store-genre-pilot-35-2026-11-24'));
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
