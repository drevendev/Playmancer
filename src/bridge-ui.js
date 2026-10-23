// Visible, explicitly experimental Bridge routes: separate from basket ranking modes.
import { buildBridgePreview, BRIDGE_ROUTE_METHOD_VERSION } from "./bridge-preview.js";
import { BY_ID, CATALOG, CATALOG_VERSION, BRIDGE_STATE_VERSION } from "./demo.js";

const bridgeEl = (id) => document.getElementById(id);
const bridgeNode = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const DEFAULT_BRIDGE = Object.freeze({
  version: BRIDGE_STATE_VERSION, method: BRIDGE_ROUTE_METHOD_VERSION,
  startId: null, endId: null, maxHops: 3, minSimilarity: 0.31
});
const bridgeSettings = (state) => state.bridge ?? DEFAULT_BRIDGE;

// One-entry cache for the complete JSON route input. Ranking weights/mode are
// deliberately absent from that input; filters, exclusions, endpoints, policy
// and catalog data/version are included. Failed computations are never cached.
export function createBridgeRouteCache(compute = buildBridgePreview) {
  let previousKey, previousResult;
  let hasResult = false;
  return (input) => {
    const key = JSON.stringify(input);
    if (hasResult && key === previousKey) return previousResult;
    const result = compute(input);
    previousKey = key;
    previousResult = result;
    hasResult = true;
    return result;
  };
}
const cachedBridgePreview = createBridgeRouteCache();

// A one-entry result cache and a cancellable off-thread job for large snapshots.
// A new input terminates the old worker: slow responses can never replace newer
// controls, and ordinary keyboard/search/share handlers remain on the UI thread.
// The small preview and offline file harness deliberately retain synchronous parity.
let bridgeJob = null;
let bridgeGeneration = 0;
let completedBridgeKey = null;
let completedBridgeRoute = null;
function cancelPendingBridge() {
  bridgeGeneration++;
  if (bridgeJob) {
    bridgeJob.worker.terminate();
    URL.revokeObjectURL(bridgeJob.url);
    bridgeJob = null;
  }
}
function canUseBridgeWorker() {
  return CATALOG.length >= 50 && typeof Worker === "function" &&
    typeof BRIDGE_WORKER_SOURCE === "string" &&
    (location.protocol === "https:" || location.protocol === "http:");
}
function calculateBridgeInWorker(input, form, status, steps) {
  const key = JSON.stringify(input);
  if (completedBridgeKey === key && completedBridgeRoute !== null) {
    steps.removeAttribute("aria-busy");
    showBridgeRoute(completedBridgeRoute, form, status, steps);
    return;
  }
  if (bridgeJob?.key === key) {
    status.textContent = "Calculating an explained route… You can keep using the basket.";
    steps.setAttribute("aria-busy", "true");
    return;
  }
  cancelPendingBridge();
  const generation = bridgeGeneration;
  status.textContent = "Calculating an explained route… You can keep using the basket.";
  steps.setAttribute("aria-busy", "true");
  let url, worker;
  try {
    url = URL.createObjectURL(new Blob([BRIDGE_WORKER_SOURCE], { type: "text/javascript" }));
    worker = new Worker(url);
  } catch {
    if (url) URL.revokeObjectURL(url);
    steps.removeAttribute("aria-busy");
    status.textContent = "Bridge calculation is unavailable in this browser. Reload to retry.";
    return;
  }
  bridgeJob = { key, worker, url };
  const finish = () => {
    if (bridgeJob?.worker !== worker || generation !== bridgeGeneration) return false;
    cancelPendingBridge();
    steps.removeAttribute("aria-busy");
    return true;
  };
  worker.onmessage = ({ data }) => {
    if (!finish()) return;
    if (!data?.route || data.error) {
      status.textContent = "Bridge calculation failed: " +
        (typeof data?.error === "string" ? data.error : "unknown error") + ".";
      return;
    }
    completedBridgeKey = key;
    completedBridgeRoute = data.route;
    showBridgeRoute(data.route, form, status, steps);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    if (finish()) status.textContent = "Bridge calculation failed. Change a route control to retry.";
  };
  worker.onmessageerror = () => {
    if (finish()) status.textContent = "Bridge response could not be read. Change a route control to retry.";
  };
  try {
    worker.postMessage({ input });
  } catch {
    if (finish()) status.textContent = "Bridge input could not be sent. Change a route control to retry.";
  }
}

export function renderBridge(state) {
  const form = bridgeSettings(state);
  const selected = new Set(state.seeds.map((item) => item.id));
  for (const [name, id] of [["bridge-start", form.startId], ["bridge-end", form.endId]]) {
    const select = bridgeEl(name);
    const first = bridgeNode("option", "Choose favorite…"); first.value = "";
    select.replaceChildren(first);
    for (const seed of state.seeds) {
      const option = bridgeNode("option", BY_ID.get(seed.id).name);
      option.value = seed.id;
      select.append(option);
    }
    select.value = id && selected.has(id) ? id : "";
    select.disabled = state.seeds.length < 2;
  }
  bridgeEl("bridge-hops").value = String(form.maxHops);
  bridgeEl("bridge-threshold").value = String(form.minSimilarity);
  const status = bridgeEl("bridge-status"), steps = bridgeEl("bridge-steps");
  steps.replaceChildren();
  if (state.seeds.length < 2) {
    cancelPendingBridge();
    steps.removeAttribute("aria-busy");
    status.textContent = "Add at least two distinct favorites to your basket.";
    return;
  }
  if (!form.startId || !form.endId) {
    cancelPendingBridge();
    steps.removeAttribute("aria-busy");
    status.textContent = "Select both favorites to calculate a route.";
    return;
  }
  const input = {
    catalog: CATALOG, snapshotId: CATALOG_VERSION,
    startId: form.startId, endId: form.endId,
    platform: state.platform, coopOnly: state.coopOnly,
    excluded: state.excluded, maxHops: form.maxHops,
    minSimilarity: form.minSimilarity
  };
  if (canUseBridgeWorker()) {
    calculateBridgeInWorker(input, form, status, steps);
    return;
  }
  cancelPendingBridge();
  steps.removeAttribute("aria-busy");
  showBridgeRoute(cachedBridgePreview(input), form, status, steps);
}
function showBridgeRoute(route, form, status, steps) {
  if (route.status === "unavailable-endpoint") {
    status.textContent = "Route unavailable: " + BY_ID.get(route.affected_id).name +
      " is " + route.reason + " under your current filters. No filter was relaxed.";
    return;
  }
  if (route.status === "no-route") {
    status.textContent = "No supported route within " + form.maxHops +
      " edge(s) at the chosen threshold. " + route.eligibility.unknown +
      " game(s) have unknown required filter metadata; " + route.eligibility.fail +
      " fail filters; " + route.eligibility.excluded +
      " are hidden. Among eligible game pairs, " + route.pair_evidence.insufficient +
      " lack enough comparable feature data; " + route.pair_evidence.zero_support +
      " have no shared evidence; " + route.pair_evidence.below_threshold +
      " are below your similarity threshold. These are separate reasons, not confidence scores. " +
      "No filter was relaxed. Adjust route controls explicitly if desired.";
    return;
  }
  status.textContent = String(route.hops) + " connection(s), " +
    String(Math.max(0, route.hops - 1)) + " intermediate game(s), " +
    String(route.eligible_count) + " eligible profiles. Total graph cost " +
    route.total_cost.toFixed(3) + "; not a quality or confidence estimate.";
  for (const part of route.steps) {
    const row = bridgeNode("li"), card = bridgeNode("div", undefined, "bridge-step");
    card.append(bridgeNode("h3", BY_ID.get(part.from).name + " → " + BY_ID.get(part.to).name));
    card.append(bridgeNode("p", "Connection similarity " + part.affinity.toFixed(3) +
      " · comparable evidence weight " + Math.round(part.evidence_coverage * 100) + "%.", "bridge-key"));
    for (const group of part.groups) {
      card.append(bridgeNode("p", group.group + ": shared " +
        (group.shared.join(", ") || "none") + "; gained " +
        (group.gained.join(", ") || "none") + "; lost " +
        (group.lost.join(", ") || "none") + "."));
    }
    row.append(card); steps.append(row);
  }
}
export function bindBridgeControls(getState, updateBridge) {
  // A button, not an anchor: #basket= owns URL restoration state.
  if (!bridgeEl("intro-bridge")) {
    const jump = bridgeNode("button", "Explore Bridge routes");
    jump.id = "intro-bridge";
    jump.type = "button";
    jump.setAttribute("aria-controls", "bridge-lab");
    bridgeEl("intro-empty").after(jump);
    const title = bridgeEl("bridge-title");
    title.tabIndex = -1;
    jump.addEventListener("click", () => {
      bridgeEl("bridge-lab").scrollIntoView({ block: "start", behavior: "auto" });
      title.focus({ preventScroll: true });
    });
  }
  for (const key of ["bridge-start", "bridge-end", "bridge-hops", "bridge-threshold"]) {
    bridgeEl(key).addEventListener("change", () => {
      const next = { ...bridgeSettings(getState()),
        startId: bridgeEl("bridge-start").value || null,
        endId: bridgeEl("bridge-end").value || null,
        maxHops: Number(bridgeEl("bridge-hops").value),
        minSimilarity: Number(bridgeEl("bridge-threshold").value)
      };
      if (next.startId && next.endId && next.startId === next.endId) {
        if (key === "bridge-start") next.endId = null;
        else next.startId = null;
      }
      updateBridge(next);
    });
  }
}
