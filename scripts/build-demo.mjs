import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

// Deliberately bounded to these three dependency-free modules, not a general bundler.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.argv[2] ?? join(root, "_site"));
const modules = ["src/ranking.js", "src/demo.js", "src/demo-ui.js"];
const expectedImports = [null, 'import { blendCandidates, rankCandidates } from "./ranking.js";\n',
  'import { BY_ID, CATALOG, CATALOG_VERSION, METHOD_VERSION, decodeState, encodeState, initialState, recommend, validateState } from "./demo.js";\n'];
const parts = [];
for (const [index, path] of modules.entries()) {
  let source = await readFile(join(root, path), "utf8");
  if (expectedImports[index]) {
    if (!source.startsWith(expectedImports[index])) throw new Error(`Unexpected import in ${path}`);
    source = source.slice(expectedImports[index].length);
  }
  source = source.replace(/^export /gm, "");
  if (/^\s*(?:import|export)\s/m.test(source) || /<\/script/i.test(source)) {
    throw new Error(`Unsupported module structure in ${path}`);
  }
  parts.push(`// ${path}\n${source}`);
}
const script = parts.join("\n\n");
const entry = '<script type="module" src="./src/demo-ui.js"></script>';
const template = await readFile(join(root, "index.html"), "utf8");
if (template.split(entry).length !== 2) throw new Error("Expected exactly one demo entry point");
const html = template.replace(entry, `<script type="module">\n${script}\n</script>`);
await mkdir(output, { recursive: true });
await writeFile(join(output, "index.html"), html);
await writeFile(join(output, ".nojekyll"), "");
console.log(`Built ${Buffer.byteLength(html)} bytes into ${output}`);
