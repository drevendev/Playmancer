import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendReviewedMixedStore } from '../scripts/import-reviewed-mixed.mjs';
import { readReleaseObservations, gitObservationBlob } from '../scripts/build-observations.mjs';
import { CATALOG_58_ID, CATALOG_58_SHA, OBSERVATIONS_58_SHA, compareObservations, encodeObservationState, decodeObservationState } from '../src/observations.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(join(root,path));
test('58 production candidate pins exact importer bytes and preserves 30 observation receipts', async () => {
  const oldBytes = read('examples/catalog.multistore-54.real.json');
  const bytes = read('examples/catalog.multistore-58.real.json');
  const old = JSON.parse(oldBytes), catalog = JSON.parse(bytes);
  const batch = JSON.parse(read('examples/reviewed-mixed-batch-2026-11-27.json'));
  assert.equal(JSON.stringify(appendReviewedMixedStore(old,batch),null,2)+'\n',bytes.toString());
  assert.equal(gitObservationBlob(bytes), CATALOG_58_SHA);
  assert.deepEqual(catalog.games.slice(0,54),old.games);
  assert.deepEqual(catalog.sources.slice(0,old.sources.length),old.sources);
  assert.equal(catalog.games.length,58);
  assert.equal(catalog.games.filter(g=>g.kind==='game' && g.storeLinks.length).length,57);
  const prior = await readReleaseObservations(root,old,oldBytes);
  const model = await readReleaseObservations(root,catalog,bytes);
  assert.equal(model.catalog,CATALOG_58_ID); assert.equal(model.evidence,OBSERVATIONS_58_SHA);
  assert.equal(model.games.length,58); assert.equal(model.observedGames,30); assert.equal(model.factCount,122);
  const a=JSON.parse(read('examples/semantic-tags-reviewed-30.catalog54.v1.json'));
  const b=JSON.parse(read('examples/semantic-tags-reviewed-30.catalog58.v1.json'));
  assert.deepEqual(b,{...a,catalogSnapshotId:CATALOG_58_ID,catalogGitBlobSha1:CATALOG_58_SHA});
  for(const game of prior.games) assert.deepEqual(model.games.find(g=>g.id===game.id),game);
  for(const game of catalog.games.slice(54)) {
    assert.deepEqual(model.games.find(g=>g.id===game.id),{id:game.id,name:game.name,coverage:'unknown',facts:[]});
    assert.equal(compareObservations(model,prior.games.find(g=>g.facts.length).id,game.id).status,'unknown');
  }
  const state={version:prior.version,catalog:prior.catalog,evidence:prior.evidence,pair:[],query:'',tag:''};
  const hash=encodeObservationState(prior,state);
  assert.deepEqual(decodeObservationState(prior,hash),state);
  assert.throws(()=>decodeObservationState(model,hash));
  await assert.rejects(readReleaseObservations(root,catalog,Buffer.concat([bytes,Buffer.from(' ')])),/blob mismatch/);
});
