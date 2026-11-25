import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gitObservationBlob } from '../scripts/build-observations.mjs';
import { CATALOG_35_ID, CATALOG_35_SHA, OBSERVATIONS_35_SHA } from '../src/observations.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const catalogPath = 'examples/catalog.multistore-35.real.json';
const evidencePath = 'examples/semantic-tags-reviewed-30.catalog35.v1.json';
const files = ['.nojekyll', 'bridge-worker.js', 'index.html', 'observations.html', 'player.css'];

test('nonpublished 1,000-profile sparse release passes the complete five-file build and strict preflight', async t => {
  const isolated = await mkdtemp(join(tmpdir(), 'playmancer-scale-fixture-'));
  t.after(() => rm(isolated, { recursive: true, force: true }));
  // Exercise the real-player build path, not the stripped synthetic alternate player.
  // Keep all 35 existing identities and evidence intact; added rows are authored
  // fictional test data, with no external IDs, storefronts or feature claims.
  // Only this temporary checkout receives the fixture pins. There is no new
  // production build option or runtime escape hatch, and nothing is deployed.
  for (const path of ['src', 'scripts', 'package.json', 'index.html', 'observations.html'])
    await cp(join(root, path), join(isolated, path), { recursive: true });
  await mkdir(join(isolated, 'examples'));
  const catalog = JSON.parse(await readFile(join(root, catalogPath), 'utf8'));
  const evidence = JSON.parse(await readFile(join(root, evidencePath), 'utf8'));
  catalog.snapshotId = 'multi-store-genre-pilot-scale-fixture-1000';
  catalog.sources.push({ id: 'authored-scale-fixture', kind: 'licensed',
    attribution: 'Authored fictional test rows; nonpublished capacity fixture only',
    rights: { status: 'approved', reference: 'Original test data authored in this test, not a storefront or real-game source',
      fields: ['id', 'kind', 'name', 'sourceId'] } });
  for (let i = 1; catalog.games.length < 1000; i++) {
    const suffix = String(i).padStart(4, '0');
    catalog.games.push({ id: 'fixture:scale-' + suffix, kind: 'game',
      name: 'ZZ Scale fixture ' + suffix, sourceId: 'authored-scale-fixture' });
  }
  const catalogBytes = Buffer.from(JSON.stringify(catalog));
  const catalogSha = gitObservationBlob(catalogBytes);
  evidence.catalogSnapshotId = catalog.snapshotId;
  evidence.catalogGitBlobSha1 = catalogSha;
  const evidenceBytes = Buffer.from(JSON.stringify(evidence));
  const evidenceSha = gitObservationBlob(evidenceBytes);
  await writeFile(join(isolated, catalogPath), catalogBytes);
  await writeFile(join(isolated, evidencePath), evidenceBytes);
  // Replace only the selected binding in the isolated sources; the production
  // builder and strict preflight still validate actual computed blob hashes.
  for (const path of ['src/observations.js', 'scripts/release-preflight.py']) {
    let text = await readFile(join(isolated, path), 'utf8');
    assert.ok(text.includes(CATALOG_35_ID) && text.includes(OBSERVATIONS_35_SHA));
    text = text.replaceAll(CATALOG_35_ID, catalog.snapshotId)
      .replaceAll(CATALOG_35_SHA, catalogSha).replaceAll(OBSERVATIONS_35_SHA, evidenceSha);
    if (path.endsWith('.py')) text = text.replaceAll("'" + evidenceSha + "', 35", "'" + evidenceSha + "', 1000");
    await writeFile(join(isolated, path), text);
  }
  const output = join(isolated, 'site');
  const run = () => execFileSync(process.execPath, ['scripts/build-release.mjs', output],
    { cwd: isolated, env: { ...process.env, PLAYMANCER_REVISION: 'unpublished' }, stdio: 'pipe' });
  run();
  assert.deepEqual((await readdir(output)).sort(), files);
  const preflight = () => spawnSync('python3', ['scripts/release-preflight.py', output],
    { cwd: isolated, encoding: 'utf8' });
  const result = preflight();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const first = await Promise.all(files.map(file => readFile(join(output, file))));
  const explorer = first[3].toString('utf8'), index = first[2].toString('utf8');
  assert.ok(first[3].length > 100000 && first[3].length < 200000);
  const model = JSON.parse(explorer.match(/^const OBSERVATION_DATA = (.+);$/m)[1]);
  assert.equal(model.games.length, 1000);
  assert.equal(model.observedGames, 30);
  assert.equal(model.factCount, 122);
  assert.equal(model.games.filter(g => g.coverage === 'unknown').length, 970);
  const inline = index.match(/<script id="inline-gameplay-facts" type="application\/json">([^<]+)<\/script>/);
  assert.ok(inline && Buffer.byteLength(inline[1]) <= 20000);
  assert.equal(JSON.parse(inline[1]).games.length, 30);
  assert.equal(JSON.parse(inline[1]).evidence, evidenceSha);
  const { searchObservations, compareObservations, encodeObservationState, decodeObservationState } =
    await import(pathToFileURL(join(isolated, 'src/observations.js')).href);
  const late = 'fixture:scale-0965';
  assert.deepEqual(searchObservations(model, 'ZZ Scale fixture 0965').map(g => g.id), [late]);
  assert.equal(compareObservations(model, 'wikidata:q16972008', late).status, 'unknown');
  const state = { version: model.version, catalog: model.catalog, evidence: model.evidence,
    pair: ['wikidata:q16972008', late], query: 'ZZ Scale fixture 0965', tag: '' };
  assert.deepEqual(decodeObservationState(model, encodeObservationState(model, state)), state);
  run();
  for (const [i, file] of files.entries()) assert.deepEqual(await readFile(join(output, file)), first[i]);
  // A forged lower model count may not bypass the strict selected binding.
  await writeFile(join(output, 'observations.html'), explorer.replace(
    /^const OBSERVATION_DATA = (.+);$/m, (_, json) => {
      const changed = JSON.parse(json); changed.games.pop();
      return 'const OBSERVATION_DATA = ' + JSON.stringify(changed) + ';';
    }));
  assert.notEqual(preflight().status, 0);
  await writeFile(join(output, 'observations.html'), first[3]);
  // One-byte evidence mutation must still fail before replacing the valid site.
  await writeFile(join(isolated, evidencePath), Buffer.concat([evidenceBytes, Buffer.from(' ')]));
  assert.throws(run, /Reviewed observation blob mismatch/);
  for (const [i, file] of files.entries()) assert.deepEqual(await readFile(join(output, file)), first[i]);
  console.log('Nonpublished scale fixture bytes:', Object.fromEntries(files.map((f, i) => [f, first[i].length])));
});
