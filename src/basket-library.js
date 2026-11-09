/** Local, explicit-save baskets. The existing player owns state compatibility. */
export const BASKET_LIBRARY_FORMAT = 'playmancer-baskets';
export const BASKET_LIBRARY_LIMIT = 20;
export const BASKET_BACKUP_BYTES = 1048576;
export const BASKET_DATABASE = 'playmancer-basket-library';
const storeName = 'baskets';
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keysAre = (value, keys) => record(value) && Object.keys(value).length === keys.length &&
  keys.every(key => Object.hasOwn(value, key));

export function basketName(value) {
  if (typeof value !== 'string') throw new Error('Give this basket a name.');
  const name = value.trim();
  if (!name || [...name].length > 64 || /[\u0000-\u001f\u007f-\u009f]/u.test(name))
    throw new Error('Use a name of 1–64 characters without control characters.');
  return name;
}

export function validateBasketEntries(entries) {
  if (!Array.isArray(entries) || entries.length > BASKET_LIBRARY_LIMIT)
    throw new Error('A library holds at most 20 baskets. Export or remove one first.');
  const seen = new Set();
  return entries.map(entry => {
    if (!keysAre(entry, ['name', 'hash']) || entry.name !== basketName(entry.name) ||
        typeof entry.hash !== 'string' || !entry.hash.startsWith('#basket=') || entry.hash.length > 100000)
      throw new Error('Invalid saved basket record. Existing data was not replaced.');
    if (seen.has(entry.name)) throw new Error('Duplicate basket name. Rename it before importing or saving.');
    seen.add(entry.name);
    return { name: entry.name, hash: entry.hash };
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

export function exportBasketBackup(entries) {
  const text = JSON.stringify({ format: BASKET_LIBRARY_FORMAT, version: 1,
    baskets: validateBasketEntries(entries) }, null, 2);
  if (new TextEncoder().encode(text).length > BASKET_BACKUP_BYTES)
    throw new Error('Backup exceeds the 1 MiB limit.');
  return text;
}

export function importBasketBackup(text, decode) {
  if (typeof text !== 'string' || text.length > BASKET_BACKUP_BYTES ||
      new TextEncoder().encode(text).length > BASKET_BACKUP_BYTES)
    throw new Error('Import must be JSON no larger than 1 MiB.');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('Malformed JSON. Nothing was imported.'); }
  if (!keysAre(value, ['format', 'version', 'baskets']) ||
      value.format !== BASKET_LIBRARY_FORMAT || value.version !== 1)
    throw new Error('Unsupported backup format or version. Nothing was imported.');
  const entries = validateBasketEntries(value.baskets);
  if (!entries.length) throw new Error('This backup contains no baskets.');
  // Validate every basket before opening a write transaction. Never downgrade a
  // future catalog, method, constraint or Bridge setting to the current player.
  for (const entry of entries) decode(entry.hash);
  return entries;
}

export function mergeBasketEntries(existing, incoming) {
  const next = validateBasketEntries([...validateBasketEntries(existing), ...validateBasketEntries(incoming)]);
  exportBasketBackup(next); // Bound persistent data as well as imported files.
  return next;
}

export function changeBasketEntry(entries, expected, newName = null) {
  const current = validateBasketEntries(entries);
  const [target] = validateBasketEntries([expected]);
  const found = current.find(entry => entry.name === target.name);
  if (!found || found.hash !== target.hash)
    throw new Error('This saved basket changed in another tab. Refresh the library and try again.');
  const rest = current.filter(entry => entry.name !== target.name);
  return newName === null ? rest : mergeBasketEntries(rest, [{ ...target, name: basketName(newName) }]);
}

/** One read/write transaction serializes concurrent tabs and commits atomically.
 * Only oncomplete means saved; request success may still be followed by abort.
 * No localStorage fallback that could silently lose a concurrent writer's data.
 */
export function openBasketLibrary(factory) {
  return new Promise((resolve, reject) => {
    if (!factory?.open) { reject(new Error('Local storage is unavailable. Export your current basket instead.')); return; }
    let request, settled = false;
    const fail = error => {
      if (!settled) { settled = true; reject(error); }
    };
    const timer = setTimeout(() => fail(new Error('Local storage did not open. Close other Playmancer tabs and retry.')), 5000);
    try { request = factory.open(BASKET_DATABASE, 1); }
    catch (error) { clearTimeout(timer); fail(error); return; }
    request.onupgradeneeded = () => {
      if (settled) { request.transaction.abort(); return; }
      request.result.createObjectStore(storeName, { keyPath: 'name' });
    };
    request.onerror = () => { clearTimeout(timer); fail(request.error ?? new Error('Local storage failed to open.')); };
    request.onblocked = () => { clearTimeout(timer); fail(new Error('Local storage is blocked by another tab. Close it and retry.')); };
    request.onsuccess = () => {
      clearTimeout(timer);
      const db = request.result;
      if (settled) { db.close(); return; }
      settled = true;
      db.onversionchange = () => db.close();
      const transact = transform => new Promise((done, failed) => {
        let transaction, result, problem;
        try { transaction = db.transaction(storeName, transform ? 'readwrite' : 'readonly'); }
        catch (error) { failed(error); return; }
        transaction.oncomplete = () => done(result);
        transaction.onabort = () => failed(problem ?? transaction.error ?? new Error('Save failed. No changes were committed.'));
        // Let request errors abort the transaction; never preventDefault them.
        transaction.onerror = () => {};
        const store = transaction.objectStore(storeName);
        // An externally corrupted database must not cause an unbounded read.
        const all = store.getAll(undefined, BASKET_LIBRARY_LIMIT + 1);
        all.onsuccess = () => {
          try {
            result = validateBasketEntries(all.result);
            exportBasketBackup(result);
            if (transform) {
              result = validateBasketEntries(transform(result));
              exportBasketBackup(result);
              store.clear();
              for (const entry of result) store.add(entry);
            }
          } catch (error) { problem = error; transaction.abort(); }
        };
      });
      resolve({ read: () => transact(null),
        add: entries => transact(existing => mergeBasketEntries(existing, entries)),
        rename: (entry, name) => transact(existing => changeBasketEntry(existing, entry, name)),
        remove: entry => transact(existing => changeBasketEntry(existing, entry)),
        close: () => db.close() });
    };
  });
}
