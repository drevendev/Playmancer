import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

// The real static bundler concatenates these two ES modules into ONE script.
// This focused preflight catches cross-module top-level redeclarations that
// ordinary Node ESM imports and node --test do not detect.
test('Bridge solver and preview coexist in the static concatenated script', () => {
  const src = (name) => readFileSync(join(root, name), 'utf8');
  let solver = src('src/bridge.js').replace(/^export /gm, '');
  const previewImport = "import { findBridgeRoute } from './bridge.js';\n";
  const previewSource = src('src/bridge-preview.js');
  assert.equal(previewSource.split(previewImport).length, 2, 'Keep bundler import contract in sync');
  const preview = previewSource.replace(previewImport, '').replace(/^export /gm, '');
  for (const name of ['assertCanonicalId', 'assertUnitInterval', 'comparePath', 'compareState']) {
    solver = solver.replace(new RegExp('\\b' + name + '\\b', 'g'), 'bridge' + name[0].toUpperCase() + name.slice(1));
  }
  const dir = mkdtempSync(join(tmpdir(), 'playmancer-bridge-bundle-'));
  try {
    const path = join(dir, 'bundle.mjs');
    writeFileSync(path, `${solver}\n\n${preview}\n`);
    const result = spawnSync(process.execPath, ['--check', path], {encoding:'utf8'});
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
