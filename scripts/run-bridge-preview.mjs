#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildBridgePreview } from '../src/bridge-preview.js';

const sample = fileURLToPath(new URL('../examples/bridge.synthetic.json', import.meta.url));
if (process.argv.length > 3 || process.argv[2] === '--help') {
  process.stdout.write('Usage: node scripts/run-bridge-preview.mjs [input.json]\n' +
    'Defaults to an authored synthetic fixture. Input is a JSON object accepted by buildBridgePreview.\n');
  if (process.argv.length > 3) process.exitCode = 2;
} else {
  try {
    const filename = process.argv[2] ? resolve(process.argv[2]) : sample;
    const raw = JSON.parse(await readFile(filename, 'utf8'));
    const report = buildBridgePreview(raw);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`Bridge preview failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
