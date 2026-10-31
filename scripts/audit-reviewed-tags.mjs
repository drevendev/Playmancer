#!/usr/bin/env node
// Offline deterministic diagnostic. No API/store requests.
import { readFileSync } from 'node:fs';
import { auditReviewedTagReadiness } from '../src/reviewed-tag-readiness.js';

const cohort = process.argv.length === 2 ? 'eight'
  : process.argv.length === 3 && process.argv[2] === '--twelve' ? 'twelve' : null;
if (cohort === null) {
  console.error('Usage: node scripts/audit-reviewed-tags.mjs [--twelve] > report.json');
  process.exitCode = 2;
} else {
  try {
    const catalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
    const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
    const name = cohort === 'eight' ? 'semantic-tags-reviewed-8.v1.json'
      : 'semantic-tags-reviewed-12.v1.json';
    const reviewed = readFileSync(new URL('../examples/' + name, import.meta.url), 'utf8');
    process.stdout.write(JSON.stringify(auditReviewedTagReadiness(catalog, plan, reviewed, cohort), null, 2) + '\n');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
