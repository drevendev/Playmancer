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
  const aKey = a.join("\u0000");
  const bKey = b.join("\u0000");
  return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
}

function compareState(a, b) {
  if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
  if (a.hops !== b.hops) return a.hops - b.hops;
  return comparePath(a.nodes, b.nodes);
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

  const adjacency = new Map([...nodeIds].map((id) => [id, []]));
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
    const cost = 1 - similarity;
    adjacency.get(from).push({ to, similarity, cost, featureChanges: [...featureChanges] });
    adjacency.get(to).push({ to: from, similarity, cost, featureChanges: [...featureChanges] });
  }

  for (const list of adjacency.values()) {
    list.sort((a, b) => a.to.localeCompare(b.to));
  }

  const initial = { node: startId, nodes: [startId], edges: [], hops: 0, totalCost: 0 };
  const queue = [initial];
  const stateKey = (node, hops) => `${node}\u0000${hops}`;
  const best = new Map([[stateKey(startId, 0), initial]]);

  while (queue.length > 0) {
    queue.sort(compareState);
    const current = queue.shift();

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
      };

      const key = stateKey(next.node, next.hops);
      const previous = best.get(key);
      if (!previous || compareState(next, previous) < 0) {
        best.set(key, next);
        queue.push(next);
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
