import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { prepareObservations, REVIEWED_OBSERVATIONS_SHA, REVIEWED_CATALOG_SHA, OBSERVATION_VERSION,
  CANDIDATE_CATALOG_ID, CANDIDATE_CATALOG_SHA, CANDIDATE_OBSERVATIONS_SHA,
  CATALOG_35_ID, CATALOG_35_SHA, OBSERVATIONS_35_SHA,
  CATALOG_51_ID, CATALOG_51_SHA, OBSERVATIONS_51_SHA } from '../src/observations.js';

export const OBSERVATION_CATALOG_ID = 'multi-store-genre-pilot-30-2026-10-28';
// Exact bindings; the candidate never aliases the live snapshot.
const bindings = new Map([
  [OBSERVATION_CATALOG_ID, { catalogSha: REVIEWED_CATALOG_SHA, evidence: REVIEWED_OBSERVATIONS_SHA,
    file: 'examples/semantic-tags-reviewed-29.v1.json' }],
  [CANDIDATE_CATALOG_ID, { catalogSha: CANDIDATE_CATALOG_SHA, evidence: CANDIDATE_OBSERVATIONS_SHA,
    file: 'examples/semantic-tags-reviewed-30.catalog31.v1.json' }],
  [CATALOG_35_ID, { catalogSha: CATALOG_35_SHA, evidence: OBSERVATIONS_35_SHA,
    file: 'examples/semantic-tags-reviewed-30.catalog35.v1.json' }],
  [CATALOG_51_ID, { catalogSha: CATALOG_51_SHA, evidence: OBSERVATIONS_51_SHA,
    file: 'examples/semantic-tags-reviewed-30.catalog51.v1.json' }],
]);
export const gitObservationBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const observationJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,
  character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
export async function readReleaseObservations(root, catalog, catalogBytes) {
  const binding = bindings.get(catalog.snapshotId);
  if (!binding) return null;
  if (!catalogBytes || gitObservationBlob(catalogBytes) !== binding.catalogSha)
    throw new Error('Observation catalog blob mismatch');
  const raw = await readFile(join(root, binding.file));
  if (gitObservationBlob(raw) !== binding.evidence) throw new Error('Reviewed observation blob mismatch');
  return prepareObservations(JSON.parse(catalogBytes.toString('utf8')), JSON.parse(raw.toString('utf8')), binding.evidence);
}
export async function buildObservationPage(root, catalog, catalogBytes, revision) {
  const model = await readReleaseObservations(root, catalog, catalogBytes);
  if (model === null) return null;
  if (revision !== 'unpublished' && !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid observation publication revision');
  let core = await readFile(join(root, 'src/observations.js'), 'utf8');
  let ui = await readFile(join(root, 'src/observations-ui.js'), 'utf8');
  const importLine = "import { compareObservations, searchObservations, encodeObservationState, decodeObservationState } from './observations.js';\n";
  if (ui.split(importLine).length !== 2 || ui.split('const OBSERVATION_DATA = null;').length !== 2)
    throw new Error('Unexpected observation UI module shape');
  core = core.replace(/^export /gm, '');
  ui = ui.replace(importLine, '').replace('const OBSERVATION_DATA = null;', () => 'const OBSERVATION_DATA = ' + observationJSON(model) + ';');
  const script = core + '\n' + ui;
  if (/^\s*(?:import|export)\s/m.test(script) || /<\/script/i.test(script)) throw new Error('Unsafe observation bundle');
  new Script(script, { filename: 'playmancer-observations.js' });
  const template = await readFile(join(root, 'observations.html'), 'utf8');
  const entry = '<script type="module" src="./src/observations-ui.js"></script>';
  if (template.split(entry).length !== 2 || template.split('</head>').length !== 2)
    throw new Error('Unexpected observation HTML template');
  const html = template.replace(entry, () => '<script type="module">\n' + script + '\n</script>')
    .replace('</head>', `<meta name="playmancer-revision" content="${revision}">\n<meta name="playmancer-catalog" content="${model.catalog}">\n<meta name="playmancer-observations" content="${model.evidence}">\n</head>`);
  // Keep the existing small-release ceiling. Sparse scale measurements on the
  // 35-game evidence set were 146,752 bytes at 1,000 and 237,752 at 2,000.
  // Separate tiers leave room for normal titles and UI without relaxing inline facts.
  const budget = model.games.length <= 250 ? 100000 : model.games.length <= 1000 ? 200000 : 320000;
  const size = Buffer.byteLength(html);
  if (size >= budget) throw new Error(`Observation explorer exceeds budget: ${size} bytes (must be below ${budget})`);
  return html;
}
export function linkObservationExplorer(template, model = null) {
  const marker = '<div class="section"><label for="mode">';
  if (template.split(marker).length !== 2) throw new Error('Observation entry anchor missing or ambiguous');
  const catalog = model === null ? OBSERVATION_CATALOG_ID : model.catalog;
  const binding = bindings.get(catalog);
  if (!binding || (model !== null && (model.version !== OBSERVATION_VERSION || model.evidence !== binding.evidence)))
    throw new Error('Inline observation/release revision mismatch');
  const entry = `<p class="storefront-links"><a id="observation-explorer-entry" data-observation-version="${OBSERVATION_VERSION}" data-observation-catalog="${catalog}" data-observation-evidence="${binding.evidence}" href="./observations.html" target="_blank" rel="noopener noreferrer">Explore gameplay facts (new tab)</a></p>`;
  // A compact, version-pinned positive-fact subset helps players inspect
  // shared recorded mechanics in recommendation cards. It is neither a
  // ranking input nor a claim of full-game feature coverage.
  let inline = '';
  if (model !== null) {
    const subset = { version: model.version, catalog: model.catalog, evidence: model.evidence,
      games: model.games.filter(game => game.facts.length).map(game => ({
        id: game.id, facts: game.facts.map(fact => ({ id: fact.id, label: fact.label })),
      })) };
    const payload = observationJSON(subset);
    if (Buffer.byteLength(payload) > 20000) throw new Error('Inline observation payload exceeds 20 kB');
    inline = '<script id="inline-gameplay-facts" type="application/json">' + payload + '</script>\n';
  }
  return template.replace(marker, entry + '\n' + inline + marker);
}
