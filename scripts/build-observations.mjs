import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { prepareObservations, REVIEWED_OBSERVATIONS_SHA, REVIEWED_CATALOG_SHA, OBSERVATION_VERSION } from '../src/observations.js';

export const OBSERVATION_CATALOG_ID = 'multi-store-genre-pilot-30-2026-10-28';
export const gitObservationBlob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
const observationJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,
  character => '\\u' + character.charCodeAt(0).toString(16).padStart(4, '0'));
export async function buildObservationPage(root, catalog, catalogBytes, revision) {
  // Do not attach this evidence to a synthetic or differently versioned catalog.
  if (catalog.snapshotId !== OBSERVATION_CATALOG_ID) return null;
  if (!catalogBytes || gitObservationBlob(catalogBytes) !== REVIEWED_CATALOG_SHA)
    throw new Error('Observation catalog blob mismatch');
  const raw = await readFile(join(root, 'examples/semantic-tags-reviewed-29.v1.json'));
  if (gitObservationBlob(raw) !== REVIEWED_OBSERVATIONS_SHA) throw new Error('Reviewed observation blob mismatch');
  if (revision !== 'unpublished' && !/^[a-f0-9]{40}$/.test(revision)) throw new Error('Invalid observation publication revision');
  const model = prepareObservations(catalog, JSON.parse(raw.toString('utf8')));
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
    .replace('</head>', `<meta name="playmancer-revision" content="${revision}">\n<meta name="playmancer-catalog" content="${OBSERVATION_CATALOG_ID}">\n<meta name="playmancer-observations" content="${REVIEWED_OBSERVATIONS_SHA}">\n</head>`);
  if (Buffer.byteLength(html) > 100000) throw new Error('Observation explorer exceeds 100 kB budget');
  return html;
}
export function linkObservationExplorer(template, model = null) {
  const marker = '<div class="section"><label for="mode">';
  if (template.split(marker).length !== 2) throw new Error('Observation entry anchor missing or ambiguous');
  const entry = `<p class="storefront-links"><a id="observation-explorer-entry" data-observation-version="${OBSERVATION_VERSION}" data-observation-catalog="${OBSERVATION_CATALOG_ID}" data-observation-evidence="${REVIEWED_OBSERVATIONS_SHA}" href="./observations.html" target="_blank" rel="noopener noreferrer">Explore gameplay facts (new tab)</a></p>`;
  // A compact, version-pinned positive-fact subset helps players inspect
  // shared recorded mechanics in recommendation cards. It is neither a
  // ranking input nor a claim of full-game feature coverage.
  let inline = '';
  if (model !== null) {
    if (model.version !== OBSERVATION_VERSION || model.catalog !== OBSERVATION_CATALOG_ID ||
        model.evidence !== REVIEWED_OBSERVATIONS_SHA) {
      throw new Error('Inline observation/release revision mismatch');
    }
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
