#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { runBenchmark } from '../src/benchmark.js';

const inputPath = process.argv[2];
if (!inputPath || process.argv.length !== 3) {
  console.error('Usage: node scripts/run-ranking-benchmark.mjs <benchmark.json>');
  process.exit(1);
}

try {
  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(runBenchmark(input), null, 2)}\n`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
