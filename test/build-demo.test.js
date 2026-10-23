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
    run(); assert.deepEqual(await readFile(join(out, "index.html")), first);
    assert.deepEqual(await readFile(join(out, "bridge-worker.js")), firstWorker);
    const html = first.toString("utf8");
    assert.match(html, /synthetic-demo-1/);
    assert.doesNotMatch(html, /<script[^>]+src=/i);
    assert.doesNotMatch(html, /^\s*(?:import|export)\s/m);
    assert.ok(first.byteLength < 100_000);
    assert.ok(firstWorker.byteLength > 0 && firstWorker.byteLength < 40_000);
    assert.match(firstWorker.toString("utf8"), /self\.onmessage =/);
    assert.match(html, /new Worker\(new URL\("\.\/bridge-worker\.js"/);
    assert.equal(await readFile(join(out, ".nojekyll"), "utf8"), "");
  } finally { await rm(out, { recursive: true, force: true }); }
});
