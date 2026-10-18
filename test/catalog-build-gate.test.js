import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('invalid actual demo metadata fails before replacing last-valid static output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'playmancer-catalog-build-'));
  const root = new URL('../', import.meta.url);
  try {
    cpSync(new URL('src/', root), join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'scripts'));
    cpSync(new URL('scripts/build-demo.mjs', root), join(dir, 'scripts/build-demo.mjs'));
    cpSync(new URL('index.html', root), join(dir, 'index.html'));
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const build = () => spawnSync(process.execPath, [join(dir, 'scripts/build-demo.mjs')], { encoding: 'utf8' });
    const first = build(); assert.equal(first.status, 0, first.stderr);
    const before = readFileSync(join(dir, '_site/index.html'));
    const path = join(dir, 'src/demo.js');
    const source = readFileSync(path, 'utf8');
    assert.ok(source.includes('profile("harvest"'));
    writeFileSync(path, source.replace('profile("harvest"', 'profile("ember"'));
    const invalid = build(); assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /Duplicate game ID/);
    assert.deepEqual(readFileSync(join(dir, '_site/index.html')), before);
    assert.equal(invalid.stdout, '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
