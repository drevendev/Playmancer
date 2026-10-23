import assert from "node:assert/strict";
import test from "node:test";
import { initialState, validateState, encodeState, decodeState, BRIDGE_STATE_VERSION } from "../src/demo.js";
import { BRIDGE_ROUTE_METHOD_VERSION } from "../src/bridge-preview.js";
const config = () => ({version: BRIDGE_STATE_VERSION, method: BRIDGE_ROUTE_METHOD_VERSION,
  startId: "demo:ember", endId: "demo:harvest", maxHops: 3, minSimilarity: 0.31});
test("legacy links without Bridge remain unchanged and restore safely", () => {
  const state = initialState();
  assert.deepEqual(validateState(state), state);
  assert.deepEqual(decodeState(encodeState(state)), state);
});
test("Bridge share roundtrip retains endpoints, hop policy, constraints and versions", () => {
  const state = {...initialState(), bridge: config(), platform: "windows", coopOnly: true,
    mode: "blend", lambda: 0.7, excluded: ["demo:tide"]};
  assert.deepEqual(decodeState(encodeState(state)), state);
});
test("stale route algorithm, UI version or unsupported fields fail visibly", () => {
  for (const patch of [{method:"obsolete"}, {version:"future"}, {maxHops:9},
    {minSimilarity:0.93}, {startId:"demo:unknown"}, {futurePolicy:1}]) {
    assert.throws(() => validateState({...initialState(), bridge:{...config(), ...patch}}));
  }
});
test("two explicit endpoints must exist in the basket and be distinct", () => {
  for (const patch of [{endId:"demo:tide"}, {startId:"demo:ember", endId:"demo:ember"}]) {
    assert.throws(() => validateState({...initialState(), bridge:{...config(), ...patch}}));
  }
  const partial = {...config(), endId:null};
  assert.deepEqual(decodeState(encodeState({...initialState(), bridge:partial})).bridge,partial);
});
test("malformed Bridge link fails closed rather than replacing the basket", () => {
  const state={...initialState(), bridge:{...config(), method:"changed"}};
  assert.throws(() => decodeState("#basket="+encodeURIComponent(JSON.stringify(state))), /incompatible route version/);
});
