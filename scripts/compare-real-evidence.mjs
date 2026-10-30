#!/usr/bin/env node
// Offline only. No web/store requests, tracking, or live player change.
import { readFileSync } from 'node:fs';
import { runFrozenRealEvidenceComparison } from '../src/evidence-real-pilot.js';

if (process.argv.length !== 2) {
  console.error('Usage: node scripts/compare-real-evidence.mjs > report.json');
  process.exitCode = 2;
} else {
  try {
    const catalogText = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
    const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
    process.stdout.write(JSON.stringify(runFrozenRealEvidenceComparison(catalogText, plan), null, 2) + '\n');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
