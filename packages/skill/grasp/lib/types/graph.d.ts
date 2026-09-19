import type { Fact, SkillEdge, SkillGraph, SkillNode } from './types.ts';
/** Create and validate a graph. */
export declare function createSkillGraph(input: Omit<SkillGraph, 'sourceId' | 'sinkId'> & Partial<Pick<SkillGraph, 'sourceId' | 'sinkId'>>): SkillGraph;
/** Validate node uniqueness, edge endpoints, acyclicity, and reachability. */
export declare function validateSkillGraph(graph: SkillGraph): void;
/** Return invocation nodes in deterministic topological order. */
export declare function topologicalOrder(graph: SkillGraph): string[];
/** Return facts produced by a predecessor node. */
export declare function producedFacts(node: SkillNode): Set<Fact>;
/** Clone a graph while replacing nodes and edges. */
export declare function replaceGraph(graph: SkillGraph, nodes: readonly SkillNode[], edges: readonly SkillEdge[]): SkillGraph;
/** Distance in directed edges, used to enforce locality-bounded repair. */
export declare function hopDistance(graph: SkillGraph, from: string, to: string, maxHops?: number): number | undefined;
//# sourceMappingURL=graph.d.ts.map