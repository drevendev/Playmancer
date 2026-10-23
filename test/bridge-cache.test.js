import assert from "node:assert/strict";
import test from "node:test";
import { createBridgeRouteCache } from "../src/bridge-ui.js";
import { buildBridgePreview } from "../src/bridge-preview.js";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync(new URL("../examples/bridge.synthetic.json", import.meta.url), "utf8"));

test("identical route inputs reuse one computation without changing results", () => {
  let calls = 0;
  const cached = createBridgeRouteCache((input) => { calls++; return buildBridgePreview(input); });
  const first = cached(fixture);
  assert.deepEqual(first, buildBridgePreview(fixture));
  for (let i = 0; i < 12; i++) assert.strictEqual(cached(structuredClone(fixture)), first);
  assert.equal(calls, 1);
});

test("every route dependency invalidates cached results", () => {
  let calls = 0;
  const cached = createBridgeRouteCache((input) => { calls++; return buildBridgePreview(input); });
  const changes = [
    { startId: "demo:tide" }, { endId: "demo:tide" },
    { platform: "linux" }, { coopOnly: true }, { excluded: ["demo:tide"] },
    { maxHops: 1 }, { minSimilarity: 0.54 }, { snapshotId: "synthetic-bridge-cli-2" },
    { catalog: fixture.catalog.map((g) => g.id === "demo:tide" ? { ...g, themes: ["mystery"] } : g) }
  ];
  for (const change of changes) {
    cached(fixture);
    const before = calls;
    const input = { ...structuredClone(fixture), ...change };
    assert.deepEqual(cached(input), buildBridgePreview(input));
    assert.equal(calls, before + 1);
  }
});

test("cache holds only the last input and never stores exceptions", () => {
  let calls = 0;
  const cached = createBridgeRouteCache((input) => {
    calls++;
    if (!input || input.fail) throw new Error("invalid fixture");
    return { value: input.value };
  });
  assert.throws(() => cached(undefined), /invalid fixture/);
  assert.throws(() => cached(undefined), /invalid fixture/);
  assert.equal(calls, 2);
  const original = cached({ value: 1 });
  assert.throws(() => cached({ fail: true }), /invalid fixture/);
  assert.strictEqual(cached({ value: 1 }), original);
  cached({ value: 2 });
  assert.notStrictEqual(cached({ value: 1 }), original);
  assert.equal(calls, 6);
});
