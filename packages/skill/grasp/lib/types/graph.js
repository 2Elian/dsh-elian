/** Create and validate a graph. */
export function createSkillGraph(input) {
    const graph = {
        sourceId: input.sourceId ?? '__source__',
        sinkId: input.sinkId ?? '__sink__',
        nodes: [...input.nodes],
        edges: [...input.edges],
        goalFacts: [...input.goalFacts],
    };
    validateSkillGraph(graph);
    return graph;
}
/** Validate node uniqueness, edge endpoints, acyclicity, and reachability. */
export function validateSkillGraph(graph) {
    const ids = new Set();
    for (const node of graph.nodes) {
        if (ids.has(node.id) || node.id === graph.sourceId || node.id === graph.sinkId)
            throw new Error(`duplicate graph node id: ${node.id}`);
        ids.add(node.id);
    }
    for (const edge of graph.edges) {
        if (edge.from !== graph.sourceId && !ids.has(edge.from))
            throw new Error(`edge ${edge.id} has unknown source ${edge.from}`);
        if (edge.to !== graph.sinkId && !ids.has(edge.to))
            throw new Error(`edge ${edge.id} has unknown target ${edge.to}`);
        if (edge.from === edge.to)
            throw new Error(`self-loop is not allowed: ${edge.id}`);
    }
    const ordered = topologicalOrder(graph);
    if (ordered.length !== graph.nodes.length)
        throw new Error('skill graph contains a cycle');
    const incoming = new Set(graph.edges.filter(edge => edge.to !== graph.sinkId).map(edge => edge.to));
    const outgoing = new Set(graph.edges.filter(edge => edge.from !== graph.sourceId).map(edge => edge.from));
    for (const node of graph.nodes) {
        if (!incoming.has(node.id))
            throw new Error(`node ${node.id} is unreachable from source`);
        if (!outgoing.has(node.id))
            throw new Error(`node ${node.id} cannot reach sink`);
    }
}
/** Return invocation nodes in deterministic topological order. */
export function topologicalOrder(graph) {
    const ids = graph.nodes.map(node => node.id);
    const indegree = new Map(ids.map(id => [id, 0]));
    const outgoing = new Map(ids.map(id => [id, []]));
    for (const edge of graph.edges) {
        if (edge.from === graph.sourceId || edge.to === graph.sinkId)
            continue;
        indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
        outgoing.get(edge.from)?.push(edge.to);
    }
    const queue = ids.filter(id => indegree.get(id) === 0).sort();
    const result = [];
    while (queue.length > 0) {
        const id = queue.shift();
        result.push(id);
        for (const target of outgoing.get(id) ?? []) {
            const next = (indegree.get(target) ?? 0) - 1;
            indegree.set(target, next);
            if (next === 0)
                queue.push(target);
        }
        queue.sort();
    }
    return result;
}
/** Return facts produced by a predecessor node. */
export function producedFacts(node) {
    return new Set(node.effects);
}
/** Clone a graph while replacing nodes and edges. */
export function replaceGraph(graph, nodes, edges) {
    return createSkillGraph({ ...graph, nodes, edges });
}
/** Distance in directed edges, used to enforce locality-bounded repair. */
export function hopDistance(graph, from, to, maxHops = Number.POSITIVE_INFINITY) {
    if (from === to)
        return 0;
    const adjacency = new Map();
    for (const edge of graph.edges) {
        if (edge.from === graph.sourceId || edge.to === graph.sinkId)
            continue;
        const targets = adjacency.get(edge.from) ?? [];
        targets.push(edge.to);
        adjacency.set(edge.from, targets);
    }
    const queue = [[from, 0]];
    const seen = new Set([from]);
    while (queue.length > 0) {
        const [current, distance] = queue.shift();
        if (distance >= maxHops)
            continue;
        for (const next of adjacency.get(current) ?? []) {
            if (next === to)
                return distance + 1;
            if (!seen.has(next)) {
                seen.add(next);
                queue.push([next, distance + 1]);
            }
        }
    }
    return undefined;
}
//# sourceMappingURL=graph.js.map