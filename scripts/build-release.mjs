/** Production package: keep the genre ranker intact; add independent player tools. */
import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { buildObservationPage, linkObservationExplorer, readReleaseObservations } from './build-observations.mjs';
import { addBasketLibrary, BASKET_LIBRARY_CSS } from './build-basket-library.mjs';
import { appendToSealedStylesheet } from './stylesheet-integrity.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const candidates = new Map([['--candidate-30', 30], ['--candidate-31', 31], ['--candidate-35', 35], ['--candidate-51', 51], ['--candidate-54', 54], ['--candidate-58', 58], ['--candidate-62', 62], ['--candidate-66', 66], ['--candidate-70', 70]]);
if (args.length > 2 || (args.length === 2 && !candidates.has(args[1])) || args[0]?.startsWith('-'))
  throw new Error('Usage: node scripts/build-release.mjs [output-directory [--candidate-30|--candidate-31|--candidate-35|--candidate-51|--candidate-54|--candidate-58|--candidate-62|--candidate-66|--candidate-70]]');
const output = resolve(args[0] ?? join(root, '_site'));
const catalogPath = join(root, `examples/catalog.multistore-${candidates.get(args[1]) ?? 66}.real.json`);
const bytes = await readFile(catalogPath);
const revision = process.env.PLAYMANCER_REVISION ?? process.env.GITHUB_SHA ?? 'unpublished';
// All source/bundle validation happens before touching a previous release.
const catalog = JSON.parse(bytes);
const explorer = await buildObservationPage(root, catalog, bytes, revision);
if (explorer === null) throw new Error('Production catalog has no approved observation binding');
const inlineFacts = await readReleaseObservations(root, catalog, bytes);
if (inlineFacts === null) throw new Error('Production catalog has no approved inline observation binding');
const stage = await mkdtemp(join(tmpdir(), 'playmancer-release-'));
const pending = [];
try {
  execFileSync(process.execPath, [join(root, 'scripts/build-demo.mjs'), stage, '--catalog', catalogPath], { stdio: 'inherit' });
  const index = await addBasketLibrary(root, linkObservationExplorer(await readFile(join(stage, 'index.html'), 'utf8'), inlineFacts));
  await writeFile(join(stage, 'index.html'), index);
  // Release-only basket styles must be covered by the same terminal digest.
  await writeFile(join(stage, 'player.css'),
    appendToSealedStylesheet(await readFile(join(stage, 'player.css'), 'utf8'), BASKET_LIBRARY_CSS));
  await writeFile(join(stage, 'observations.html'), explorer);
  await mkdir(output, { recursive: true });
  // Write every pending file first; replace the entry document last.
  const files = ['player.css', 'bridge-worker.js', 'observations.html', '.nojekyll', 'index.html'];
  for (const name of files) {
    const temporary = join(output, `.${name}.${process.pid}.tmp`); pending.push(temporary);
    await writeFile(temporary, await readFile(join(stage, name)));
  }
  for (let i = 0; i < files.length; i++) await rename(pending[i], join(output, files[i]));
  console.log(`Production release includes ${Buffer.byteLength(explorer)} bytes of independently versioned observation UI and a local basket library`);
} finally {
  for (const path of pending) await rm(path, { force: true });
  await rm(stage, { recursive: true, force: true });
}
