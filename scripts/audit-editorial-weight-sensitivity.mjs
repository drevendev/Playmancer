#!/usr/bin/env node
// Frozen offline sensitivity study, requiring exact catalog/receipt readback.
import { readFileSync } from 'node:fs';
import { auditEditorialSelectedWeights } from '../src/editorial-weight-pilot.js';
import { auditEditorialWeightSensitivity } from '../src/editorial-weight-sensitivity.js';

try {
  const base = new URL('../examples/', import.meta.url);
  const catalog = readFileSync(new URL('catalog.multistore-30.real.json', base), 'utf8');
  const observations = readFileSync(new URL('semantic-tags-reviewed-29.v1.json', base), 'utf8');
  const proposal = readFileSync(new URL('semantic-weights-editorial-4.v1.json', base), 'utf8');
  const vetted = auditEditorialSelectedWeights(catalog, observations, proposal);
  process.stdout.write(JSON.stringify(auditEditorialWeightSensitivity(JSON.parse(proposal), vetted), null, 2) + '\n');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
