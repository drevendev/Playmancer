import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { initialState, METHOD_VERSION, encodeState, decodeState } from "../src/demo.js";
import { scoreCandidate, rankCandidates, blendCandidates } from "../src/ranking.js";
import { findBridgeRoute } from "../src/bridge.js";

const root = new URL("../", import.meta.url);
const run = (command, args, env = {}) => spawnSync(command, args, { cwd: root, encoding: "utf8", env: { ...process.env, ...env } });

test("method revision is explicit and older links never silently change ranking", () => {
  assert.equal(METHOD_VERSION, "feature-overlap-2");
  assert.deepEqual(decodeState(encodeState(initialState())), initialState());
  const old = { ...initialState(), method: "feature-overlap-1" };
  assert.throws(() => decodeState("#basket=" + encodeURIComponent(JSON.stringify(old))), /not silently upgraded/);
});

test("standalone scoring, batch ranking and Blend use identical normalized weights", () => {
  const seeds = [{ id: "a", weight: 9 }, { id: "b", weight: 7 }, { id: "c", weight: 8 }];
  const candidate = { id: "x", affinities: { a: 0.71, b: 0.23, c: 0.89 }, evidenceCoverage: 1 };
  const single = scoreCandidate(candidate, seeds);
  const ranked = rankCandidates([candidate], seeds, { mode: "arithmetic" });
  const blend = blendCandidates([candidate], seeds, { lambda: 1 });
  assert.deepEqual(ranked.ranked[0], single);
  assert.deepEqual(ranked.seeds, single.seedWeights);
  assert.deepEqual(blend.ranked[0].scores, single.scores);
  assert.deepEqual(blend.ranked[0].seedWeights, ranked.seeds);
});

test("duplicate candidate identity is rejected before conflicting rankings can escape", () => {
  const x = { id: "x", affinities: { a: 0.6 }, evidenceCoverage: 1 };
  for (const rank of [rankCandidates, blendCandidates]) {
    assert.throws(() => rank([x, { ...x, affinities: { a: 0.9 } }], [{ id: "a" }]), /duplicate candidate id/);
  }
});

test("zero-hop Bridge validates graph edges before returning a route", () => {
  const nodes = ["a", "b"];
  assert.throws(() => findBridgeRoute({ nodes, edges: [{ from: "a", to: "b", similarity: 2 }] }, "a", "a"), RangeError);
  const edge = { from: "a", to: "b", similarity: 0.8 };
  assert.throws(() => findBridgeRoute({ nodes, edges: [edge, edge] }, "a", "a"), /duplicate undirected edge/);
  assert.equal(findBridgeRoute({ nodes, edges: [edge] }, "a", "a").hops, 0);
});

test("static revision is deterministic and invalid input preserves last valid output", () => {
  const out = mkdtempSync(join(tmpdir(), "playmancer-release-"));
  try {
    const env = { PLAYMANCER_REVISION: "a".repeat(40) };
    let result = run(process.execPath, ["scripts/build-demo.mjs", out], env);
    assert.equal(result.status, 0, result.stderr);
    const first = readFileSync(join(out, "index.html"));
    assert.ok(first.includes(`name="playmancer-revision" content="${env.PLAYMANCER_REVISION}"`));
    result = run(process.execPath, ["scripts/build-demo.mjs", out], env);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(join(out, "index.html")), first);
    result = run(process.execPath, ["scripts/build-demo.mjs", out], { PLAYMANCER_REVISION: "bad revision" });
    assert.notEqual(result.status, 0);
    assert.deepEqual(readFileSync(join(out, "index.html")), first);
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("Pages preflight rejects extra files, symlinks and remote assets", () => {
  const out = mkdtempSync(join(tmpdir(), "playmancer-payload-"));
  try {
    assert.equal(run(process.execPath, ["scripts/build-demo.mjs", out]).status, 0);
    assert.equal(run("python3", ["scripts/pages-preflight.py", out]).status, 0);
    writeFileSync(join(out, "extra.txt"), "not public");
    assert.notEqual(run("python3", ["scripts/pages-preflight.py", out]).status, 0);
    rmSync(join(out, "extra.txt"));
    symlinkSync("index.html", join(out, "linked"));
    assert.notEqual(run("python3", ["scripts/pages-preflight.py", out]).status, 0);
    rmSync(join(out, "linked"));
    const html = readFileSync(join(out, "index.html"), "utf8");
    writeFileSync(join(out, "index.html"), html.replace("</head>", '<script src="https://example.invalid/asset.js"></script></head>'));
    assert.notEqual(run("python3", ["scripts/pages-preflight.py", out]).status, 0);
  } finally { rmSync(out, { recursive: true, force: true }); }
});
