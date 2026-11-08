#!/usr/bin/env node
// Offline v2 capacity timing; deliberately excludes browser/network and input generation.
import { benchmarkEvidenceCapacity } from "../src/evidence-capacity-probe.js";

if (process.argv.length > 4) {
  console.error("Usage: node scripts/benchmark-evidence-250.mjs [samples] [partialTagEvery]");
  process.exitCode = 2;
} else {
  try {
    const samples = process.argv[2] === undefined ? 24 : Number(process.argv[2]);
    const partialTagEvery = process.argv[3] === undefined ? 0 : Number(process.argv[3]);
    const result = benchmarkEvidenceCapacity({ samples, partialTagEvery });
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
