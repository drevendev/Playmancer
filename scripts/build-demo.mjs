import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

// Deliberately bounded to seven explicit dependency-free modules, not a general bundler.
const root = fileURLToPath(new URL("../", import.meta.url));
const output = resolve(process.argv[2] ?? join(root, "_site"));
const modules = ["src/ranking.js", "src/catalog.js", "src/bridge.js", "src/bridge-preview.js", "src/demo.js", "src/bridge-ui.js", "src/demo-ui.js"];
const expectedImports = [
  null, null, null,
  "import { findBridgeRoute } from './bridge.js';\n",
  'import { blendCandidates, rankCandidates } from "./ranking.js";\nimport { validateCatalogSnapshot } from "./catalog.js";\nimport { BRIDGE_ROUTE_METHOD_VERSION } from "./bridge-preview.js";\n',
  'import { buildBridgePreview, BRIDGE_ROUTE_METHOD_VERSION } from "./bridge-preview.js";\nimport { BY_ID, CATALOG, CATALOG_VERSION, BRIDGE_STATE_VERSION } from "./demo.js";\n',
  'import { BY_ID, CATALOG, CATALOG_VERSION, METHOD_VERSION, decodeState, encodeState, initialState, recommend, validateState } from "./demo.js";\nimport { bindBridgeControls, renderBridge } from "./bridge-ui.js";\n'
];
await import(new URL("../src/demo.js", import.meta.url));
const parts = [];
for (const [index, path] of modules.entries()) {
  let source = await readFile(join(root, path), "utf8");
  if (expectedImports[index]) {
    if (source.split(expectedImports[index]).length !== 2) throw new Error(`Unexpected import in ${path}`);
    source = source.replace(expectedImports[index], "");
  }
  source = source.replace(/^export /gm, "");
  if (path === "src/bridge.js") {
    for (const name of ["assertCanonicalId", "assertUnitInterval", "comparePath", "compareState"]) {
      source = source.replace(new RegExp("\\b" + name + "\\b", "g"), "bridge" + name[0].toUpperCase() + name.slice(1));
    }
  }
  if (/^\s*(?:import|export)\s/m.test(source) || /<\/script/i.test(source)) {
    throw new Error(`Unsupported module structure in ${path}`);
  }
  parts.push(`// ${path}\n${source}`);
}
const script = parts.join("\n\n");
const entry = '<script type="module" src="./src/demo-ui.js"></script>';
const template = await readFile(join(root, "index.html"), "utf8");
if (template.split(entry).length !== 2) throw new Error("Expected exactly one demo entry point");
const revision = process.env.PLAYMANCER_REVISION ?? process.env.GITHUB_SHA ?? "unpublished";
if (revision !== "unpublished" && !/^[0-9a-f]{40}$/.test(revision)) throw new Error("Invalid publication revision");
if (template.split("</head>").length !== 2) throw new Error("Expected exactly one document head");
const html = template.replace(entry, `<script type="module">\n${script}\n</script>`)
  .replace("</head>", `<meta name="playmancer-revision" content="${revision}">\n</head>`);
await mkdir(output, { recursive: true });
await writeFile(join(output, "index.html"), html);
await writeFile(join(output, ".nojekyll"), "");
console.log(`Built ${Buffer.byteLength(html)} bytes into ${output}`);
