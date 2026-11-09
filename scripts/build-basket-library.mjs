/** Production-only augmentation; synthetic preview and its size budget stay intact. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Script } from 'node:vm';

export const BASKET_LIBRARY_CSS = `
/* Local basket workspace: native controls, no external assets. */
.basket-library input[type=text],.basket-library textarea{width:100%;min-width:0}
.basket-library textarea{font:inherit;line-height:1.5;resize:vertical;border:1px solid var(--line);border-radius:10px;background:#202c40;color:var(--ink);padding:10px}
.basket-library input[type=file]{display:block;width:100%;max-width:100%;font-size:.8125rem}
.basket-library summary{overflow-wrap:anywhere}
.basket-library>summary{color:var(--accent)}
.basket-library label{margin-top:12px}
#library-list{list-style:none;padding:0;margin:16px 0;display:grid;gap:12px}
.library-card{min-width:0;border:1px solid var(--line);border-radius:12px;padding:12px;overflow-wrap:anywhere}
.library-card .actions{margin-top:8px}
#library-status{min-height:3em;overflow-wrap:anywhere}
`;

export async function addBasketLibrary(root, html) {
  const paths = ['src/basket-library.js', 'src/basket-library-ui.js'];
  const sources = await Promise.all(paths.map(path => readFile(join(root, path), 'utf8')));
  const expected = "import { BASKET_BACKUP_BYTES, basketName, exportBasketBackup, importBasketBackup, openBasketLibrary } from './basket-library.js';";
  if (sources[1].split(expected).length !== 2) throw new Error('Unexpected basket library imports');
  sources[1] = sources[1].replace(expected, '');
  const source = sources.map(text => text.replace(/^export /gm, '')).join('\n');
  if (/^\s*(?:import|export)\s/m.test(source) || /<\/script/i.test(source))
    throw new Error('Unsupported basket library module structure');
  const marker = '// playmancer-basket-library:1';
  const entry = '<script type="module">';
  if (html.includes(marker) || html.split(entry).length !== 2)
    throw new Error('Expected one unaugmented production module');
  const start = html.indexOf(entry) + entry.length;
  const end = html.indexOf('</script>', start);
  if (end < start || !html.includes('id="basket-title"') || !html.includes('id="share-status"'))
    throw new Error('Unexpected production player structure');
  const addition = `\n${marker}\n(() => {\n${source}\nmountBasketLibrary({
    host: document.querySelector('aside[aria-labelledby="basket-title"]'),
    getState: () => {
      if (!document.getElementById('error').hidden) throw new Error('Recover the invalid basket link first.');
      return validateState(state);
    },
    encode: encodeState, decode: decodeState,
    nameOf: id => BY_ID.get(id)?.name ?? id,
    restore: next => {
      state = validateState(next);
      document.getElementById('search').value = '';
      commit(true);
      document.getElementById('basket-title').focus();
      announceBasketAction('Saved basket restored');
    }
  });\n})();\n`;
  new Script(html.slice(start, end) + addition, { filename: 'playmancer-with-basket-library.js' });
  return html.slice(0, end) + addition + html.slice(end);
}
