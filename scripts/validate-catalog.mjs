#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { validateCatalogSnapshot, catalogCoverage } from "../src/catalog.js";
import { DEMO_SNAPSHOT } from "../src/demo.js";
try {
  const args = process.argv.slice(2);
  const publishable = args.includes("--publishable");
  const files = args.filter(arg => arg !== "--publishable");
  if (files.length > 1 || files.some(arg => arg.startsWith("--")) || args.filter(arg => arg === "--publishable").length > 1) {
    throw new Error("Usage: node scripts/validate-catalog.mjs [catalog.json] [--publishable]");
  }
  const file = files[0];
  const snapshot = file ? JSON.parse(readFileSync(file, "utf8")) : DEMO_SNAPSHOT;
  const requirePublishable = publishable || !file;
  const valid = validateCatalogSnapshot(snapshot, { requirePublishable });
  console.log(JSON.stringify({ status: "PASS", snapshot_id: valid.snapshotId, kind: valid.kind,
    game_count: valid.games.length, coverage: catalogCoverage(valid),
    publication_gate_checked: requirePublishable,
    scope: "SCHEMA_AND_RECORDED_RIGHTS_NOT_LEGAL_VERIFICATION" }, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
