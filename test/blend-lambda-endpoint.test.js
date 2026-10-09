import assert from "node:assert/strict";
import test from "node:test";
import { initialState, recommend } from "../src/demo.js";

const ids = (result) => result.ranked.map((item) => item.id);

test("lambda=1 Blend matches arithmetic ordering including exact-score ties", () => {
  const state = {
    ...initialState(),
    platform: "windows",
    coopOnly: false,
    seeds: [
      { id: "demo:ember", weight: 10 },
      { id: "demo:harvest", weight: 1 },
      { id: "demo:tide", weight: 3 },
      { id: "demo:forge", weight: 4 },
      { id: "demo:orbit", weight: 5 },
    ],
  };
  const baseline = ids(recommend({ ...state, mode: "arithmetic" }));
  const pureRelevance = ids(recommend({ ...state, mode: "blend", lambda: 1 }));
  assert.deepEqual(baseline, ["demo:citadel", "demo:grove", "demo:meadow", "demo:signal"]);
  assert.deepEqual(pureRelevance, baseline);
});

test("lambda=0 retains list-level coverage diversification beyond the first pick", () => {
  const state = {
    ...initialState(),
    seeds: [{ id: "demo:ember", weight: 10 }, { id: "demo:harvest", weight: 1 }],
  };
  const baseline = ids(recommend({ ...state, mode: "arithmetic" }));
  const diversified = ids(recommend({ ...state, mode: "blend", lambda: 0 }));
  assert.equal(diversified[0], baseline[0]);
  assert.notDeepEqual(diversified.slice(0, 3), baseline.slice(0, 3));
});
