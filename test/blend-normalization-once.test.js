import assert from "node:assert/strict";
import test from "node:test";
import { initialState, recommend } from "../src/demo.js";

const picks = (result) => result.ranked.map((item) => ({ id: item.id, scores: item.scores }));

test("Blend lambda=1 preserves exactly the arithmetic baseline scores, not only order", () => {
  const state = { ...initialState(), mode: "arithmetic", platform: "mac", coopOnly: false,
    seeds: [
      { id: "demo:ember", weight: 9 }, { id: "demo:orbit", weight: 1 },
      { id: "demo:signal", weight: 8 }, { id: "demo:meadow", weight: 7 },
      { id: "demo:echo", weight: 8 },
    ], excluded: ["demo:lantern", "demo:silent"], lambda: 1,
  };
  assert.deepEqual(picks(recommend({ ...state, mode: "blend" })), picks(recommend(state)));
});

test("Blend uses the same arithmetic score bytes as the baseline across varied seed baskets", () => {
  const ids = ["ember", "harvest", "tide", "grove", "forge", "meadow", "orbit", "signal", "citadel", "echo"];
  for (let i = 0; i < 200; i++) {
    const count = 2 + i % 4;
    const seeds = Array.from({ length: count }, (_, j) => ({
      id: `demo:${ids[(i + j * 3) % ids.length]}`,
      weight: 1 + (i * 19 + j * 23) % 10,
    }));
    if (new Set(seeds.map((item) => item.id)).size !== count) continue;
    const state = { ...initialState(), seeds, mode: "arithmetic", lambda: 1 };
    const arithmetic = picks(recommend(state));
    const blend = picks(recommend({ ...state, mode: "blend" }));
    assert.deepEqual(blend, arithmetic, `basket ${i}`);
  }
});
