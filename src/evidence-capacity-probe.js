// Deterministic fictional capacity workload for the offline v2 scorer.
// No published/game/store data, claims of relevance, or browser timing.
import { performance } from "node:perf_hooks";
import { prepareEvidenceModel, rankEvidenceBasket, EVIDENCE_METHOD_VERSION } from "./evidence-similarity.js";

const SOURCE = "playmancer:fictional-capacity-fixture";
const MODES = ["intersection", "blend"];
function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new RangeError(`${label} must be an integer in [${min}, ${max}]`);
  return value;
}
function gameId(index) { return `bench:game-${String(index).padStart(3, "0")}`; }

export function makeEvidenceCapacityFixture({
  gameCount = 250, tagsPerGame = 128, edgeCount = 4096,
} = {}) {
  integer(gameCount, 5, 250, "gameCount");
  integer(tagsPerGame, 1, 128, "tagsPerGame");
  integer(edgeCount, 0, Math.min(4096, gameCount * (gameCount - 1) / 2), "edgeCount");
  const games = Array.from({ length: gameCount }, (_, index) => ({
    id: gameId(index),
    // Artificial, complete vectors let us measure scoring at maximum capacity;
    // unlike the real partial-fact catalog they are NOT evidence of readiness.
    tags: Array.from({ length: tagsPerGame }, (_, offset) => ({
      id: `mechanic:fictional-${String((index * 17 + offset) % 256).padStart(3, "0")}`,
      weight: 1 / tagsPerGame, source: SOURCE,
    })),
    metadata: {
      developer: { value: `Fictional Studio ${index % 19}`, source: SOURCE },
      releaseYear: { value: 2000 + index % 24, source: SOURCE },
      ...(index % 17 === 0 ? {} : {
        platforms: { value: index % 4 === 3 ? ["linux"] : ["windows", "linux"], source: SOURCE },
      }),
    },
    coop: index % 19 === 0 ? null : index % 3 !== 0,
    ...(index % 19 === 0 ? {} : { coopSource: SOURCE }),
  }));
  // Unique unordered pairs, evenly distributed across increasing index gaps.
  const relations = [];
  for (let gap = 1; gap < gameCount && relations.length < edgeCount; gap++) {
    for (let index = 0; index + gap < gameCount && relations.length < edgeCount; index++) {
      const n = relations.length;
      relations.push({
        from: gameId(index), to: gameId(index + gap),
        type: ["similar", "references", "inspired-by"][n % 3],
        strength: [0.25, 0.45, 0.65, 0.85][n % 4], source: SOURCE,
      });
    }
  }
  return { games, relations };
}

function scenario(games) {
  const last = games.length - 1;
  const seeds = [0, 1, 2, 3, 4].map(index => ({
    id: games[Math.floor(index * last / 4)].id, weight: index + 1,
  }));
  const seedSet = new Set(seeds.map(seed => seed.id));
  const excluded = games.map(game => game.id).find(id => !seedSet.has(id));
  return { seeds, platform: "windows", coopOnly: true,
    excluded: excluded ? [excluded] : [], limit: 5, lambda: 0.3 };
}

function percentile(sorted, percent) {
  return sorted[Math.max(0, Math.ceil(percent * sorted.length) - 1)];
}
// The entire JSON-serializable scoring result is the reproducibility contract:
// ordered partitions, per-seed affinities, coverage, sourced explanations and
// hard-filter receipts. Never silently reduce this to ordered IDs.
export function evidenceCapacitySignature(result) {
  return JSON.stringify(result);
}

// Times ONLY Node scoring, not fixture construction, model preparation,
// JSON serialization, browser UI, loading, hydration, or network requests.
export function benchmarkEvidenceCapacity({
  gameCount = 250, tagsPerGame = 128, edgeCount = 4096,
  warmups = 3, samples = 24,
} = {}) {
  integer(warmups, 0, 100, "warmups");
  integer(samples, 1, 1000, "samples");
  const fixture = makeEvidenceCapacityFixture({ gameCount, tagsPerGame, edgeCount });
  const model = prepareEvidenceModel(fixture);
  const input = scenario(fixture.games);
  const reports = {};
  for (const mode of MODES) {
    const run = () => rankEvidenceBasket(model, { ...input, mode });
    const expected = evidenceCapacitySignature(run());
    for (let n = 0; n < warmups; n++) {
      if (evidenceCapacitySignature(run()) !== expected) throw new Error(`unstable ${mode} warmup`);
    }
    const ms = [];
    for (let n = 0; n < samples; n++) {
      const start = performance.now();
      const result = run();
      ms.push(performance.now() - start);
      if (evidenceCapacitySignature(result) !== expected) throw new Error(`unstable ${mode} ranking`);
    }
    ms.sort((a, b) => a - b);
    const observed = run();
    reports[mode] = {
      p50_node_ms: percentile(ms, 0.5),
      p95_node_ms: percentile(ms, 0.95),
      max_node_ms: ms[ms.length - 1],
      ranked_ids: observed.ranked.map(row => row.id),
      rankable_returned: observed.ranked.length,
      unknown_count: observed.uncertain.length,
      excluded_count: observed.excluded.length,
    };
  }
  return {
    protocol: "p76-fictional-v2-capacity-node-1",
    method: EVIDENCE_METHOD_VERSION,
    runtime: `node ${process.version}`,
    scope: "Node scorer only; NOT browser p95, player relevance, or real catalog",
    game_count: gameCount, tags_per_game: tagsPerGame, relation_count: edgeCount,
    basket_seed_count: input.seeds.length,
    filters: { platform: input.platform, coopOnly: input.coopOnly, excluded: input.excluded },
    top_k: input.limit, warmups, samples, modes: reports,
  };
}
