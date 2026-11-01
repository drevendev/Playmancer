#!/usr/bin/env node
// Offline-only factual crossover evidence. Do not publish as player similarity.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrozenCuratedBridge } from './compare-bridge-curated-30.mjs';
import { projectFrozenGenres } from '../src/evidence-real-pilot.js';
import { prepareEvidenceModel } from '../src/evidence-similarity.js';
import { findCuratedBridge } from '../src/evidence-bridge.js';

const CATALOG = new URL('../examples/catalog.multistore-30.real.json', import.meta.url);
const RECEIPTS = new URL('../examples/curated-relations.official-3.json', import.meta.url);
export const OFFICIAL_CROSSOVER_PROTOCOL = 'p76-official-crossovers-30-v1';
const CATALOG_BLOB = '0570fd610b14fb336c0de65e6cc3062892abe301';
const SNAPSHOT = 'multi-store-genre-pilot-30-2026-10-28';
const CLAIMS = [
  ['wikidata:q30639210', 'wikidata:q29300592', 'https://deadcells.com/patchnotes/26',
    '2021-11-22', 'Dead Cells update 26 includes the Pure Nail weapon referring to Hollow Knight.'],
  ['wikidata:q30639210', 'wikidata:q332697', 'https://deadcells.com/patchnotes/32',
    '2022-11-07', 'Dead Cells update 32 includes the Starfury weapon referring to Terraria.'],
  ['wikidata:q30639210', 'wikidata:q48078440', 'https://deadcells.com/patchnotes/32',
    '2022-11-07', 'Dead Cells update 32 includes the Diverse Deck power referring to Slay the Spire.'],
];
const STATUSES = ['route', 'no-route', 'uncertain', 'excluded'];
const counts = () => Object.fromEntries(STATUSES.map(status => [status, 0]));

export function validateOfficialCrossoverReceipts(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      input.schema !== 'p76-deadcells-crossovers-3-v1' ||
      input.catalogSnapshotId !== SNAPSHOT || input.catalogBlobSha1 !== CATALOG_BLOB ||
      input.scope !== 'offline-factual-reference-pilot; not part of published catalog' ||
      input.recordedAt !== '2026-11-01' ||
      !Array.isArray(input.relations) || input.relations.length !== CLAIMS.length) {
    throw new TypeError('Unsupported or changed official-crossover receipt manifest');
  }
  const expected = new Map(CLAIMS.map(([from, to, url, date, fact]) =>
    [from + '>' + to, { url, date, fact }]));
  const seen = new Set();
  for (const edge of input.relations) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      throw new TypeError('Invalid curated receipt row');
    }
    const key = edge.from + '>' + edge.to;
    const receipt = expected.get(key);
    if (!receipt || seen.has(key) ||
        edge.type !== 'references' || edge.strength !== 1 ||
        edge.source !== receipt.url || edge.sourceDate !== receipt.date ||
        edge.observedFact !== receipt.fact ||
        Object.keys(edge).sort().join(',') !==
          'from,observedFact,source,sourceDate,strength,to,type') {
      throw new TypeError('Unverified, duplicated or changed curated crossover: ' + key);
    }
    seen.add(key);
  }
  // Freeze this tiny factual cohort; adding more links requires independent receipts
  // and a new protocol, never a silent revision of the frozen 30-game evaluation.
  return CLAIMS.map(([from, to]) => {
    const row = input.relations.find(r => r.from === from && r.to === to);
    return { from, to, type: row.type, strength: row.strength, source: row.source };
  });
}

export function compareOfficialCrossoverReceipts(manifest) {
  const relations = validateOfficialCrossoverReceipts(manifest);
  // The existing zero-curated-edges report validates BOTH immutable catalog
  // and all 30 basket plans / 50 endpoint pairs. Its results remain untouched.
  const frozen = loadFrozenCuratedBridge();
  if (frozen.frozen_catalog_git_blob_sha1 !== CATALOG_BLOB ||
      frozen.catalog_games !== 30 || frozen.summary.pair_count !== 50 ||
      frozen.curated_relation_receipts !== 0) {
    throw new Error('Frozen comparator source or task plan changed');
  }
  const model = prepareEvidenceModel({
    games: projectFrozenGenres(JSON.parse(readFileSync(CATALOG, 'utf8'))),
    relations,
  });
  const statuses = counts();
  const pairs = frozen.pairs.map(row => {
    const enriched = findCuratedBridge(model, {
      from: row.from, to: row.to, platform: row.constraints.platform,
      coopOnly: row.constraints.coopOnly, excluded: row.excluded_candidate_ids,
    });
    if (!STATUSES.includes(enriched.status) ||
        (['excluded', 'uncertain'].includes(row.curated_two_hop_status) &&
          enriched.status !== row.curated_two_hop_status) ||
        (enriched.status === 'route' &&
          (!enriched.hops.length || enriched.hops.length > 2 ||
           enriched.hops.some(hop => !relations.some(r => r.source === hop.source &&
             r.from === hop.authoredFrom && r.to === hop.authoredTo))))) {
      throw new Error('Changed hard eligibility or unsourced route for ' + row.basket_id);
    }
    statuses[enriched.status]++;
    return {
      basket_id: row.basket_id, group: row.group, from: row.from, to: row.to,
      constraints: row.constraints, excluded_candidate_ids: row.excluded_candidate_ids,
      legacy_feature_two_hop_status: row.matched_legacy_two_hop_status,
      no_receipts_curated_status: row.curated_two_hop_status,
      with_official_receipts_status: enriched.status,
      with_official_receipts_reason: enriched.reason,
      nodes: enriched.nodes, hops: enriched.hops,
      graph_evidence_strength_not_fit: enriched.evidenceStrength,
    };
  });
  return {
    report_schema: OFFICIAL_CROSSOVER_PROTOCOL,
    frozen_catalog_snapshot_id: frozen.catalog_snapshot_id,
    frozen_catalog_git_blob_sha1: frozen.frozen_catalog_git_blob_sha1,
    frozen_plan_git_blob_sha1: frozen.frozen_basket_plan_git_blob_sha1,
    receipt_manifest: manifest.schema,
    source_category: 'developer-published patch notes; original minimal factual observations',
    license_boundary: 'No patch-note prose, artwork or publisher-authored tags reproduced; no store/community imports',
    catalog_games: 30, documented_graph_games: 4, authored_reference_edges: relations.length,
    route_policy: 'Same 50 endpoint pairs, hard constraints, exclusions and two-hop cap; no inferred edges',
    warning: 'Offline evidence-presence diagnostic, NOT relevance, taste similarity, license of publisher prose or public player readiness. Every other potential relation is unknown, not false.',
    summary: {
      pairs: pairs.length, with_official_receipts_statuses: statuses,
      zero_receipt_curated_statuses: frozen.summary.curated_two_hop_statuses,
      matched_legacy_feature_statuses: frozen.summary.matched_legacy_two_hop_statuses,
      newly_sourced_route_tasks: pairs.filter(p =>
        p.no_receipts_curated_status !== 'route' &&
        p.with_official_receipts_status === 'route').map(p => ({
          basket_id: p.basket_id, from: p.from, to: p.to, nodes: p.nodes,
        })),
      still_without_sourced_route_tasks: pairs.filter(p =>
        p.with_official_receipts_status === 'no-route').length,
      latency: 'NOT_MEASURED', human_relevance: 'NOT_MEASURED',
    },
    receipts: manifest.relations.map(r => ({
      from: r.from, to: r.to, type: r.type, source: r.source,
      sourceDate: r.sourceDate, observedFact: r.observedFact,
    })),
    pairs,
  };
}

export function loadOfficialCrossoverReport() {
  return compareOfficialCrossoverReceipts(JSON.parse(readFileSync(RECEIPTS, 'utf8')));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) {
    console.error('Usage: node scripts/compare-bridge-curated-receipts-30.mjs');
    process.exitCode = 2;
  } else {
    try {
      process.stdout.write(JSON.stringify(loadOfficialCrossoverReport(), null, 2) + '\n');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
