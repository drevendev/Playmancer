/** Positive, partial observations: deliberately independent of taste scoring. */
export const OBSERVATION_VERSION = 'observations-2';
export const REVIEWED_OBSERVATIONS_SHA = '426fa34e432bcb10fc96dd48462f0b6d7dc62c9d';
export const REVIEWED_CATALOG_SHA = '0570fd610b14fb336c0de65e6cc3062892abe301';
const observationOrder = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function observationText(value, name, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/u.test(value))
    throw new Error(`Invalid ${name}`);
  return value;
}
function observationList(value, name, max) {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Invalid ${name}`);
  return value;
}
function observationURL(value) {
  const url = new URL(observationText(value, 'source URL', 512));
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new Error('Expected a public HTTPS source URL without credentials');
  return url;
}
function freezeObservations(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeObservations);
    Object.freeze(value);
  }
  return value;
}
export function prepareObservations(catalog, reviewed, evidenceId = REVIEWED_OBSERVATIONS_SHA) {
  if (!catalog || !reviewed || reviewed.schemaVersion !== 1 ||
      catalog.snapshotId !== reviewed.catalogSnapshotId ||
      reviewed.catalogGitBlobSha1 !== REVIEWED_CATALOG_SHA ||
      !/^[a-f0-9]{40}$/.test(evidenceId)) throw new Error('Observation/catalog revision mismatch');
  const records = observationList(catalog.games, 'catalog games', 250);
  if (!records.length) throw new Error('Empty catalog');
  const catalogIds = new Set();
  for (const game of records) {
    observationText(game.id, 'game ID', 128); observationText(game.name, 'game name');
    if (catalogIds.has(game.id)) throw new Error('Duplicate catalog identity');
    catalogIds.add(game.id);
  }
  if (reviewed.taxonomy?.version !== 'tag-taxonomy-1') throw new Error('Unsupported taxonomy');
  const dictionary = new Map();
  for (const tag of observationList(reviewed.taxonomy.tags, 'taxonomy', 256)) {
    if (!/^(activity|character|genre|mechanic|mood|setting|structure|visual):[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag.id) || dictionary.has(tag.id))
      throw new Error('Invalid or duplicate observation tag');
    dictionary.set(tag.id, observationText(tag.label, 'tag label'));
  }
  const receipts = new Map();
  for (const receipt of observationList(reviewed.receipts, 'receipts', 250)) {
    if (!catalogIds.has(receipt.id) || receipts.has(receipt.id)) throw new Error('Unknown or duplicate receipt');
    const date = observationText(receipt.reviewedOn, 'review date', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date) throw new Error('Invalid review date');
    receipts.set(receipt.id, { publisher: observationText(receipt.publisher, 'publisher'),
      url: observationURL(receipt.url).href, reviewedOn: date });
  }
  const profiles = new Map();
  for (const game of observationList(reviewed.games, 'observed games', 250)) {
    const receipt = receipts.get(game.id);
    if (!catalogIds.has(game.id) || !receipt || profiles.has(game.id) || game.tagCoverage !== 'partial')
      throw new Error('Only distinct, receipted partial profiles are supported');
    const tags = observationList(game.tags, 'observations', 128);
    if (!tags.length) throw new Error('Empty observed profile');
    const seen = new Set(); let mass = 0;
    const facts = tags.map(tag => {
      if (!dictionary.has(tag.id) || seen.has(tag.id) || !Number.isFinite(tag.weight) || tag.weight <= 0)
        throw new Error('Invalid or duplicate per-game observation');
      seen.add(tag.id); mass += tag.weight;
      const url = observationURL(tag.source);
      if (url.origin !== new URL(receipt.url).origin) throw new Error('Observation source does not match receipt origin');
      // Keep each field URL, not merely the homepage: Celeste has changelog receipts.
      return { id: tag.id, label: dictionary.get(tag.id), source: url.href,
        publisher: receipt.publisher, reviewedOn: receipt.reviewedOn };
    }).sort((a, b) => observationOrder(a.id, b.id));
    if (Math.abs(mass - 1) > 1e-9) throw new Error('Invalid selected-annotation mass');
    profiles.set(game.id, facts);
  }
  if (profiles.size !== receipts.size) throw new Error('Orphan observation receipt');
  const games = records.map(game => ({ id: game.id, name: game.name,
    coverage: profiles.has(game.id) ? 'partial' : 'unknown', facts: profiles.get(game.id) ?? []
  })).sort((a, b) => observationOrder(a.name, b.name) || observationOrder(a.id, b.id));
  const used = new Set(games.flatMap(game => game.facts.map(fact => fact.id)));
  return freezeObservations({ version: OBSERVATION_VERSION, catalog: catalog.snapshotId,
    evidence: evidenceId, games, tags: [...dictionary].filter(([id]) => used.has(id))
      .map(([id, label]) => ({ id, label })).sort((a, b) => observationOrder(a.label, b.label)),
    observedGames: profiles.size, factCount: games.reduce((n, game) => n + game.facts.length, 0) });
}
export function compareObservations(model, leftId, rightId) {
  const left = model.games.find(game => game.id === leftId);
  const right = model.games.find(game => game.id === rightId);
  if (!left || !right || leftId === rightId) throw new Error('Choose two distinct catalog games');
  const rightFacts = new Map(right.facts.map(fact => [fact.id, fact]));
  const leftIds = new Set(left.facts.map(fact => fact.id));
  return { left, right, status: left.coverage === 'unknown' || right.coverage === 'unknown' ? 'unknown' : 'partial',
    shared: left.facts.filter(fact => rightFacts.has(fact.id)).map(fact => ({ id: fact.id, label: fact.label, left: fact, right: rightFacts.get(fact.id) })),
    leftRecorded: left.facts.filter(fact => !rightFacts.has(fact.id)),
    rightRecorded: right.facts.filter(fact => !leftIds.has(fact.id)) };
}
export function searchObservations(model, query = '', tag = '') {
  if (typeof query !== 'string' || query.length > 120 || typeof tag !== 'string' || (tag && !model.tags.some(t => t.id === tag)))
    throw new Error('Invalid observation search');
  const needle = query.trim().normalize('NFC').toLowerCase();
  return model.games.filter(game => (!tag || game.facts.some(fact => fact.id === tag)) &&
    (!needle || [game.name, ...game.facts.flatMap(fact => [fact.label, fact.id])]
      .some(text => text.normalize('NFC').toLowerCase().includes(needle))));
}
export function validateObservationState(model, state) {
  if (!state || Array.isArray(state) || typeof state !== 'object' ||
      Object.keys(state).sort().join(',') !== 'catalog,evidence,pair,query,tag,version' ||
      state.version !== OBSERVATION_VERSION || state.catalog !== model.catalog || state.evidence !== model.evidence)
    throw new Error('Incompatible observation link version');
  if (typeof state.query !== 'string' || typeof state.tag !== 'string') throw new Error('Invalid observation search state');
  if (!Array.isArray(state.pair) || ![0, 2].includes(state.pair.length)) throw new Error('Invalid comparison pair');
  if (state.pair.length) compareObservations(model, ...state.pair);
  searchObservations(model, state.query, state.tag);
  return { version: OBSERVATION_VERSION, catalog: model.catalog, evidence: model.evidence,
    pair: [...state.pair], query: state.query, tag: state.tag };
}
export function encodeObservationState(model, state) {
  return '#facts=' + encodeURIComponent(JSON.stringify(validateObservationState(model, state)));
}
export function decodeObservationState(model, hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#facts=') || hash.length > 4096)
    throw new Error('Invalid observation link');
  return validateObservationState(model, JSON.parse(decodeURIComponent(hash.slice(7))));
}
