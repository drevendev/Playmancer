#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const FIELD_GROUPS = {
  canonicalIdentity: ['__qid__'],
  releaseDate: ['P577'],
  platform: ['P400'],
  developer: ['P178'],
  publisher: ['P123'],
  genre: ['P136'],
  seriesOrFranchise: ['P179', 'P361'],
  externalId: ['P1733', 'P9043'],
};

function usableStatement(statement) {
  if (!statement || statement.rank === 'deprecated') return false;
  const snak = statement.mainsnak;
  return Boolean(snak && snak.snaktype === 'value' && snak.datavalue);
}

function hasUsableClaim(entity, property) {
  const statements = entity?.claims?.[property];
  return Array.isArray(statements) && statements.some(usableStatement);
}

function hasField(entity, properties) {
  if (properties[0] === '__qid__') {
    return typeof entity?.id === 'string' && /^Q\d+$/.test(entity.id);
  }
  return properties.some((property) => hasUsableClaim(entity, property));
}

function normalizeEntities(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && parsed.entities && typeof parsed.entities === 'object') {
    return Object.values(parsed.entities);
  }
  throw new Error('Input must be an array of Wikidata entities or an object with an entities map.');
}

export function measure(raw, expectedCount = 60) {
  const parsed = JSON.parse(raw);
  const entities = normalizeEntities(parsed);
  const qids = entities.map((entity) => entity?.id ?? null);
  const validQids = qids.filter((id) => typeof id === 'string' && /^Q\d+$/.test(id));
  const seen = new Set();
  const duplicates = [];
  for (const id of validQids) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }

  const fields = {};
  for (const [name, properties] of Object.entries(FIELD_GROUPS)) {
    const covered = entities.filter((entity) => hasField(entity, properties)).length;
    fields[name] = {
      properties,
      covered,
      total: entities.length,
      coverage: entities.length === 0 ? 0 : Number((covered / entities.length).toFixed(4)),
    };
  }

  const errors = [];
  if (entities.length !== expectedCount) {
    errors.push(`expected ${expectedCount} entities, got ${entities.length}`);
  }
  if (validQids.length !== entities.length) {
    errors.push(`expected every entity to have a canonical QID, got ${validQids.length}/${entities.length}`);
  }
  if (duplicates.length > 0) {
    errors.push(`duplicate QIDs: ${[...new Set(duplicates)].join(', ')}`);
  }

  return {
    inputSha256: createHash('sha256').update(raw).digest('hex'),
    expectedCount,
    sampleCount: entities.length,
    duplicateQids: [...new Set(duplicates)],
    fields,
    valid: errors.length === 0,
    errors,
  };
}

function statement(property, { rank = 'normal', snaktype = 'value', value = 'x' } = {}) {
  return {
    rank,
    mainsnak: {
      property,
      snaktype,
      ...(snaktype === 'value' ? { datavalue: { value, type: 'string' } } : {}),
    },
  };
}

function runSelfTest() {
  const sample = [
    {
      id: 'Q1',
      claims: {
        P577: [statement('P577')],
        P400: [statement('P400')],
        P178: [statement('P178', { rank: 'deprecated' })],
        P123: [statement('P123', { snaktype: 'novalue' })],
        P136: [statement('P136')],
        P179: [statement('P179')],
        P1733: [statement('P1733')],
      },
    },
    {
      id: 'Q2',
      claims: {
        P178: [statement('P178')],
        P123: [statement('P123')],
        P361: [statement('P361')],
        P9043: [statement('P9043')],
      },
    },
  ];

  const report = measure(JSON.stringify(sample), 2);
  const assertions = [
    ['valid sample', report.valid === true],
    ['release date coverage', report.fields.releaseDate.covered === 1],
    ['deprecated excluded', report.fields.developer.covered === 1],
    ['novalue excluded', report.fields.publisher.covered === 1],
    ['series/franchise OR', report.fields.seriesOrFranchise.covered === 2],
    ['external ID OR', report.fields.externalId.covered === 2],
  ];

  const duplicateReport = measure(JSON.stringify([sample[0], sample[0]]), 2);
  assertions.push(['duplicates rejected', duplicateReport.valid === false && duplicateReport.duplicateQids[0] === 'Q1']);

  const failed = assertions.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    for (const [name] of failed) console.error(`FAIL: ${name}`);
    process.exit(1);
  }
  console.log(`PASS: ${assertions.length} self-tests`);
}

function parseArgs(argv) {
  const args = { expectedCount: 60, selfTest: false, input: null };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--self-test') args.selfTest = true;
    else if (token === '--expected-count') args.expectedCount = Number(argv[++i]);
    else if (!args.input) args.input = token;
    else throw new Error(`Unexpected argument: ${token}`);
  }
  if (!Number.isInteger(args.expectedCount) || args.expectedCount < 0) {
    throw new Error('--expected-count must be a non-negative integer');
  }
  return args;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.selfTest) {
      runSelfTest();
    } else {
      if (!args.input) throw new Error('Usage: node scripts/measure-wikidata-coverage.mjs <entities.json> [--expected-count 60]');
      const raw = readFileSync(args.input, 'utf8');
      const report = measure(raw, args.expectedCount);
      console.log(JSON.stringify(report, null, 2));
      if (!report.valid) process.exitCode = 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
