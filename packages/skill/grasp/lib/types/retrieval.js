const DEFAULT_TOP_K = 8;
const DEFAULT_MEMORY_WEIGHT = 0.35;
/** Retrieve skills with a deterministic lexical baseline and memory-conditioned fusion. */
export function retrieveSkills(task, skills, memory = [], options = {}) {
    const topK = options.topK ?? DEFAULT_TOP_K;
    const memoryWeight = Math.min(1, Math.max(0, options.memoryWeight ?? DEFAULT_MEMORY_WEIGHT));
    const taskTokens = tokens(task);
    const semantic = new Map();
    for (const skill of skills)
        semantic.set(skill.id, overlap(taskTokens, tokens(`${skill.id} ${skill.description}`)));
    const relevantMemory = memory
        .map(record => ({ record, score: record.similarity ?? overlap(taskTokens, tokens(record.task)) }))
        .sort((left, right) => right.score - left.score);
    const bestMemory = relevantMemory[0]?.score ?? 0;
    const memoryPrior = new Map();
    for (const item of relevantMemory.slice(0, 5)) {
        for (const skillId of item.record.skills)
            memoryPrior.set(skillId, Math.max(memoryPrior.get(skillId) ?? 0, item.score * (item.record.success ? 1 : 0.25)));
    }
    const scores = new Map();
    for (const skill of skills)
        scores.set(skill.id, (1 - memoryWeight) * (semantic.get(skill.id) ?? 0) + memoryWeight * (memoryPrior.get(skill.id) ?? 0));
    const ranked = [...skills].sort((left, right) => (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0) || left.id.localeCompare(right.id));
    const maxScore = Math.max(...scores.values(), 0);
    const minScore = options.minScore ?? 0;
    const selected = ranked.slice(0, topK).filter(skill => (scores.get(skill.id) ?? 0) >= minScore).map(skill => ({
        skill,
        score: scores.get(skill.id) ?? 0,
        source: (memoryPrior.has(skill.id) ? 'hybrid' : 'semantic'),
    }));
    const top = selected[0]?.score ?? 0;
    const second = selected[1]?.score ?? 0;
    const margin = top > 0 ? Math.max(0, (top - second) / top) : 0;
    const semanticDistribution = normalize([...semantic.values()]);
    const fusedDistribution = normalize([...scores.values()]);
    const agreement = 1 - jsDistance(semanticDistribution, fusedDistribution);
    const coverage = selected.length === 0 ? 0 : Math.min(1, selected.reduce((sum, candidate) => sum + candidate.skill.effects.length, 0) / Math.max(1, selected.length * 2));
    const confidence = Math.min(1, Math.max(0, 0.25 * Math.min(1, bestMemory) + 0.25 * agreement + 0.25 * margin + 0.25 * coverage));
    return {
        selected,
        skillScores: Object.fromEntries([...scores].map(([id, score]) => [id, score / Math.max(maxScore, 1)])),
        confidence,
        features: { memorySimilarity: bestMemory, distributionAgreement: agreement, topSkillMargin: margin, goalCoverage: coverage },
    };
}
function tokens(value) {
    return new Set(value.toLowerCase().split(/[^a-z0-9_]+/).filter(Boolean));
}
function overlap(left, right) {
    if (left.size === 0 || right.size === 0)
        return 0;
    let common = 0;
    for (const token of left)
        if (right.has(token))
            common += 1;
    return common / Math.sqrt(left.size * right.size);
}
function normalize(values) {
    const total = values.reduce((sum, value) => sum + value, 0);
    return total === 0 ? values.map(() => 0) : values.map(value => value / total);
}
function jsDistance(left, right) {
    const epsilon = 1e-12;
    const midpoint = left.map((value, index) => (value + (right[index] ?? 0)) / 2);
    const kl = (values, target) => values.reduce((sum, value, index) => value <= 0 ? sum : sum + value * Math.log(value / Math.max(target[index] ?? 0, epsilon)), 0);
    return Math.min(1, Math.max(0, (kl(left, midpoint) + kl(right, midpoint)) / (2 * Math.log(2))));
}
/** Extract the facts a candidate set can produce. */
export function candidateEffects(candidates) {
    return new Set(candidates.flatMap(candidate => candidate.skill.effects));
}
//# sourceMappingURL=retrieval.js.map