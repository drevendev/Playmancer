import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { buildObservationPage, linkObservationExplorer, readReleaseObservations } from '../scripts/build-observations.mjs';
import { CANDIDATE_CATALOG_ID, CANDIDATE_OBSERVATIONS_SHA, REVIEWED_OBSERVATIONS_SHA } from '../src/observations.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const bytes = readFileSync(join(root,'examples/catalog.multistore-31.real.json'));
const catalog = JSON.parse(bytes);
const legacy = 'multi-store-genre-pilot-30-2026-10-28';
const marker = '<div class="section"><label for="mode">';
const run = (dir, ...args) => spawnSync(process.execPath, ['scripts/build-release.mjs', dir, ...args],
  { cwd: root, encoding: 'utf8', env: {...process.env, PLAYMANCER_REVISION: 'a'.repeat(40)} });
const payload = html => JSON.parse(html.match(/<script id="inline-gameplay-facts" type="application\/json">([^<]+)<\/script>/)[1]);
function basketCore(html, expression, input = null) {
  const script = html.match(/<script type="module">\n([\s\S]*?)<\/script>/)[1];
  const boundary = script.indexOf('// src/bridge-ui.js');
  assert.ok(boundary > 0, 'expected pure player core before DOM modules');
  return runInNewContext(script.slice(0, boundary) + '\n' + expression, { URL, input });
}
test('candidate binding rejects wrong catalog bytes and a mixed evidence identity', async () => {
  const model = await readReleaseObservations(root, catalog, bytes);
  assert.equal(model.games.length, 31);
  assert.equal(model.observedGames, 30);
  assert.equal(model.factCount, 122);
  assert.equal(model.evidence, CANDIDATE_OBSERVATIONS_SHA);
  assert.equal(model.games.find(g => g.id === 'dreven:devmatch').coverage, 'unknown');
  assert.equal(model.games.find(g => g.id === 'dreven:bellbloom').facts.length, 4);
  await assert.rejects(buildObservationPage(root, catalog, Buffer.concat([bytes, Buffer.from(' ')]), 'unpublished'), /blob mismatch/);
  assert.throws(() => linkObservationExplorer(marker, {...model, evidence: REVIEWED_OBSERVATIONS_SHA}), /revision mismatch/);
});
test('explicit candidate packages all five files deterministically; default shares stay versioned', () => {
  const dir = mkdtempSync(join(tmpdir(), 'playmancer-release31-'));
  try {
    const a = join(dir, 'a'), b = join(dir, 'b'), old = join(dir, 'old');
    for (const output of [a, b]) {
      const result = run(output, '--candidate-31'); assert.equal(result.status, 0, result.stderr);
    }
    const original = run(old, '--candidate-30'); assert.equal(original.status, 0, original.stderr);
    const files = ['.nojekyll','bridge-worker.js','index.html','observations.html','player.css'];
    assert.deepEqual(readdirSync(a).sort(), files);
    for (const file of files) assert.deepEqual(readFileSync(join(a,file)),readFileSync(join(b,file)),file);
    const main = readFileSync(join(a,'index.html'),'utf8'), explorer = readFileSync(join(a,'observations.html'),'utf8');
    const prior = readFileSync(join(old,'index.html'),'utf8');
    for (const page of [main, explorer]) assert.ok(page.includes('name="playmancer-catalog" content="' + CANDIDATE_CATALOG_ID + '"'));
    assert.ok(explorer.includes('name="playmancer-observations" content="' + CANDIDATE_OBSERVATIONS_SHA + '"'));
    assert.ok(main.includes('data-observation-catalog="' + CANDIDATE_CATALOG_ID + '" data-observation-evidence="' + CANDIDATE_OBSERVATIONS_SHA + '"'));
    assert.equal(payload(main).games.length, 30);
    assert.equal(payload(main).games.find(g=>g.id==='dreven:bellbloom').facts.length,4);
    assert.equal(payload(prior).catalog,legacy);
    assert.equal(payload(prior).evidence,REVIEWED_OBSERVATIONS_SHA);
    const oldHash = basketCore(prior,'encodeState(initialState())');
    assert.throws(()=>basketCore(main,'decodeState(input)',oldHash),/unavailable catalog/);
    const nextHash = basketCore(main,'encodeState({...initialState(), seeds: [...initialState().seeds, {id:"dreven:bellbloom",weight:7}], mode:"blend", platform:"browser", excluded:[CATALOG[2].id]})');
    assert.equal(basketCore(main,'encodeState(decodeState(input))',nextHash), nextHash);
    assert.throws(()=>basketCore(prior,'decodeState(input)',nextHash),/unavailable catalog/);
    assert.notEqual(run(a,'--unknown').status,0);
    assert.equal(readFileSync(join(a,'index.html'),'utf8'),main);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
