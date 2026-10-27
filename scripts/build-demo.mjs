import { readFile, mkdir, writeFile, rename, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { Script } from "node:vm";
import { validateCatalogSnapshot } from "../src/catalog.js";

// Deliberately bounded to seven explicit dependency-free modules, not a general bundler.
const root = fileURLToPath(new URL("../", import.meta.url));
let output = join(root, "_site"), catalogPath = null, hasOutput = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--catalog") {
    if (catalogPath !== null || !args[i + 1] || args[i + 1].startsWith("--")) {
      throw new Error("Expected one --catalog snapshot.json argument");
    }
    catalogPath = resolve(args[++i]);
  } else if (args[i].startsWith("--") || hasOutput) {
    throw new Error("Usage: node scripts/build-demo.mjs [output-directory] [--catalog snapshot.json]");
  } else {
    output = resolve(args[i]);
    hasOutput = true;
  }
}
// Ordinary parsed JSON only. API access is not a redistribution permission;
// the validator checks recorded field approvals, not their legal truth.
let selectedSnapshot = null;
if (catalogPath !== null) {
  if ((await stat(catalogPath)).size > 1048576) throw new Error("Catalog input exceeds the 1 MiB limit");
  const input = JSON.parse(await readFile(catalogPath, "utf8"));
  selectedSnapshot = validateCatalogSnapshot(input, { requirePublishable: true });
  if (selectedSnapshot.games.length > 250) throw new Error("Catalog exceeds the 250-profile engineering bound");
}
const modules = ["src/ranking.js", "src/catalog.js", "src/bridge.js", "src/bridge-preview.js", "src/demo.js", "src/bridge-ui.js", "src/demo-ui.js"];
const expectedImports = [
  null, null, null,
  "import { findBridgeRoute } from './bridge.js';\n",
  'import { blendCandidates, rankCandidates } from "./ranking.js";\nimport { validateCatalogSnapshot } from "./catalog.js";\nimport { BRIDGE_ROUTE_METHOD_VERSION } from "./bridge-preview.js";\n',
  'import { buildBridgePreview, BRIDGE_ROUTE_METHOD_VERSION } from "./bridge-preview.js";\nimport { BY_ID, CATALOG, CATALOG_VERSION, BRIDGE_STATE_VERSION } from "./demo.js";\n',
  'import { BY_ID, CATALOG, CATALOG_VERSION, METHOD_VERSION, DEMO_SNAPSHOT, PLATFORMS, decodeState, encodeState, initialState, recommend, validateState } from "./demo.js";\nimport { bindBridgeControls, renderBridge } from "./bridge-ui.js";\n'
];
const defaultDemo = await import(new URL("../src/demo.js", import.meta.url));
const effectiveSnapshot = selectedSnapshot ?? defaultDemo.DEMO_SNAPSHOT;
const inlineJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,
  character => "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"));
const parts = [];
for (const [index, path] of modules.entries()) {
  let source = await readFile(join(root, path), "utf8");
  if (path === "src/demo.js") {
    const slot = "const BUILD_CATALOG_SNAPSHOT = null;";
    if (source.split(slot).length !== 2) throw new Error("Expected exactly one catalog build slot");
    if (selectedSnapshot !== null) {
      source = source.replace(slot, () => `const BUILD_CATALOG_SNAPSHOT = ${inlineJSON(selectedSnapshot)};`);
      // Selected publication snapshots must not also ship the fictional authoring
      // fixture in a dead JavaScript branch. Keep it in the repository for tests.
      const start = source.indexOf("const profile = (id, name, description, mechanics, themes, platforms, coop) =>");
      const end = source.indexOf("// Both the default and selected snapshot take the same publication-validation", start);
      if (start < 0 || end <= start) throw new Error("Unexpected authored-fixture boundary");
      source = source.slice(0, start) + "const AUTHORED_CATALOG = [];\n" + source.slice(end);
    }
  }
  if (expectedImports[index]) {
    if (source.split(expectedImports[index]).length !== 2) throw new Error(`Unexpected import in ${path}`);
    source = source.replace(expectedImports[index], "");
  }
  source = source.replace(/^export /gm, "");
  // A static bundle does not need source-only whole-line comments.
  // Real JavaScript, inline comments and string literals remain unchanged.
  source = source.replace(/^[ \t]*\/\/[^\r\n]*(?:\r?\n|$)/gm, "");
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
// Build one same-origin static worker asset from the exact same reviewed route
// source modules. There is no duplicated routing algorithm or runtime API.
const workerScript = [parts[2], parts[3], `
self.onmessage = ({ data }) => {
  try {
    self.postMessage({ route: buildBridgePreview(data.input) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "Unknown route error" });
  }
};
`].join("\n\n");
new Script(workerScript, { filename: "playmancer-bridge-worker.js" });
const script = parts.join("\n\n");
// Compile, never execute, the merged browser code before replacing an artifact.
// Individual modules can parse while conflicting declarations break their bundle.
new Script(script, { filename: "playmancer-browser-bundle.js" });
const entry = '<script type="module" src="./src/demo-ui.js"></script>';
const template = await readFile(join(root, "index.html"), "utf8");
if (template.split(entry).length !== 2) throw new Error("Expected exactly one demo entry point");
const revision = process.env.PLAYMANCER_REVISION ?? process.env.GITHUB_SHA ?? "unpublished";
if (revision !== "unpublished" && !/^[0-9a-f]{40}$/.test(revision)) throw new Error("Invalid publication revision");
if (template.split("</head>").length !== 2) throw new Error("Expected exactly one document head");
const escapeAttribute = value => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const html = template.replace(entry, () => `<script type="module">\n${script}\n</script>`)
  .replace("</head>", () => `<meta name="playmancer-revision" content="${revision}">\n<meta name="playmancer-catalog" content="${escapeAttribute(effectiveSnapshot.snapshotId)}">\n</head>`);
await mkdir(output, { recursive: true });
const temporary = join(output, `.index.html.${process.pid}.tmp`);
const temporaryWorker = join(output, `.bridge-worker.js.${process.pid}.tmp`);
try {
  await writeFile(temporary, html);
  await writeFile(temporaryWorker, workerScript);
  await writeFile(join(output, ".nojekyll"), "");
  // Publish the worker first so every newly published index can load its route code.
  await rename(temporaryWorker, join(output, "bridge-worker.js"));
  await rename(temporary, join(output, "index.html"));
} finally {
  await rm(temporary, { force: true });
  await rm(temporaryWorker, { force: true });
}
console.log(`Built ${Buffer.byteLength(html)} HTML bytes and ${Buffer.byteLength(workerScript)} worker bytes into ${output}`);
