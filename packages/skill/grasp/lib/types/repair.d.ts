import type { RepairBudget, RepairFailure, RepairResult, SkillDefinition, SkillGraph } from './types.ts';
/** Local, bounded implementation of GraSP's five repair operators. */
export declare function repairSkillGraph(graph: SkillGraph, failure: RepairFailure, skills: readonly SkillDefinition[], budget?: RepairBudget): RepairResult;
//# sourceMappingURL=repair.d.ts.map