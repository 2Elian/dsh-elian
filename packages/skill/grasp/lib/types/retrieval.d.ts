import type { ExperienceRecord, Fact, RetrievalOptions, RetrievalResult, SkillCandidate, SkillDefinition } from './types.ts';
/** Retrieve skills with a deterministic lexical baseline and memory-conditioned fusion. */
export declare function retrieveSkills(task: string, skills: readonly SkillDefinition[], memory?: readonly ExperienceRecord[], options?: RetrievalOptions): RetrievalResult;
/** Extract the facts a candidate set can produce. */
export declare function candidateEffects(candidates: readonly SkillCandidate[]): Set<Fact>;
//# sourceMappingURL=retrieval.d.ts.map