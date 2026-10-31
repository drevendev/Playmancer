#!/usr/bin/env node
// Offline deterministic diagnostic. No API/store requests.
import { readFileSync } from 'node:fs';
import { auditReviewedTagReadiness } from '../src/reviewed-tag-readiness.js';

if (process.argv.length !== 2) {
  console.error('Usage: node scripts/audit-reviewed-tags.mjs > report.json');
  process.exitCode = 2;
} else {
  try {
    const catalog = readFileSync(new URL('../examples/catalog.multistore-30.real.json', import.meta.url), 'utf8');
    const plan = JSON.parse(readFileSync(new URL('../examples/evaluation-baskets-30.real.json', import.meta.url), 'utf8'));
    const reviewed = readFileSync(new URL('../examples/semantic-tags-reviewed-8.v1.json', import.meta.url), 'utf8');
    process.stdout.write(JSON.stringify(auditReviewedTagReadiness(catalog, plan, reviewed), null, 2) + '\n');
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
