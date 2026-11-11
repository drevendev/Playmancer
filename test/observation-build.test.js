import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildObservationPage, linkObservationExplorer, gitObservationBlob } from '../scripts/build-observations.mjs';
import { REVIEWED_CATALOG_SHA, REVIEWED_OBSERVATIONS_SHA, prepareObservations } from '../src/observations.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const raw = await readFile(join(root, 'examples/catalog.multistore-30.real.json'));
const catalog = JSON.parse(raw);
const revision = 'a'.repeat(40);
test('exact source fingerprints bind the dated projection to the unchanged catalog', async () => {
  assert.equal(gitObservationBlob(raw), REVIEWED_CATALOG_SHA);
  assert.equal(gitObservationBlob(await readFile(join(root, 'examples/semantic-tags-reviewed-29.v1.json'))), REVIEWED_OBSERVATIONS_SHA);
});
test('page is deterministic, compiled, versioned, bounded and self-contained', async () => {
  const a = await buildObservationPage(root, catalog, raw, revision);
  assert.equal(a, await buildObservationPage(root, catalog, raw, revision));
  assert.ok(Buffer.byteLength(a) < 100000);
  assert.ok(a.includes(`name="playmancer-revision" content="${revision}"`));
  assert.ok(a.includes(REVIEWED_OBSERVATIONS_SHA));
  assert.ok(a.includes('No tracking, accounts, live data requests'));
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|<img\b/i.test(a));
  assert.ok(!/@import\b|url\s*\(/i.test(a.match(/<style>([\s\S]*?)<\/style>/)[1]));
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest\s*\(|sendBeacon\s*\(/.test(a));
  assert.ok(!a.includes('"weight":0.25'));
});
test('other catalog versions receive no misattributed observation page', async () => {
  assert.equal(await buildObservationPage(root, {...catalog, snapshotId:'synthetic'}, null, revision), null);
});
test('changed catalog bytes or malformed publication revision fail before publication', async () => {
  await assert.rejects(buildObservationPage(root, catalog, Buffer.concat([raw,Buffer.from(' ')]), revision), /blob mismatch/);
  await assert.rejects(buildObservationPage(root, catalog, raw, 'bad-revision'), /Invalid.*revision/);
});
test('changed current observations fail closed', async t => {
  const path = await mkdtemp(join(tmpdir(), 'playmancer-observation-test-'));
  t.after(() => rm(path, {recursive:true,force:true}));
  await mkdir(join(path,'examples'));
  const data = await readFile(join(root,'examples/semantic-tags-reviewed-29.v1.json'));
  await writeFile(join(path,'examples/semantic-tags-reviewed-29.v1.json'), Buffer.concat([data,Buffer.from(' ')]));
  await assert.rejects(buildObservationPage(path,catalog,raw,revision), /observation blob mismatch/);
});
test('pinned player teaser includes only positive labels and never upgrades partial facts to fit', async () => {
  const reviewed = JSON.parse(await readFile(join(root, 'examples/semantic-tags-reviewed-29.v1.json'), 'utf8'));
  const model = prepareObservations(catalog, reviewed);
  const marker = '<div class="section"><label for="mode">';
  const html = linkObservationExplorer('<main>' + marker + '</main>', model);
  const match = html.match(/<script id="inline-gameplay-facts" type="application\/json">([^<]+)<\/script>/);
  assert.ok(match, 'one embedded, non-executable JSON source');
  const data = JSON.parse(match[1]);
  assert.equal(data.catalog, catalog.snapshotId);
  assert.equal(data.evidence, REVIEWED_OBSERVATIONS_SHA);
  assert.equal(data.version, model.version);
  assert.equal(data.games.length, 29);
  assert.ok(Buffer.byteLength(match[1]) <= 20000);
  assert.ok(!match[1].includes('"weight"'));
  assert.ok(!match[1].includes('"source"'));
  assert.ok(!match[1].includes('https://'));
  const factorio = data.games.find(game => game.id === 'wikidata:q16972008');
  const terraria = data.games.find(game => game.id === 'wikidata:q332697');
  assert.ok(factorio.facts.some(tag => tag.id === 'mechanic:building' &&
    terraria.facts.some(other => other.id === tag.id)));
  assert.ok(!data.games.some(game => game.id === 'dreven:devmatch'),
    'unreviewed game must never acquire invented labels');
  assert.throws(() => linkObservationExplorer(marker,
    { ...model, evidence: '0'.repeat(40) }), /revision mismatch/);
});

test('main entry is explicit, isolated and does not replace basket share state', () => {
  const marker = '<div class="section"><label for="mode">';
  const linked = linkObservationExplorer('<main>'+marker+'Recommendation mode</label></main>');
  assert.ok(linked.includes('href="./observations.html" target="_blank" rel="noopener noreferrer"'));
  assert.ok(linked.includes(marker));
  assert.throws(() => linkObservationExplorer('missing'));
  assert.throws(() => linkObservationExplorer(marker+marker));
});
