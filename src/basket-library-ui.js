import { BASKET_BACKUP_BYTES, basketName, exportBasketBackup, importBasketBackup, openBasketLibrary } from './basket-library.js';

/** Mount inside the production player, without changing ranking or share rules. */
export function mountBasketLibrary({ host, getState, encode, decode, restore, nameOf }) {
  const make = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = (text, id) => {
    const node = make('button', text); node.type = 'button'; if (id) node.id = id; return node;
  };
  const panel = make('details', undefined, 'basket-library section'); panel.id = 'basket-library';
  const heading = make('summary', 'Saved baskets · on this device'); heading.id = 'library-heading'; panel.append(heading);
  const privacy = make('p', 'Save only when you choose. These baskets stay in this browser profile, not in an account. Anyone using this profile can read them. Clearing site data or browser eviction can remove them; export a backup.', 'hint');
  const nameLabel = make('label', 'Basket name'); nameLabel.htmlFor = 'library-name';
  const name = make('input'); name.id = 'library-name'; name.type = 'text'; name.maxLength = 128;
  name.placeholder = 'For a rainy weekend'; name.autocomplete = 'off';
  const save = button('Save current basket', 'library-save');
  const refresh = button('Refresh saved baskets', 'library-refresh');
  const status = make('p', 'Opening local library…', 'hint'); status.id = 'library-status';
  status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
  const list = make('ul'); list.id = 'library-list'; list.setAttribute('aria-label', 'Saved baskets');
  const actions = make('div', undefined, 'actions'); actions.append(save, refresh);
  const currentExport = button('Export current basket', 'library-export-current');
  const libraryExport = button('Export saved library', 'library-export-all');
  const transfer = make('details', undefined, 'section'); transfer.id = 'library-transfer';
  transfer.append(make('summary', 'Backup or import JSON'));
  const transferActions = make('div', undefined, 'actions'); transferActions.append(currentExport, libraryExport);
  const jsonLabel = make('label', 'Basket backup JSON'); jsonLabel.htmlFor = 'library-json';
  const json = make('textarea'); json.id = 'library-json'; json.rows = 6; json.maxLength = BASKET_BACKUP_BYTES;
  json.spellcheck = false; json.setAttribute('aria-describedby', 'library-import-note');
  const note = make('p', 'Import adds up to 20 named baskets, never replaces existing saves or your current basket. Duplicate names and incompatible catalog/method versions are rejected together.', 'hint'); note.id = 'library-import-note';
  const fileLabel = make('label', 'Or choose a JSON backup file'); fileLabel.htmlFor = 'library-file';
  const file = make('input'); file.id = 'library-file'; file.type = 'file'; file.accept = '.json,application/json';
  const importButton = button('Import all baskets', 'library-import');
  const download = button('Download JSON', 'library-download');
  const importActions = make('div', undefined, 'actions'); importActions.append(importButton, download);
  transfer.append(transferActions, jsonLabel, json, note, fileLabel, file, importActions);
  panel.append(privacy, nameLabel, name, actions, status, list, transfer); host.append(panel);
  let store = null, busy = false, rows = [], generation = 0;
  const controls = [save, refresh, currentExport, libraryExport, importButton, download, file];
  const say = message => { status.textContent = message; };
  const updateControls = () => {
    for (const control of controls) control.disabled = busy;
    for (const control of [save, importButton, libraryExport]) control.disabled = busy || !store;
    panel.setAttribute('aria-busy', String(busy));
  };
  const run = async action => {
    if (busy) return;
    busy = true; updateControls();
    for (const control of list.querySelectorAll('button')) control.disabled = true;
    try { await action(); }
    catch (error) { say(`${error.message || 'Operation failed.'} Your current basket and existing saves were not replaced.`); }
    finally { busy = false; updateControls(); draw(); }
  };
  const currentEntry = () => ({ name: basketName(name.value || 'Current basket'), hash: encode(getState()) });
  const exportText = entries => {
    json.value = exportBasketBackup(entries); transfer.open = true;
    say('Backup ready below. Download it or copy the JSON; nothing was uploaded.');
    json.focus(); json.select();
  };
  const draw = () => {
    list.replaceChildren();
    if (!rows.length) { list.append(make('li', store ? 'No saved baskets yet.' : 'Saved library unavailable. Export still works.')); return; }
    for (const entry of rows) {
      const row = make('li', undefined, 'library-card'); row.dataset.basketName = entry.name;
      row.append(make('strong', entry.name));
      let decoded = null;
      try { decoded = decode(entry.hash); }
      catch (error) { row.append(make('p', `Unavailable in this player: ${error.message} Kept unchanged; export or delete it.`, 'hint')); }
      if (decoded) {
        const games = decoded.seeds.map(seed => `${nameOf(seed.id)} ×${seed.weight}`).join(' · ') || 'Empty basket';
        row.append(make('p', `${games}. ${decoded.mode}; ${decoded.platform}; co-op ${decoded.coopOnly ? 'required' : 'optional'}. Hidden games: ${decoded.excluded.length}.`, 'hint'));
      }
      const rowActions = make('div', undefined, 'actions');
      const load = button('Restore'); load.disabled = !decoded || busy;
      load.setAttribute('aria-label', `Restore saved basket ${entry.name}`);
      load.onclick = () => {
        try {
          const next = decode(entry.hash);
          if (!window.confirm(`Replace the current basket with “${entry.name}”?`)) return;
          restore(next); say(`Restored “${entry.name}” with its exact saved settings.`);
        } catch (error) { say(`Not restored: ${error.message}`); }
      };
      const rename = button('Rename'); rename.disabled = busy;
      rename.setAttribute('aria-label', `Rename saved basket ${entry.name}`);
      rename.onclick = () => {
        const replacement = window.prompt('New basket name (up to 64 characters)', entry.name);
        if (replacement === null) return;
        void run(async () => { rows = await store.rename(entry, replacement); say('Basket renamed.'); heading.focus(); });
      };
      const remove = button('Delete'); remove.disabled = busy;
      remove.setAttribute('aria-label', `Delete saved basket ${entry.name}`);
      remove.onclick = () => {
        if (!window.confirm(`Delete saved basket “${entry.name}” from this browser? The current basket will not change.`)) return;
        void run(async () => { rows = await store.remove(entry); say('Saved basket deleted.'); heading.focus(); });
      };
      rowActions.append(load, rename, remove); row.append(rowActions); list.append(row);
    }
  };
  const connect = async () => {
    store?.close(); store = null;
    let candidate;
    try {
      candidate = await openBasketLibrary(window.indexedDB);
      rows = await candidate.read(); store = candidate;
      say(`${rows.length} of 20 saved baskets. Saves are local to this browser.`);
    } catch (error) {
      candidate?.close(); rows = [];
      throw new Error(`Local library unavailable: ${error.message} Export the current basket instead. No stored records were erased.`);
    }
  };
  refresh.onclick = () => void run(connect);
  save.onclick = () => void run(async () => {
    const entry = currentEntry();
    // Empty names must be deliberate for export only; a save needs a user name.
    entry.name = basketName(name.value);
    rows = await store.add([entry]); say(`Saved “${entry.name}” on this device.`); name.focus();
  });
  currentExport.onclick = () => void run(async () => exportText([currentEntry()]));
  libraryExport.onclick = () => void run(async () => { rows = await store.read(); exportText(rows); });
  importButton.onclick = () => void run(async () => {
    const imported = importBasketBackup(json.value, decode);
    rows = await store.add(imported); say(`Imported ${imported.length} basket(s). Current basket unchanged.`); heading.focus();
  });
  // Capture the generation before reading; a second file/paste must not be
  // overwritten by a slower previous File.text() completion.
  json.addEventListener('input', () => { generation++; });
  file.onchange = async () => {
    const selected = file.files?.[0], ticket = ++generation;
    if (!selected) return;
    if (selected.size > BASKET_BACKUP_BYTES) { say('File exceeds 1 MiB. Nothing was imported.'); file.value = ''; return; }
    try {
      const text = await selected.text();
      if (ticket !== generation) return;
      importBasketBackup(text, decode); json.value = text; say('File checked. Choose Import all baskets to save it.');
    } catch (error) { if (ticket === generation) say(`File rejected: ${error.message}`); }
    finally { if (ticket === generation) file.value = ''; }
  };
  download.onclick = () => void run(async () => {
    // Export may contain intentionally preserved incompatible saved versions.
    // Only download our strict envelope; never execute or navigate imported data.
    let parsed;
    try { parsed = JSON.parse(json.value); } catch { throw new Error('Export a basket before downloading JSON.'); }
    if (parsed.format !== 'playmancer-baskets' || parsed.version !== 1 || Object.keys(parsed).length !== 3)
      throw new Error('Export a valid backup before downloading.');
    const text = exportBasketBackup(parsed.baskets);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = make('a'); anchor.href = url; anchor.download = 'playmancer-baskets.json';
    document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    say('JSON download requested. Keep a copy outside this browser.');
  });
  const shortcut = button('Saved baskets', 'intro-library');
  shortcut.onclick = () => { panel.open = true; heading.scrollIntoView(); heading.focus({ preventScroll: true }); };
  document.querySelector('.intro-actions')?.append(shortcut);
  window.addEventListener('pagehide', () => store?.close());
  // Explicit refresh reopens a closed/bfcache connection; no automatic writes.
  void run(connect);
}
