import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linkObservationExplorer } from '../scripts/build-observations.mjs';
import { addBasketLibrary, BASKET_LIBRARY_CSS } from '../scripts/build-basket-library.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
test('production adds explicit tools without changing player scoring/worker bytes; all assets remain strictly validated', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'playmancer-release-test-'));
  t.after(() => rm(dir, { recursive:true, force:true }));
  const base = join(dir,'base'), release = join(dir,'release');
  const run = args => execFileSync(process.execPath,args,{cwd:root,stdio:'pipe'});
  run(['scripts/build-demo.mjs',base,'--catalog','examples/catalog.multistore-30.real.json']);
  run(['scripts/build-release.mjs',release]);
  assert.deepEqual((await readdir(release)).sort(), ['.nojekyll','bridge-worker.js','index.html','observations.html','player.css']);
  for (const file of ['.nojekyll','bridge-worker.js'])
    assert.deepEqual(await readFile(join(release,file)), await readFile(join(base,file)),
      `${file} must remain byte-identical to the validated player build`);
  const baseCss = await readFile(join(base,'player.css'),'utf8');
  const baseIndex = await readFile(join(base,'index.html'),'utf8');
  assert.equal(await readFile(join(release,'player.css'),'utf8'), baseCss + BASKET_LIBRARY_CSS);
  assert.equal(await readFile(join(release,'index.html'),'utf8'),
    await addBasketLibrary(root, linkObservationExplorer(baseIndex)));
  const files = ['.nojekyll','bridge-worker.js','index.html','observations.html','player.css'];
  const firstBuild = await Promise.all(files.map(file => readFile(join(release,file))));
  run(['scripts/build-release.mjs',release]);
  for (const [i, file] of files.entries())
    assert.deepEqual(await readFile(join(release,file)), firstBuild[i],
      `${file} must rebuild deterministically`);
  const first = await readFile(join(release,'observations.html'),'utf8');
  const check = () => spawnSync('python3',['scripts/release-preflight.py',release],{cwd:root,encoding:'utf8'});
  const valid = check(); assert.equal(valid.status,0,valid.stdout+valid.stderr);
  await writeFile(join(release,'observations.html'),first.replace('name="playmancer-revision"','name="incorrect-revision"'));
  assert.notEqual(check().status,0,'mismatched explorer revision must reject publication');
  await writeFile(join(release,'observations.html'),first);
  const firstCss = await readFile(join(release,'player.css'),'utf8');
  await writeFile(join(release,'player.css'), firstCss + '\n@import url("https://example.invalid/unapproved.css");\n');
  assert.notEqual(check().status,0,'external stylesheet references must reject publication');
  await writeFile(join(release,'player.css'), firstCss);
  await writeFile(join(release,'unapproved.json'),'{}');
  assert.notEqual(check().status,0,'unapproved public assets must reject publication');
});
