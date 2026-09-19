import type { GraphExecutionResult, RepairBudget, SkillDefinition, SkillExecutionContext, SkillGraph, RetrievalResult } from './types.ts';
/** Execute a compiled graph with precondition checks, postcondition verification, and local repair. */
export declare function executeSkillGraph(options: {
    readonly graph: SkillGraph;
    readonly skills: readonly SkillDefinition[];
    readonly task: string;
    readonly retrieval?: RetrievalResult;
    readonly context?: SkillExecutionContext;
    readonly repairBudget?: RepairBudget;
    readonly signal?: AbortSignal;
}): Promise<GraphExecutionResult>;
//# sourceMappingURL=executor.d.ts.map