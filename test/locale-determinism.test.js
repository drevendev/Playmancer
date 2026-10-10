import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { normalizeSeeds, rankCandidates, blendCandidates } from "../src/ranking.js";

// Canonical IDs are identifiers, not human-language labels. A shared basket
// must rank equal-score candidates identically regardless of the viewer's locale.
const seeds = [{ id: "seed:z", weight: 1 }, { id: "seed:ä", weight: 1 }];
const pairs = (status = "pass") => ["game:ä", "game:z"].map((id) => ({
  id,
  hardConstraintState: status,
  evidenceCoverage: 1,
  affinities: { "seed:z": 0.5, "seed:ä": 0.5 },
}));
const ids = (list) => list.map((item) => item.id);
const CANONICAL = ["game:z", "game:ä"];

test("seed normalization is a locale-independent canonical-ID ordering", () => {
  assert.deepEqual(ids(normalizeSeeds(seeds)), ["seed:z", "seed:ä"]);
  assert.deepEqual(ids(normalizeSeeds([...seeds].reverse())), ["seed:z", "seed:ä"]);
});

test("scalar modes break exact-score ties by code units, not browser language", () => {
  for (const mode of ["union", "arithmetic", "leastMisery", "intersection"]) {
    assert.deepEqual(ids(rankCandidates(pairs(), seeds, { mode }).ranked), CANONICAL, mode);
    assert.deepEqual(ids(rankCandidates(pairs().reverse(), seeds, { mode }).ranked), CANONICAL, mode);
  }
});

test("unknown and failed hard constraints retain stable partition ordering", () => {
  assert.deepEqual(ids(rankCandidates(pairs("unknown"), seeds).uncertain), CANONICAL);
  assert.deepEqual(ids(rankCandidates(pairs("fail"), seeds).excluded), CANONICAL);
});

test("Blend list-level equal-objective ties are stable at both lambda endpoints", () => {
  for (const lambda of [0, 0.3, 1]) {
    assert.deepEqual(ids(blendCandidates(pairs(), seeds, { lambda }).ranked), CANONICAL, `lambda=${lambda}`);
    assert.deepEqual(ids(blendCandidates(pairs().reverse(), seeds, { lambda }).ranked), CANONICAL, `lambda=${lambda}`);
  }
});

test("separate Node locales reproduce precisely the same ranking", () => {
  const source = `import {rankCandidates} from './src/ranking.js';
const seeds=[{id:'seed:a',weight:1}];
const candidates=['game:ä','game:z'].map(id=>({id,evidenceCoverage:1,affinities:{'seed:a':0.5}}));
console.log(JSON.stringify({locale:Intl.DateTimeFormat().resolvedOptions().locale,ids:rankCandidates(candidates,seeds).ranked.map(x=>x.id)}));`;
  const cwd = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const snapshots = [];
  for (const lang of ["en_US.UTF-8", "sv_SE.UTF-8", "de_DE.UTF-8"]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", source], {
      cwd, env: { ...process.env, LANG: lang, LC_ALL: lang }, encoding: "utf8",
    });
    assert.equal(result.status, 0, `${lang}: ${result.stderr}`);
    const snapshot = JSON.parse(result.stdout.trim());
    snapshots.push({ requested: lang, ...snapshot });
    assert.deepEqual(snapshot.ids, CANONICAL, `locale ${snapshot.locale}`);
  }
  assert.deepEqual(snapshots.map(({ ids }) => ids), [CANONICAL, CANONICAL, CANONICAL]);
});
