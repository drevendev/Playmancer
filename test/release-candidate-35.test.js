import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { readReleaseObservations, linkObservationExplorer } from '../scripts/build-observations.mjs';
import { CATALOG_35_ID, OBSERVATIONS_35_SHA, CANDIDATE_OBSERVATIONS_SHA } from '../src/observations.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const bytes = readFileSync(join(root,'examples/catalog.multistore-35.real.json'));
const catalog = JSON.parse(bytes);
const priorBytes = readFileSync(join(root,'examples/catalog.multistore-31.real.json'));
const prior = JSON.parse(priorBytes);
const run = (dir, ...args) => spawnSync(process.execPath, ['scripts/build-release.mjs', dir, ...args],
  { cwd: root, encoding: 'utf8', env: {...process.env, PLAYMANCER_REVISION: 'a'.repeat(40)} });
const payload = html => JSON.parse(html.match(/<script id="inline-gameplay-facts" type="application\/json">([^<]+)<\/script>/)[1]);
function basketCore(html, expression, input = null) {
  const script = html.match(/<script type="module">\n([\s\S]*?)<\/script>/)[1];
  const boundary = script.indexOf('// src/bridge-ui.js');
  assert.ok(boundary > 0);
  return runInNewContext(script.slice(0, boundary) + '\n' + expression, { URL, input });
}
test('35-game binding preserves every reviewed fact and marks new identities unknown', async () => {
  const model = await readReleaseObservations(root, catalog, bytes);
  const old = await readReleaseObservations(root, prior, priorBytes);
  assert.equal(model.games.length, 35);
  assert.equal(model.observedGames, 30);
  assert.equal(model.factCount, 122);
  assert.equal(model.evidence, OBSERVATIONS_35_SHA);
  for (const game of old.games) assert.deepEqual(model.games.find(g => g.id === game.id), game);
  for (const game of catalog.games.slice(31)) assert.deepEqual(model.games.find(g => g.id === game.id),
    {id: game.id, name: game.name, coverage: 'unknown', facts: []});
  await assert.rejects(readReleaseObservations(root, catalog, Buffer.concat([bytes, Buffer.from(' ')])), /blob mismatch/);
  assert.throws(() => linkObservationExplorer('<div class="section"><label for="mode">', {...model, evidence: CANDIDATE_OBSERVATIONS_SHA}), /revision mismatch/);
});
test('35-game default packages the same five files deterministically and pins share state', () => {
  const dir = mkdtempSync(join(tmpdir(), 'playmancer-release35-'));
  try {
    const a = join(dir,'a'), b = join(dir,'b'), old = join(dir,'old');
    for (const [output, flags] of [[a, []], [b, ['--candidate-35']]]) { const result = run(output,...flags); assert.equal(result.status,0,result.stderr); }
    const result = run(old,'--candidate-31'); assert.equal(result.status,0,result.stderr);
    const files = ['.nojekyll','bridge-worker.js','index.html','observations.html','player.css'];
    assert.deepEqual(readdirSync(a).sort(), files);
    for (const file of files) assert.deepEqual(readFileSync(join(a,file)),readFileSync(join(b,file)),file);
    const main = readFileSync(join(a,'index.html'),'utf8'), explorer = readFileSync(join(a,'observations.html'),'utf8');
    const previous = readFileSync(join(old,'index.html'),'utf8');
    for (const page of [main,explorer]) assert.ok(page.includes('name="playmancer-catalog" content="' + CATALOG_35_ID + '"'));
    assert.ok(explorer.includes('name="playmancer-observations" content="' + OBSERVATIONS_35_SHA + '"'));
    assert.equal(payload(main).games.length,30);
    assert.equal(payload(main).evidence,OBSERVATIONS_35_SHA);
    assert.ok(!payload(main).games.some(g => g.id === 'wikidata:q193581'));
    const oldHash = basketCore(previous,'encodeState(initialState())');
    assert.throws(()=>basketCore(main,'decodeState(input)',oldHash),/unavailable catalog/);
    const hash = basketCore(main,'encodeState({...initialState(), seeds: [...initialState().seeds, {id:"wikidata:q193581",weight:7}], mode:"blend"})');
    assert.equal(basketCore(main,'encodeState(decodeState(input))',hash),hash);
    assert.throws(()=>basketCore(previous,'decodeState(input)',hash),/unavailable catalog/);
    assert.notEqual(run(a,'--unknown').status,0);
    assert.equal(readFileSync(join(a,'index.html'),'utf8'),main);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
