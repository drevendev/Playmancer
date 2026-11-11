#!/usr/bin/env node
// Frozen offline observation-weight sensitivity diagnostic; no network calls.
import { readFileSync } from 'node:fs';
import { auditEditorialSelectedWeights } from '../src/editorial-weight-pilot.js';

try {
  const base = new URL('../examples/', import.meta.url);
  const catalog = readFileSync(new URL('catalog.multistore-30.real.json', base), 'utf8');
  const observations = readFileSync(new URL('semantic-tags-reviewed-29.v1.json', base), 'utf8');
  const weights = readFileSync(new URL('semantic-weights-editorial-4.v1.json', base), 'utf8');
  process.stdout.write(JSON.stringify(auditEditorialSelectedWeights(catalog, observations, weights), null, 2) + '\n');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
