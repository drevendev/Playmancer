import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { validateCatalogSnapshot } from '../src/catalog.js';
import { CATALOG, CATALOG_VERSION, DEMO_SNAPSHOT, initialState } from '../src/demo.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = JSON.parse(readFileSync(join(root, 'examples/catalog.alternative.synthetic.json'), 'utf8'));
const builder = join(root, 'scripts/build-demo.mjs');
const run = (...args) => spawnSync(process.execPath, [builder, ...args], { encoding: 'utf8' });
function projected(html) {
  const match = html.match(/^const BUILD_CATALOG_SNAPSHOT = (.+);$/m);
  assert.ok(match, 'one explicit catalog slot exists');
  return JSON.parse(match[1]);
}
function temporary(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'playmancer-adapter-'));
  try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('default player consumes the immutable validated projection without changing initial IDs', () => {
  assert.strictEqual(CATALOG, DEMO_SNAPSHOT.games);
  assert.equal(CATALOG_VERSION, 'synthetic-demo-1');
  assert.deepEqual(initialState().seeds, [{ id: 'demo:ember', weight: 1 }, { id: 'demo:harvest', weight: 1 }]);
  assert.ok(Object.isFrozen(CATALOG) && Object.isFrozen(CATALOG[0]) && Object.isFrozen(CATALOG[0].mechanics));
});

test('alternative build publishes only allowlisted metadata and remains deterministic', () => temporary(dir => {
  const input = join(dir, 'input.json');
  writeFileSync(input, JSON.stringify(fixture));
  const a = join(dir, 'a'), b = join(dir, 'b');
  for (const out of [a, b]) {
    const result = run(out, '--catalog', input);
    assert.equal(result.status, 0, result.stderr);
  }
  const html = readFileSync(join(a, 'index.html'), 'utf8');
  assert.equal(html, readFileSync(join(b, 'index.html'), 'utf8'));
  assert.deepEqual(projected(html), validateCatalogSnapshot(fixture, { requirePublishable: true }));
  for (const marker of ['PRIVATE_SNAPSHOT_SENTINEL', 'PRIVATE_SOURCE_SENTINEL', 'PRIVATE_GAME_SENTINEL', 'not-publishable.png']) {
    assert.ok(!html.includes(marker), marker + ' must not enter public output');
  }
  assert.match(html, /name="playmancer-catalog" content="synthetic-pilot-1"/);
  assert.deepEqual(readdirSync(a).sort(), ['.nojekyll', 'index.html']);
}));

test('inline JSON preserves script-like text, replacement tokens and Unicode separators literally', () => temporary(dir => {
  const input = structuredClone(fixture);
  input.snapshotId = 'fixture-$&-$`-$\'-<version>';
  input.games[2].name = 'Literal </script><script>window.bad=true</script> $& $` $\' \u2028 \u2029';
  input.games[2].description = '<img src=x onerror=window.bad=true> & "$1"';
  const path = join(dir, 'input.json');
  writeFileSync(path, JSON.stringify(input));
  const result = run(join(dir, 'site'), '--catalog', path);
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(join(dir, 'site/index.html'), 'utf8');
  assert.deepEqual(projected(html), validateCatalogSnapshot(input, { requirePublishable: true }));
  const bundle = html.match(/<script type="module">\n([\s\S]*?)\n<\/script>/);
  assert.ok(bundle);
  assert.doesNotThrow(() => new Script(bundle[1]));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('</script><script>window.bad'));
}));

test('invalid refreshes and missing snapshots never replace last-valid output', () => temporary(dir => {
  const site = join(dir, 'site'), path = join(dir, 'input.json');
  writeFileSync(path, JSON.stringify(fixture));
  assert.equal(run(site, '--catalog', path).status, 0);
  const before = readFileSync(join(site, 'index.html'));
  const mutations = [
    x => { x.sources[0].rights.status = 'denied'; },
    x => { x.sources[0].rights.fields = ['id', 'kind', 'name', 'sourceId']; },
    x => { x.games[1].id = x.games[0].id; },
    x => { x.games[1].aliases = x.games[0].aliases; },
    x => { x.games[3].parentId = 'pilot:absent'; },
    x => { x.kind = 'real'; },
    x => { x.games = Array.from({ length: 251 }, (_, i) => ({ ...x.games[0], id: `large:${i}`, aliases: [] })); }
  ];
  for (const mutate of mutations) {
    const input = structuredClone(fixture); mutate(input);
    writeFileSync(path, JSON.stringify(input));
    const result = run(site, '--catalog', path);
    assert.notEqual(result.status, 0);
    assert.deepEqual(readFileSync(join(site, 'index.html')), before);
  }
  for (const text of ['not JSON', ' '.repeat(1048577)]) {
    writeFileSync(path, text);
    assert.notEqual(run(site, '--catalog', path).status, 0);
    assert.deepEqual(readFileSync(join(site, 'index.html')), before);
  }
  for (const args of [['--catalog'], ['--catalog', join(dir, 'missing.json')], ['--unknown']]) {
    assert.notEqual(run(site, ...args).status, 0);
    assert.deepEqual(readFileSync(join(site, 'index.html')), before);
  }
}));

test('a merged-script declaration collision fails before last-valid HTML is replaced', () => temporary(dir => {
  cpSync(join(root, 'src'), join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'scripts'));
  cpSync(builder, join(dir, 'scripts/build-demo.mjs'));
  cpSync(join(root, 'index.html'), join(dir, 'index.html'));
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  const build = () => spawnSync(process.execPath, [join(dir, 'scripts/build-demo.mjs')], { encoding: 'utf8' });
  const first = build(); assert.equal(first.status, 0, first.stderr);
  const before = readFileSync(join(dir, '_site/index.html'));
  const path = join(dir, 'src/demo-ui.js');
  writeFileSync(path, readFileSync(path, 'utf8') + '\nconst cachedBridgePreview = null;\n');
  const invalid = build();
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /already been declared|SyntaxError/);
  assert.deepEqual(readFileSync(join(dir, '_site/index.html')), before);
}));
