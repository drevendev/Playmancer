import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { CATALOG, CATALOG_VERSION } from "../src/demo.js";
import { buildBridgePreview } from "../src/bridge-preview.js";

test("built off-thread route uses the exact canonical algorithm and error contract", () => {
  const output = mkdtempSync(join(tmpdir(), "playmancer-worker-"));
  try {
    execFileSync(process.execPath, ["scripts/build-demo.mjs", output], { stdio: "pipe" });
    const html = readFileSync(join(output, "index.html"), "utf8");
    const marker = "const BRIDGE_WORKER_SOURCE = ";
    const start = html.indexOf(marker);
    assert.ok(start >= 0, "build must embed canonical route source");
    const tail = html.slice(start + marker.length);
    const end = tail.indexOf(";\n");
    assert.ok(end > 0);
    const script = JSON.parse(tail.slice(0, end));
    const messages = [];
    const self = { postMessage: (message) => messages.push(message) };
    runInNewContext(script, { self }, { filename: "built-bridge-worker.js" });
    assert.equal(typeof self.onmessage, "function");

    const base = {
      catalog: CATALOG, snapshotId: CATALOG_VERSION,
      startId: "demo:ember", endId: "demo:harvest",
      platform: "any", coopOnly: false, excluded: [],
      maxHops: 3, minSimilarity: 0.05
    };
    for (const input of [base,
      { ...base, minSimilarity: 0.54 },
      { ...base, excluded: ["demo:grove"] },
      { ...base, platform: "linux", coopOnly: true }]) {
      messages.length = 0;
      self.onmessage({ data: { input } });
      assert.equal(messages.length, 1);
      assert.deepEqual(JSON.parse(JSON.stringify(messages[0].route)),
        JSON.parse(JSON.stringify(buildBridgePreview(input))));
      assert.equal(messages[0].error, undefined);
    }
    messages.length = 0;
    self.onmessage({ data: { input: { ...base, startId: "invalid" } } });
    assert.equal(messages.length, 1);
    assert.match(messages[0].error, /canonical game ID/);
    assert.equal(messages[0].route, undefined);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
