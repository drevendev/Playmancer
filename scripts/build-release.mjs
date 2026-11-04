/** Production package: keep the genre ranker intact; add a separate fact explorer. */
import { readFile, writeFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { buildObservationPage, linkObservationExplorer } from './build-observations.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.argv.length > 3 || process.argv[2]?.startsWith('--')) throw new Error('Usage: node scripts/build-release.mjs [output-directory]');
const output = resolve(process.argv[2] ?? join(root, '_site'));
const catalogPath = join(root, 'examples/catalog.multistore-30.real.json');
const bytes = await readFile(catalogPath);
const revision = process.env.PLAYMANCER_REVISION ?? process.env.GITHUB_SHA ?? 'unpublished';
// All source/bundle validation happens before touching a previous release.
const explorer = await buildObservationPage(root, JSON.parse(bytes), bytes, revision);
if (explorer === null) throw new Error('Production catalog has no approved observation binding');
const stage = await mkdtemp(join(tmpdir(), 'playmancer-release-'));
const pending = [];
try {
  execFileSync(process.execPath, [join(root, 'scripts/build-demo.mjs'), stage, '--catalog', catalogPath], { stdio: 'inherit' });
  const index = linkObservationExplorer(await readFile(join(stage, 'index.html'), 'utf8'));
  await writeFile(join(stage, 'index.html'), index);
  await writeFile(join(stage, 'observations.html'), explorer);
  await mkdir(output, { recursive: true });
  // Write every pending file first; replace the entry document last.
  const files = ['player.css', 'bridge-worker.js', 'observations.html', '.nojekyll', 'index.html'];
  for (const name of files) {
    const temporary = join(output, `.${name}.${process.pid}.tmp`); pending.push(temporary);
    await writeFile(temporary, await readFile(join(stage, name)));
  }
  for (let i = 0; i < files.length; i++) await rename(pending[i], join(output, files[i]));
  console.log(`Production release includes ${Buffer.byteLength(explorer)} bytes of independently versioned observation UI`);
} finally {
  for (const path of pending) await rm(path, { force: true });
  await rm(stage, { recursive: true, force: true });
}
