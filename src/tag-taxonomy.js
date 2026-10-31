// Explicit, versioned vocabulary for offline semantic-tag experiments.
// A taxonomy resolves names; it never invents evidence that a game has a tag.
export const TAG_TAXONOMY_VERSION = 'tag-taxonomy-1';
export const TAG_NAMESPACES = Object.freeze([
  'genre', 'mechanic', 'visual', 'character', 'mood', 'setting', 'activity', 'structure',
]);
const NAMESPACES = new Set(TAG_NAMESPACES);
const TAG_ID = /^([a-z][a-z0-9-]*):([a-z0-9][a-z0-9._-]*)$/;
const GAME_ID = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9._-]*$/;
const taxonomyBrand = new WeakSet();

function record(value, label, allowed) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    throw new TypeError(`${label} must be a plain record`);
  }
  const extra = Object.keys(value).filter(key => !allowed.includes(key));
  if (extra.length) throw new TypeError(`unknown ${label} fields: ${extra.join(', ')}`);
  return value;
}
function string(value, label) {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    throw new TypeError(`${label} must be nonempty trimmed text`);
  }
  return value;
}
function tagId(value, label) {
  const match = TAG_ID.exec(string(value, label));
  if (!match || value.length > 96 || !NAMESPACES.has(match[1])) {
    throw new TypeError(`${label} must be a supported canonical namespace:slug`);
  }
  return value;
}

export function prepareTagTaxonomy(input) {
  const data = record(input, 'taxonomy', ['version', 'tags']);
  if (data.version !== TAG_TAXONOMY_VERSION) throw new TypeError('unsupported tag taxonomy version');
  if (!Array.isArray(data.tags) || data.tags.length < 1 || data.tags.length > 2048) {
    throw new TypeError('taxonomy must contain 1-2048 tags');
  }
  const resolver = Object.create(null);
  const entries = [];
  for (const raw of data.tags) {
    const entry = record(raw, 'taxonomy tag', ['id', 'label', 'aliases']);
    const id = tagId(entry.id, 'tag ID');
    const label = string(entry.label, `${id}.label`);
    const aliases = entry.aliases ?? [];
    if (!Array.isArray(aliases) || aliases.length > 32) {
      throw new TypeError(`${id}.aliases must be an array of at most 32 IDs`);
    }
    const ids = [id, ...aliases.map(value => tagId(value, `${id}.alias`))];
    const namespace = id.split(':', 1)[0];
    for (const key of ids) {
      if (key.split(':', 1)[0] !== namespace) {
        throw new TypeError(`cross-namespace alias cannot change tag meaning: ${key} -> ${id}`);
      }
      if (Object.hasOwn(resolver, key)) {
        throw new TypeError(`duplicate canonical ID or alias: ${key}`);
      }
      resolver[key] = id;
    }
    entries.push(Object.freeze({ id, label, aliases: Object.freeze([...ids.slice(1)].sort()) }));
  }
  entries.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  const result = Object.freeze({
    version: TAG_TAXONOMY_VERSION,
    tags: Object.freeze(entries),
    canonicalById: Object.freeze(resolver),
  });
  taxonomyBrand.add(result);
  return result;
}

// Only explicit, sourced game observations may be projected. No default weights,
// cross-namespace guessing, alias-based evidence multiplication, or zero fill.
export function projectWeightedTagProfiles(taxonomy, games) {
  if (!taxonomyBrand.has(taxonomy)) throw new TypeError('prepare a validated taxonomy first');
  if (!Array.isArray(games) || games.length < 1 || games.length > 250) {
    throw new TypeError('games must contain 1-250 profiles');
  }
  const seenGames = new Set();
  const result = games.map(raw => {
    const game = record(raw, 'game', ['id', 'tags', 'tagCoverage', 'metadata', 'coop', 'coopSource']);
    const id = string(game.id, 'game ID');
    if (!GAME_ID.test(id) || id.length > 96) throw new TypeError(`invalid game ID: ${id}`);
    if (seenGames.has(id)) throw new TypeError(`duplicate game: ${id}`);
    seenGames.add(id);
    if (!Object.hasOwn(game, 'tags')) throw new TypeError(`missing observed/unknown tags marker: ${id}`);
    let tags = null;
    if (game.tags !== null) {
      if (!Array.isArray(game.tags) || game.tags.length < 1 || game.tags.length > 128) {
        throw new TypeError(`${id}.tags must have 1-128 entries or be null`);
      }
      const seenTags = new Set();
      tags = game.tags.map(rawTag => {
        const item = record(rawTag, `${id}.tag`, ['id', 'weight', 'source']);
        const suppliedId = tagId(item.id, `${id}.tag.id`);
        const canonical = taxonomy.canonicalById[suppliedId];
        if (canonical === undefined) throw new TypeError(`unknown taxonomy tag: ${suppliedId}`);
        if (seenTags.has(canonical)) throw new TypeError(`alias/canonical collision: ${id}/${canonical}`);
        seenTags.add(canonical);
        if (typeof item.weight !== 'number' || !Number.isFinite(item.weight) ||
            item.weight <= 0 || item.weight > 1) {
          throw new RangeError(`${id}/${canonical}.weight must be finite in (0,1]`);
        }
        return { id: canonical, weight: item.weight, source: string(item.source, `${id}/${canonical}.source`) };
      }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const sum = tags.reduce((total, item) => total + item.weight, 0);
      if (Math.abs(sum - 1) > 1e-9) {
        throw new RangeError(`tag weights for ${id} must sum to 1; observed ${sum}`);
      }
    }
    // The evidence model validates metadata, co-op receipts and hard constraints.
    // Do not mutate, infer or strip these fields while normalizing tags.
    // An incomplete editorial observation is never a verified complete tag vector.
    if (Object.hasOwn(game, 'tagCoverage') &&
        (tags === null || !['complete', 'partial'].includes(game.tagCoverage))) {
      throw new TypeError(`${id}.tagCoverage requires observed tags and complete or partial`);
    }
    const projected = { id, tags };
    if (Object.hasOwn(game, 'tagCoverage')) projected.tagCoverage = game.tagCoverage;
    for (const key of ['metadata', 'coop', 'coopSource']) {
      if (Object.hasOwn(game, key)) projected[key] = structuredClone(game[key]);
    }
    return projected;
  });
  result.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { taxonomyVersion: taxonomy.version, games: result };
}
