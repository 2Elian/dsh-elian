//#region lib/types/graph.js
/** Create and validate a graph. */
function createSkillGraph(input) {
	const graph = {
		sourceId: input.sourceId ?? "__source__",
		sinkId: input.sinkId ?? "__sink__",
		nodes: [...input.nodes],
		edges: [...input.edges],
		goalFacts: [...input.goalFacts]
	};
	validateSkillGraph(graph);
	return graph;
}
/** Validate node uniqueness, edge endpoints, acyclicity, and reachability. */
function validateSkillGraph(graph) {
	const ids = /* @__PURE__ */ new Set();
	for (const node of graph.nodes) {
		if (ids.has(node.id) || node.id === graph.sourceId || node.id === graph.sinkId) throw new Error(`duplicate graph node id: ${node.id}`);
		ids.add(node.id);
	}
	for (const edge of graph.edges) {
		if (edge.from !== graph.sourceId && !ids.has(edge.from)) throw new Error(`edge ${edge.id} has unknown source ${edge.from}`);
		if (edge.to !== graph.sinkId && !ids.has(edge.to)) throw new Error(`edge ${edge.id} has unknown target ${edge.to}`);
		if (edge.from === edge.to) throw new Error(`self-loop is not allowed: ${edge.id}`);
	}
	if (topologicalOrder(graph).length !== graph.nodes.length) throw new Error("skill graph contains a cycle");
	const incoming = new Set(graph.edges.filter((edge) => edge.to !== graph.sinkId).map((edge) => edge.to));
	const outgoing = new Set(graph.edges.filter((edge) => edge.from !== graph.sourceId).map((edge) => edge.from));
	for (const node of graph.nodes) {
		if (!incoming.has(node.id)) throw new Error(`node ${node.id} is unreachable from source`);
		if (!outgoing.has(node.id)) throw new Error(`node ${node.id} cannot reach sink`);
	}
}
/** Return invocation nodes in deterministic topological order. */
function topologicalOrder(graph) {
	const ids = graph.nodes.map((node) => node.id);
	const indegree = new Map(ids.map((id) => [id, 0]));
	const outgoing = new Map(ids.map((id) => [id, []]));
	for (const edge of graph.edges) {
		if (edge.from === graph.sourceId || edge.to === graph.sinkId) continue;
		indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
		outgoing.get(edge.from)?.push(edge.to);
	}
	const queue = ids.filter((id) => indegree.get(id) === 0).sort();
	const result = [];
	while (queue.length > 0) {
		const id = queue.shift();
		result.push(id);
		for (const target of outgoing.get(id) ?? []) {
			const next = (indegree.get(target) ?? 0) - 1;
			indegree.set(target, next);
			if (next === 0) queue.push(target);
		}
		queue.sort();
	}
	return result;
}
/** Return facts produced by a predecessor node. */
function producedFacts(node) {
	return new Set(node.effects);
}
/** Clone a graph while replacing nodes and edges. */
function replaceGraph(graph, nodes, edges) {
	return createSkillGraph({
		...graph,
		nodes,
		edges
	});
}
/** Distance in directed edges, used to enforce locality-bounded repair. */
function hopDistance(graph, from, to, maxHops = Number.POSITIVE_INFINITY) {
	if (from === to) return 0;
	const adjacency = /* @__PURE__ */ new Map();
	for (const edge of graph.edges) {
		if (edge.from === graph.sourceId || edge.to === graph.sinkId) continue;
		const targets = adjacency.get(edge.from) ?? [];
		targets.push(edge.to);
		adjacency.set(edge.from, targets);
	}
	const queue = [[from, 0]];
	const seen = new Set([from]);
	while (queue.length > 0) {
		const [current, distance] = queue.shift();
		if (distance >= maxHops) continue;
		for (const next of adjacency.get(current) ?? []) {
			if (next === to) return distance + 1;
			if (!seen.has(next)) {
				seen.add(next);
				queue.push([next, distance + 1]);
			}
		}
	}
}
//#endregion
//#region lib/types/retrieval.js
const DEFAULT_TOP_K = 8;
const DEFAULT_MEMORY_WEIGHT = .35;
/** Retrieve skills with a deterministic lexical baseline and memory-conditioned fusion. */
function retrieveSkills(task, skills, memory = [], options = {}) {
	const topK = options.topK ?? DEFAULT_TOP_K;
	const memoryWeight = Math.min(1, Math.max(0, options.memoryWeight ?? DEFAULT_MEMORY_WEIGHT));
	const taskTokens = tokens(task);
	const semantic = /* @__PURE__ */ new Map();
	for (const skill of skills) semantic.set(skill.id, overlap(taskTokens, tokens(`${skill.id} ${skill.description}`)));
	const relevantMemory = memory.map((record) => ({
		record,
		score: record.similarity ?? overlap(taskTokens, tokens(record.task))
	})).sort((left, right) => right.score - left.score);
	const bestMemory = relevantMemory[0]?.score ?? 0;
	const memoryPrior = /* @__PURE__ */ new Map();
	for (const item of relevantMemory.slice(0, 5)) for (const skillId of item.record.skills) memoryPrior.set(skillId, Math.max(memoryPrior.get(skillId) ?? 0, item.score * (item.record.success ? 1 : .25)));
	const scores = /* @__PURE__ */ new Map();
	for (const skill of skills) scores.set(skill.id, (1 - memoryWeight) * (semantic.get(skill.id) ?? 0) + memoryWeight * (memoryPrior.get(skill.id) ?? 0));
	const ranked = [...skills].sort((left, right) => (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0) || left.id.localeCompare(right.id));
	const maxScore = Math.max(...scores.values(), 0);
	const minScore = options.minScore ?? 0;
	const selected = ranked.slice(0, topK).filter((skill) => (scores.get(skill.id) ?? 0) >= minScore).map((skill) => ({
		skill,
		score: scores.get(skill.id) ?? 0,
		source: memoryPrior.has(skill.id) ? "hybrid" : "semantic"
	}));
	const top = selected[0]?.score ?? 0;
	const second = selected[1]?.score ?? 0;
	const margin = top > 0 ? Math.max(0, (top - second) / top) : 0;
	const agreement = 1 - jsDistance(normalize([...semantic.values()]), normalize([...scores.values()]));
	const coverage = selected.length === 0 ? 0 : Math.min(1, selected.reduce((sum, candidate) => sum + candidate.skill.effects.length, 0) / Math.max(1, selected.length * 2));
	const confidence = Math.min(1, Math.max(0, .25 * Math.min(1, bestMemory) + .25 * agreement + .25 * margin + .25 * coverage));
	return {
		selected,
		skillScores: Object.fromEntries([...scores].map(([id, score]) => [id, score / Math.max(maxScore, 1)])),
		confidence,
		features: {
			memorySimilarity: bestMemory,
			distributionAgreement: agreement,
			topSkillMargin: margin,
			goalCoverage: coverage
		}
	};
}
function tokens(value) {
	return new Set(value.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));
}
function overlap(left, right) {
	if (left.size === 0 || right.size === 0) return 0;
	let common = 0;
	for (const token of left) if (right.has(token)) common += 1;
	return common / Math.sqrt(left.size * right.size);
}
function normalize(values) {
	const total = values.reduce((sum, value) => sum + value, 0);
	return total === 0 ? values.map(() => 0) : values.map((value) => value / total);
}
function jsDistance(left, right) {
	const epsilon = 1e-12;
	const midpoint = left.map((value, index) => (value + (right[index] ?? 0)) / 2);
	const kl = (values, target) => values.reduce((sum, value, index) => value <= 0 ? sum : sum + value * Math.log(value / Math.max(target[index] ?? 0, epsilon)), 0);
	return Math.min(1, Math.max(0, (kl(left, midpoint) + kl(right, midpoint)) / (2 * Math.log(2))));
}
/** Extract the facts a candidate set can produce. */
function candidateEffects(candidates) {
	return new Set(candidates.flatMap((candidate) => candidate.skill.effects));
}
//#endregion
//#region lib/types/compiler.js
/** Compile selected skills into a validated typed DAG. */
async function compileSkillGraph(request) {
	const proposal = request.propose === void 0 ? deterministicProposal(request) : await request.propose(request);
	const nodes = dedupeNodes(proposal.invocations);
	return createSkillGraph({
		nodes,
		edges: connectTerminals(nodes, inferEdges(nodes, proposal.edges), request.goalFacts),
		goalFacts: request.goalFacts
	});
}
function deterministicProposal(request) {
	return {
		invocations: request.candidates.map((candidate, index) => ({
			id: `skill-${index + 1}-${candidate.skill.id}`,
			skillId: candidate.skill.id,
			args: {},
			preconditions: candidate.skill.preconditions,
			effects: candidate.skill.effects,
			confidence: candidate.score ?? 0
		})),
		edges: []
	};
}
function dedupeNodes(nodes) {
	const seen = /* @__PURE__ */ new Set();
	return nodes.filter((node) => {
		if (seen.has(node.id)) return false;
		seen.add(node.id);
		return true;
	});
}
function inferEdges(nodes, proposed) {
	const edges = proposed.filter((edge) => edge.from !== edge.to).map((edge) => ({ ...edge }));
	const existing = new Set(edges.map((edge) => `${edge.from}->${edge.to}`));
	for (const target of nodes) for (const requirement of target.preconditions) {
		const producer = nodes.find((candidate) => candidate.id !== target.id && candidate.effects.includes(requirement));
		if (producer !== void 0 && !existing.has(`${producer.id}->${target.id}`)) {
			edges.push({
				id: `state-${producer.id}-${target.id}-${requirement}`,
				from: producer.id,
				to: target.id,
				type: "state",
				confidence: 1
			});
			existing.add(`${producer.id}->${target.id}`);
		}
	}
	return removeLowConfidenceCycles(nodes, edges);
}
function removeLowConfidenceCycles(nodes, edges) {
	let result = [...edges];
	while (true) {
		if (tryOrder({
			sourceId: "__source__",
			sinkId: "__sink__",
			nodes,
			edges: result,
			goalFacts: []
		}) !== void 0) return result;
		const removable = result.filter((edge) => edge.type === "order").sort((left, right) => left.confidence - right.confidence)[0];
		if (removable === void 0) throw new Error("compiler produced a cycle that cannot be repaired by removing a soft order edge");
		result = result.filter((edge) => edge !== removable);
	}
}
function tryOrder(graph) {
	const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
	for (const edge of graph.edges) if (indegree.has(edge.to) && indegree.has(edge.from)) indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
	const queue = [...indegree].filter(([, degree]) => degree === 0).map(([id]) => id);
	const result = [];
	while (queue.length > 0) {
		const id = queue.shift();
		result.push(id);
		for (const edge of graph.edges.filter((edge) => edge.from === id)) {
			const next = (indegree.get(edge.to) ?? 0) - 1;
			indegree.set(edge.to, next);
			if (next === 0) queue.push(edge.to);
		}
	}
	return result.length === graph.nodes.length ? result : void 0;
}
function connectTerminals(nodes, edges, goals) {
	const result = [...edges];
	const incoming = new Set(edges.map((edge) => edge.to));
	const outgoing = new Set(edges.map((edge) => edge.from));
	for (const node of nodes) if (!incoming.has(node.id)) result.push({
		id: `source-${node.id}`,
		from: "__source__",
		to: node.id,
		type: "order",
		confidence: 1
	});
	for (const node of nodes) {
		const isGoal = goals.length === 0 || goals.some((goal) => node.effects.includes(goal));
		if (!outgoing.has(node.id) || isGoal) result.push({
			id: `sink-${node.id}`,
			from: node.id,
			to: "__sink__",
			type: "order",
			confidence: 1
		});
	}
	return result;
}
//#endregion
//#region lib/types/router.js
/** Select graph, repair-capable graph, or reactive fallback from retrieval confidence. */
function routeByConfidence(result, policy = {}) {
	const low = policy.lowThreshold ?? .3;
	const high = policy.highThreshold ?? .7;
	if (result.confidence < low) return "reactive";
	if (result.confidence >= high) return "graph";
	return "graph-repair";
}
//#endregion
//#region lib/types/repair.js
/** Local, bounded implementation of GraSP's five repair operators. */
function repairSkillGraph(graph, failure, skills, budget = {}) {
	const maxHops = budget.maxHops ?? 2;
	const node = graph.nodes.find((item) => item.id === failure.nodeId);
	if (node === void 0) return unsuccessful(graph, "failed node is not present");
	const operators = [
		["REBIND", () => rebind(graph, node, failure)],
		["INSERT_PREREQ", () => insertPrerequisite(graph, node, failure, skills, maxHops)],
		["SUBSTITUTE", () => substitute(graph, node, skills)],
		["REWIRE", () => rewire(graph, node, maxHops)],
		["BYPASS", () => bypass(graph, node, failure)]
	];
	for (const [operator, attempt] of operators) {
		const candidate = attempt();
		if (candidate !== void 0) return {
			operator,
			graph: candidate,
			repaired: true
		};
	}
	return unsuccessful(graph, "no bounded repair operator produced a valid graph");
}
function rebind(graph, node, failure) {
	if (failure.missingFacts.length > 0) return void 0;
	const updated = {
		...node,
		args: {
			...node.args,
			repairAttempt: true
		}
	};
	return replaceGraph(graph, graph.nodes.map((item) => item.id === node.id ? updated : item), graph.edges);
}
function insertPrerequisite(graph, node, failure, skills, maxHops) {
	const candidate = skills.find((skill) => failure.missingFacts.some((fact) => skill.effects.includes(fact)));
	if (candidate === void 0 || graph.nodes.some((item) => item.skillId === candidate.id)) return void 0;
	const inserted = {
		id: `repair-${candidate.id}`,
		skillId: candidate.id,
		args: {},
		preconditions: candidate.preconditions,
		effects: candidate.effects,
		confidence: .5
	};
	const edge = {
		id: `repair-edge-${inserted.id}-${node.id}`,
		from: inserted.id,
		to: node.id,
		type: "state",
		confidence: .5
	};
	return graph.edges.some((item) => item.from === node.id && hopDistance(graph, item.to, node.id, maxHops) !== void 0) || graph.nodes.length === 1 ? replaceGraph(graph, [...graph.nodes, inserted], [...graph.edges, edge]) : void 0;
}
function substitute(graph, node, skills) {
	const replacement = skills.find((skill) => skill.id !== node.skillId && skill.preconditions.every((fact) => node.preconditions.includes(fact)) && skill.effects.some((fact) => node.effects.includes(fact)));
	if (replacement === void 0) return void 0;
	const updated = {
		...node,
		skillId: replacement.id,
		preconditions: replacement.preconditions,
		effects: replacement.effects,
		confidence: Math.min(node.confidence, .5)
	};
	return replaceGraph(graph, graph.nodes.map((item) => item.id === node.id ? updated : item), graph.edges);
}
function rewire(graph, node, maxHops) {
	const incoming = graph.edges.filter((edge) => edge.to === node.id && edge.from !== graph.sourceId);
	const outgoing = graph.edges.filter((edge) => edge.from === node.id && edge.to !== graph.sinkId);
	if (incoming.length === 0 || outgoing.length === 0) return void 0;
	const firstIncoming = incoming[0];
	const firstOutgoing = outgoing[0];
	if (firstIncoming === void 0 || firstOutgoing === void 0) return void 0;
	if (hopDistance(graph, firstIncoming.from, firstOutgoing.to, maxHops) === void 0) return void 0;
	const without = graph.edges.filter((edge) => edge.to !== node.id && edge.from !== node.id);
	return replaceGraph(graph, graph.nodes.filter((item) => item.id !== node.id), without);
}
function bypass(graph, node, failure) {
	if (failure.missingFacts.length > 0) return void 0;
	const incoming = graph.edges.filter((edge) => edge.to === node.id && edge.from !== graph.sourceId);
	const outgoing = graph.edges.filter((edge) => edge.from === node.id && edge.to !== graph.sinkId);
	if (incoming.length === 0 || outgoing.length === 0) return void 0;
	const bypassEdges = incoming.flatMap((left) => outgoing.map((right) => ({
		id: `bypass-${left.from}-${right.to}`,
		from: left.from,
		to: right.to,
		type: "order",
		confidence: .25
	})));
	return replaceGraph(graph, graph.nodes.filter((item) => item.id !== node.id), [...graph.edges.filter((edge) => edge.to !== node.id && edge.from !== node.id), ...bypassEdges]);
}
function unsuccessful(graph, reason) {
	return {
		operator: "BYPASS",
		graph,
		repaired: false,
		reason
	};
}
//#endregion
//#region lib/types/executor.js
/** Execute a compiled graph with precondition checks, postcondition verification, and local repair. */
async function executeSkillGraph(options) {
	let graph = options.graph;
	const route = options.retrieval === void 0 ? "graph-repair" : routeByConfidence(options.retrieval);
	const context = options.context ?? createContext(options.task, options.signal);
	const events = [];
	const completed = [];
	const byId = new Map(options.skills.map((skill) => [skill.id, skill]));
	let order;
	try {
		order = topologicalOrder(graph);
	} catch (error) {
		return {
			ok: false,
			route,
			completed,
			events: [{
				type: "fallback",
				reason: String(error)
			}],
			graph
		};
	}
	let attempts = 0;
	for (const nodeId of order) {
		if (context.signal?.aborted === true) throw context.signal.reason;
		const node = graph.nodes.find((item) => item.id === nodeId);
		const skill = byId.get(node.skillId);
		if (skill === void 0) return {
			ok: false,
			route,
			completed,
			failedNode: node.id,
			events: [...events, {
				type: "node-failure",
				nodeId: node.id,
				reason: `skill ${node.skillId} is unavailable`
			}],
			graph
		};
		events.push({
			type: "node-start",
			nodeId: node.id,
			skillId: node.skillId
		});
		const missing = node.preconditions.filter((fact) => !context.state.has(fact));
		if (missing.length > 0) {
			const repaired = repairSkillGraph(graph, {
				nodeId: node.id,
				reason: "precondition failed",
				missingFacts: missing
			}, options.skills, options.repairBudget);
			events.push({
				type: "repair",
				nodeId: node.id,
				operator: repaired.operator,
				repaired: repaired.repaired
			});
			if (!repaired.repaired || route === "reactive") return {
				ok: false,
				route,
				completed,
				failedNode: node.id,
				events: [...events, {
					type: "node-failure",
					nodeId: node.id,
					reason: `missing preconditions: ${missing.join(", ")}`
				}],
				graph
			};
			graph = repaired.graph;
			attempts += 1;
			if (attempts > (options.repairBudget?.maxAttempts ?? 3)) return {
				ok: false,
				route,
				completed,
				failedNode: node.id,
				events,
				graph
			};
			continue;
		}
		const result = await skill.execute(node.args, context);
		for (const fact of result.removedFacts ?? []) context.state.delete(fact);
		for (const fact of result.addedFacts ?? []) context.state.add(fact);
		for (const [key, value] of Object.entries(result.data ?? {})) context.data.set(key, value);
		const verification = skill.verify === void 0 ? {
			ok: result.ok,
			...result.error === void 0 ? {} : { reason: result.error }
		} : await skill.verify(result, context);
		if (!result.ok || !verification.ok) {
			const reason = verification.reason ?? result.error ?? "postcondition verification failed";
			events.push({
				type: "node-failure",
				nodeId: node.id,
				reason
			});
			const repaired = repairSkillGraph(graph, {
				nodeId: node.id,
				reason,
				missingFacts: verification.missingEffects ?? []
			}, options.skills, options.repairBudget);
			events.push({
				type: "repair",
				nodeId: node.id,
				operator: repaired.operator,
				repaired: repaired.repaired
			});
			if (!repaired.repaired || route === "reactive") return {
				ok: false,
				route,
				completed,
				failedNode: node.id,
				events,
				graph
			};
			graph = repaired.graph;
			continue;
		}
		for (const fact of node.effects) context.state.add(fact);
		completed.push(node.id);
		events.push({
			type: "node-success",
			nodeId: node.id,
			effects: node.effects
		});
	}
	return {
		ok: true,
		route,
		completed,
		events,
		graph
	};
}
function createContext(task, signal) {
	return signal === void 0 ? {
		state: /* @__PURE__ */ new Set(),
		data: /* @__PURE__ */ new Map(),
		task
	} : {
		state: /* @__PURE__ */ new Set(),
		data: /* @__PURE__ */ new Map(),
		signal,
		task
	};
}
//#endregion
export { candidateEffects, compileSkillGraph, createSkillGraph, executeSkillGraph, hopDistance, producedFacts, repairSkillGraph, replaceGraph, retrieveSkills, routeByConfidence, topologicalOrder, validateSkillGraph };
