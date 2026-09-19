import { createSkillGraph } from "./graph.js";
/** Compile selected skills into a validated typed DAG. */
export async function compileSkillGraph(request) {
    const proposal = request.propose === undefined ? deterministicProposal(request) : await request.propose(request);
    const nodes = dedupeNodes(proposal.invocations);
    const edges = inferEdges(nodes, proposal.edges);
    return createSkillGraph({ nodes, edges: connectTerminals(nodes, edges, request.goalFacts), goalFacts: request.goalFacts });
}
function deterministicProposal(request) {
    return {
        invocations: request.candidates.map((candidate, index) => ({
            id: `skill-${index + 1}-${candidate.skill.id}`,
            skillId: candidate.skill.id,
            args: {},
            preconditions: candidate.skill.preconditions,
            effects: candidate.skill.effects,
            confidence: candidate.score ?? 0,
        })),
        edges: [],
    };
}
function dedupeNodes(nodes) {
    const seen = new Set();
    return nodes.filter(node => {
        if (seen.has(node.id))
            return false;
        seen.add(node.id);
        return true;
    });
}
function inferEdges(nodes, proposed) {
    const edges = proposed.filter(edge => edge.from !== edge.to).map(edge => ({ ...edge }));
    const existing = new Set(edges.map(edge => `${edge.from}->${edge.to}`));
    for (const target of nodes) {
        for (const requirement of target.preconditions) {
            const producer = nodes.find(candidate => candidate.id !== target.id && candidate.effects.includes(requirement));
            if (producer !== undefined && !existing.has(`${producer.id}->${target.id}`)) {
                edges.push({ id: `state-${producer.id}-${target.id}-${requirement}`, from: producer.id, to: target.id, type: 'state', confidence: 1 });
                existing.add(`${producer.id}->${target.id}`);
            }
        }
    }
    const cycleSafe = removeLowConfidenceCycles(nodes, edges);
    return cycleSafe;
}
function removeLowConfidenceCycles(nodes, edges) {
    let result = [...edges];
    while (true) {
        const graph = { sourceId: '__source__', sinkId: '__sink__', nodes, edges: result, goalFacts: [] };
        const ordered = tryOrder(graph);
        if (ordered !== undefined)
            return result;
        const removable = result.filter(edge => edge.type === 'order').sort((left, right) => left.confidence - right.confidence)[0];
        if (removable === undefined)
            throw new Error('compiler produced a cycle that cannot be repaired by removing a soft order edge');
        result = result.filter(edge => edge !== removable);
    }
}
function tryOrder(graph) {
    const indegree = new Map(graph.nodes.map(node => [node.id, 0]));
    for (const edge of graph.edges) {
        if (indegree.has(edge.to) && indegree.has(edge.from))
            indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
    }
    const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
    const result = [];
    while (queue.length > 0) {
        const id = queue.shift();
        result.push(id);
        for (const edge of graph.edges.filter(edge => edge.from === id)) {
            const next = (indegree.get(edge.to) ?? 0) - 1;
            indegree.set(edge.to, next);
            if (next === 0)
                queue.push(edge.to);
        }
    }
    return result.length === graph.nodes.length ? result : undefined;
}
function connectTerminals(nodes, edges, goals) {
    const result = [...edges];
    const incoming = new Set(edges.map(edge => edge.to));
    const outgoing = new Set(edges.map(edge => edge.from));
    for (const node of nodes)
        if (!incoming.has(node.id))
            result.push({ id: `source-${node.id}`, from: '__source__', to: node.id, type: 'order', confidence: 1 });
    for (const node of nodes) {
        const isGoal = goals.length === 0 || goals.some(goal => node.effects.includes(goal));
        if (!outgoing.has(node.id) || isGoal)
            result.push({ id: `sink-${node.id}`, from: node.id, to: '__sink__', type: 'order', confidence: 1 });
    }
    return result;
}
//# sourceMappingURL=compiler.js.map