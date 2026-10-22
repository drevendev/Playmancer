function assertCanonicalId(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertUnitInterval(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be a finite number in [0, 1]`);
  }
  return value;
}

function comparePath(a, b) {
  // Compare full ID components: joining with a sentinel is not injective
  // when this standalone graph API accepts separator characters in IDs.
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}

// Path comparison is exact. Floating addition can break true ties and
// indiscriminate fixed-precision rounding can reverse distinct route costs.
function gcd(a, b) {
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}
function bridgeDecimalRatio(value) {
  const [mantissa, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = mantissa.split(".");
  const scale = fraction.length - Number(exponent);
  let numerator = BigInt(whole + fraction), denominator = 1n;
  if (scale > 0) denominator = 10n ** BigInt(scale);
  if (scale < 0) numerator *= 10n ** BigInt(-scale);
  const factor = gcd(numerator, denominator);
  return { numerator: numerator / factor, denominator: denominator / factor };
}
function addRatio(a, b) {
  const numerator = a.numerator * b.denominator + b.numerator * a.denominator;
  const denominator = a.denominator * b.denominator;
  const factor = gcd(numerator, denominator);
  return { numerator: numerator / factor, denominator: denominator / factor };
}
function edgeExactCost(edge, similarity) {
  // The feature adapter supplies exact weighted-Jaccard fractions; generic
  // edges without one use the decimal value of their declared similarity.
  const ratio = edge.exactSimilarity === undefined
    ? bridgeDecimalRatio(similarity) : edge.exactSimilarity;
  if (!ratio || typeof ratio.numerator !== "bigint" ||
      typeof ratio.denominator !== "bigint" || ratio.denominator <= 0n ||
      ratio.numerator < 0n || ratio.numerator > ratio.denominator) {
    throw new TypeError("edge exactSimilarity must agree with displayed similarity");
  }
  // Number(BigInt)/Number(BigInt) is NaN for large fractions (Infinity/Infinity).
  // Denominator-only overflow also produces a finite but incorrect zero.
  // Use the fast path only when both conversions retain a finite value.
  const numericNumerator = Number(ratio.numerator);
  const numericDenominator = Number(ratio.denominator);
  const observed = numericNumerator / numericDenominator;
  if (Number.isFinite(numericNumerator) && Number.isFinite(numericDenominator)) {
    if (Math.abs(observed - similarity) > 1e-12) {
      throw new TypeError("edge exactSimilarity must agree with displayed similarity");
    }
  } else {
    const shown = bridgeDecimalRatio(similarity);
    const delta = ratio.numerator * shown.denominator -
      shown.numerator * ratio.denominator;
    const magnitude = delta < 0n ? -delta : delta;
    if (magnitude * 1000000000000n > ratio.denominator * shown.denominator) {
      throw new TypeError("edge exactSimilarity must agree with displayed similarity");
    }
  }
  return { numerator: ratio.denominator - ratio.numerator, denominator: ratio.denominator };
}
function compareState(a, b) {
  const exactDifference = a.exactCost.numerator * b.exactCost.denominator -
    b.exactCost.numerator * a.exactCost.denominator;
  if (exactDifference !== 0n) return exactDifference < 0n ? -1 : 1;
  if (a.hops !== b.hops) return a.hops - b.hops;
  return comparePath(a.nodes, b.nodes);
}

// Priority queue: keep the exact route order without re-sorting the entire
// frontier after every expansion. The comparator remains the sole source of
// truth for rational costs, hop count and component-wise ID tie-breaking.
function pushMin(queue, state) {
  let index = queue.length;
  queue.push(state);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareState(queue[parent], state) <= 0) break;
    queue[index] = queue[parent];
    index = parent;
  }
  queue[index] = state;
}
function popMin(queue) {
  const smallest = queue[0];
  const tail = queue.pop();
  if (queue.length === 0) return smallest;
  let index = 0;
  while (2 * index + 1 < queue.length) {
    const left = 2 * index + 1;
    const right = left + 1;
    const child = right < queue.length && compareState(queue[right], queue[left]) < 0 ? right : left;
    if (compareState(tail, queue[child]) <= 0) break;
    queue[index] = queue[child];
    index = child;
  }
  queue[index] = tail;
  return smallest;
}

export function findBridgeRoute(graph, startIdInput, endIdInput, { maxHops = 8 } = {}) {
  if (!graph || typeof graph !== "object") throw new TypeError("graph must be an object");
  if (!Array.isArray(graph.nodes)) throw new TypeError("graph.nodes must be an array");
  if (!Array.isArray(graph.edges)) throw new TypeError("graph.edges must be an array");
  if (!Number.isInteger(maxHops) || maxHops < 0) {
    throw new RangeError("maxHops must be a non-negative integer");
  }

  const nodeIds = new Set();
  for (const node of graph.nodes) {
    const id = typeof node === "string" ? node : node?.id;
    assertCanonicalId(id, "node id");
    if (nodeIds.has(id)) throw new TypeError(`duplicate node id: ${id}`);
    nodeIds.add(id);
  }

  const startId = assertCanonicalId(startIdInput, "startId");
  const endId = assertCanonicalId(endIdInput, "endId");
  if (!nodeIds.has(startId) || !nodeIds.has(endId)) {
    throw new RangeError("startId and endId must exist in graph.nodes");
  }

  const adjacency = new Map([...nodeIds].map((id) => [id, []]));
  const undirectedPairs = new Set();
  for (const edge of graph.edges) {
    if (!edge || typeof edge !== "object") throw new TypeError("each edge must be an object");
    const from = assertCanonicalId(edge.from, "edge.from");
    const to = assertCanonicalId(edge.to, "edge.to");
    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      throw new RangeError(`edge endpoints must exist in graph.nodes: ${from} -> ${to}`);
    }
    if (from === to) throw new TypeError(`self edge is not allowed: ${from}`);
    const similarity = assertUnitInterval(edge.similarity, `similarity ${from} -> ${to}`);
    const featureChanges = edge.featureChanges ?? [];
    if (!Array.isArray(featureChanges) || featureChanges.some((value) => typeof value !== "string")) {
      throw new TypeError("edge.featureChanges must be an array of strings");
    }
    // Parallel undirected edges make route explanations depend on input order.
    const pairKey = JSON.stringify(from < to ? [from, to] : [to, from]);
    if (undirectedPairs.has(pairKey)) {
      throw new TypeError(`duplicate undirected edge: ${from} <-> ${to}`);
    }
    undirectedPairs.add(pairKey);
    const cost = 1 - similarity;
    const exactCost = edgeExactCost(edge, similarity);
    adjacency.get(from).push({ to, similarity, cost, exactCost, featureChanges: [...featureChanges] });
    adjacency.get(to).push({ to: from, similarity, cost, exactCost, featureChanges: [...featureChanges] });
  }

  if (startId === endId) {
    return {
      status: "route",
      startId,
      endId,
      nodes: [startId],
      edges: [],
      hops: 0,
      totalCost: 0,
      maxHopCost: 0,
      maxHops,
    };
  }

  // The route comparator and simple-path search are expensive on dense graphs.
  // If the target lies in another connected component, no valid route exists
  // regardless of weights or hop budget. Graph edges were validated above.
  const reachable = new Set([startId]), pending = [startId];
  let found = false;
  for (let offset = 0; offset < pending.length && !found; offset++) {
    for (const edge of adjacency.get(pending[offset])) {
      if (edge.to === endId) { found = true; break; }
      if (!reachable.has(edge.to)) {
        reachable.add(edge.to);
        pending.push(edge.to);
      }
    }
  }
  if (!found) {
    return { status: "no-route", reason: "disconnected-or-hop-bound", startId, endId, maxHops };
  }

  for (const list of adjacency.values()) {
    list.sort((a, b) => a.to < b.to ? -1 : a.to > b.to ? 1 : 0);
  }

  const initial = { node: startId, nodes: [startId], edges: [], hops: 0,
    totalCost: 0, exactCost: { numerator: 0n, denominator: 1n } };
  const queue = [initial];
  const stateKey = (node, hops) => `${node}\u0000${hops}`;
  const best = new Map([[stateKey(startId, 0), initial]]);

  while (queue.length > 0) {
    const current = popMin(queue);

    const known = best.get(stateKey(current.node, current.hops));
    if (known && compareState(current, known) > 0) continue;
    if (current.node === endId) {
      return {
        status: "route",
        startId,
        endId,
        nodes: current.nodes,
        edges: current.edges,
        hops: current.hops,
        totalCost: current.totalCost,
        maxHopCost: current.edges.reduce((max, edge) => Math.max(max, edge.cost), 0),
        maxHops,
      };
    }
    if (current.hops >= maxHops) continue;

    for (const edge of adjacency.get(current.node)) {
      if (current.nodes.includes(edge.to)) continue;
      const next = {
        node: edge.to,
        nodes: [...current.nodes, edge.to],
        edges: [...current.edges, {
          from: current.node,
          to: edge.to,
          similarity: edge.similarity,
          cost: edge.cost,
          featureChanges: edge.featureChanges,
        }],
        hops: current.hops + 1,
        totalCost: current.totalCost + edge.cost,
        exactCost: addRatio(current.exactCost, edge.exactCost),
      };

      const key = stateKey(next.node, next.hops);
      const previous = best.get(key);
      if (!previous || compareState(next, previous) < 0) {
        best.set(key, next);
        pushMin(queue, next);
      }
    }
  }

  return {
    status: "no-route",
    reason: "disconnected-or-hop-bound",
    startId,
    endId,
    maxHops,
  };
}
