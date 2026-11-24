import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("static build is self-contained and byte-identical on repeat", async () => {
  const out = await mkdtemp(join(tmpdir(), "playmancer-build-"));
  try {
    const script = fileURLToPath(new URL("../scripts/build-demo.mjs", import.meta.url));
    const run = () => execFileSync(process.execPath, [script, out]);
    run(); const first = await readFile(join(out, "index.html"));
    const firstWorker = await readFile(join(out, "bridge-worker.js"));
    const firstCss = await readFile(join(out, "player.css"));
    run(); assert.deepEqual(await readFile(join(out, "index.html")), first);
    assert.deepEqual(await readFile(join(out, "player.css")), firstCss);
    assert.deepEqual(await readFile(join(out, "bridge-worker.js")), firstWorker);
    const html = first.toString("utf8");
    assert.match(html, /synthetic-demo-1/);
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /^\s*(?:import|export)\s/m);
    assert.ok(first.byteLength < 100_000);
    assert.ok(first.byteLength < 95_000, `external CSS must restore meaningful HTML headroom (actual ${first.byteLength} bytes)`);
    assert.doesNotMatch(html, /No recorded genre overlap with any favorite|Unrecorded mechanics and other facts remain unknown/,
      "fictional preview must not ship real-only evidence-gap labels");
    assert.ok(html.includes('<link rel="stylesheet" href="./player.css">'));
    assert.doesNotMatch(html, /<style>/);
    assert.doesNotMatch(html, /recordedStoreUrlGame|selectedStoreUrl|filteredStoreUrl|unknownStoreUrl/,
      "fictional bundle must omit unreachable recorded-storefront recovery code");
    assert.match(html, /function renderStoreLinks\(\) \{ return null; \}/,
      "fictional bundle omits the real-catalog store-link renderer");
    assert.doesNotMatch(html, /selectedNameMatches|Already in basket:/,
      "fictional bundle must omit real-catalog-only selected-game recovery");
    assert.doesNotMatch(html, /combinedTermFallback|All search words appear in recorded name/,
      "fictional bundle must omit real-catalog-only partial-fact AND search");
    assert.doesNotMatch(html, /search-recovery|search-all-stores|const candidates = query \|\| browseAll/,
      "fictional bundle must not ship real-only filter recovery controls or state");
    // Execute the shared pagination statements from the emitted fictional bundle.
    // The real-only storefront stripping must not erase these initializers.
    const pagination = html.match(/matchCount = matches\.length;[\s\S]*?const shown = matches\.slice\(start, start \+ PAGE_SIZE\);/);
    assert.ok(pagination, "emitted search keeps pagination initialization");
    const paginate = new Function("matches", "pageNo", "PAGE_SIZE",
      "let matchCount;" + pagination[0] + "return { matchCount, lastPage, pageNo, shown };");
    assert.deepEqual(paginate([], 12, 8), { matchCount: 0, lastPage: 0, pageNo: 0, shown: [] });
    const games = Array.from({ length: 9 }, (_, i) => i);
    assert.deepEqual(paginate(games, 0, 8).shown, games.slice(0, 8));
    assert.deepEqual(paginate(games, 10, 8), { matchCount: 9, lastPage: 1, pageNo: 1, shown: [8] });
    assert.deepEqual(paginate(Array.from({ length: 248 }, (_, i) => i), 30, 8).shown,
      [240, 241, 242, 243, 244, 245, 246, 247]);
    assert.ok(firstCss.byteLength > 0 && firstCss.byteLength < 20_000);
    assert.match(html, /id="results-view"/);
    // The fictional bundle must keep basket comparisons inert and must not
    // leak or invoke the real-only, version-bound observation deep-link code.
    assert.match(html, /function renderFavoriteFactComparisons\(\)/);
    assert.doesNotMatch(html, /function pinnedFactsLink/);
    assert.doesNotMatch(html, /function catalogReceiptBase/);
    assert.match(html, /function renderCatalogReceipts\(\) \{ return null; \}/);
    assert.match(html, /function renderBasketEvidence\(\) \{ return null; \}/);
    assert.doesNotMatch(html, /Compare recorded facts between favorites/);
    assert.doesNotMatch(html, /\/\* Compact mobile cards retain match evidence\. \*\//);
    assert.ok(firstWorker.byteLength > 0 && firstWorker.byteLength < 40_000);
    assert.match(firstWorker.toString("utf8"), /self\.onmessage =/);
    const expectedRevision = process.env.PLAYMANCER_REVISION ?? process.env.GITHUB_SHA ?? "unpublished";
    assert.ok(firstWorker.toString("utf8").startsWith(`// playmancer-revision:${expectedRevision}\n`));
    assert.match(html, /new Worker\(new URL\("\.\/bridge-worker\.js"/);
    assert.equal(await readFile(join(out, ".nojekyll"), "utf8"), "");
  } finally { await rm(out, { recursive: true, force: true }); }
});
