import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { addBasketLibrary, BASKET_LIBRARY_CSS } from '../scripts/build-basket-library.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const html = '<aside aria-labelledby="basket-title"><h2 id="basket-title"></h2><p id="share-status"></p></aside><script type="module">const untouched = 1;</script>';
test('production augmentation is deterministic, inline and collision-isolated', async () => {
  const result = await addBasketLibrary(root, html);
  assert.equal(result, await addBasketLibrary(root, html));
  assert.equal(result.split('<script type="module">').length, 2);
  assert.match(result, /const untouched = 1;/);
  assert.match(result, /playmancer-basket-library:1/);
  assert.match(result, /encode: encodeState, decode: decodeState/);
  assert.match(result, /validateState\(next\)/);
  assert.doesNotMatch(result, /^\s*(import|export) /m);
  assert.doesNotMatch(BASKET_LIBRARY_CSS, /@import|url\s*\(/);
});
test('double injection and unexpected document/module structure fail closed', async () => {
  await assert.rejects(addBasketLibrary(root, await addBasketLibrary(root, html)), /unaugmented/);
  for (const bad of [html + '<script type="module"></script>', html.replace('id="basket-title"', ''),
    html.replace('</script>', ''), html.replace('const untouched = 1;', 'const = broken;')])
    await assert.rejects(addBasketLibrary(root, bad));
});
