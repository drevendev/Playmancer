#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runEvidenceComparison } from '../src/evidence-comparison.js';

const file = process.argv[2] ?? 'examples/evidence-comparison.synthetic.json';
if (process.argv.length > 3) { console.error('Usage: node scripts/compare-evidence-models.mjs [fixture.json]'); process.exit(1); }
try {
  process.stdout.write(JSON.stringify(runEvidenceComparison(JSON.parse(readFileSync(file, 'utf8'))), null, 2) + '\n');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
