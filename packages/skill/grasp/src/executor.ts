import { topologicalOrder } from './graph.ts'
import { repairSkillGraph } from './repair.ts'
import { routeByConfidence } from './router.ts'
import type { GraphExecutionResult, ExecutionEvent, RepairBudget, SkillDefinition, SkillExecutionContext, SkillGraph, RetrievalResult, Route, SkillNode } from './types.ts'

/** Execute a compiled graph with precondition checks, postcondition verification, and local repair. */
export async function executeSkillGraph(options: {
  readonly graph: SkillGraph
  readonly skills: readonly SkillDefinition[]
  readonly task: string
  readonly retrieval?: RetrievalResult
  readonly context?: SkillExecutionContext
  readonly repairBudget?: RepairBudget
  readonly signal?: AbortSignal
}): Promise<GraphExecutionResult> {
  let graph = options.graph
  const route: Route = options.retrieval === undefined ? 'graph-repair' : routeByConfidence(options.retrieval)
  const context: SkillExecutionContext = options.context ?? createContext(options.task, options.signal)
  const events: ExecutionEvent[] = []
  const completed: string[] = []
  const byId = new Map(options.skills.map(skill => [skill.id, skill]))
  let order: string[]
  try { order = topologicalOrder(graph) } catch (error) { return { ok: false, route, completed, events: [{ type: 'fallback', reason: String(error) }], graph } }
  let attempts = 0
  for (const nodeId of order) {
    if (context.signal?.aborted === true) throw context.signal.reason
    const node = graph.nodes.find(item => item.id === nodeId) as SkillNode
    const skill = byId.get(node.skillId)
    if (skill === undefined) return { ok: false, route, completed, failedNode: node.id, events: [...events, { type: 'node-failure', nodeId: node.id, reason: `skill ${node.skillId} is unavailable` }], graph }
    events.push({ type: 'node-start', nodeId: node.id, skillId: node.skillId })
    const missing = node.preconditions.filter(fact => !context.state.has(fact))
    if (missing.length > 0) {
      const repaired = repairSkillGraph(graph, { nodeId: node.id, reason: 'precondition failed', missingFacts: missing }, options.skills, options.repairBudget)
      events.push({ type: 'repair', nodeId: node.id, operator: repaired.operator, repaired: repaired.repaired })
      if (!repaired.repaired || route === 'reactive') return { ok: false, route, completed, failedNode: node.id, events: [...events, { type: 'node-failure', nodeId: node.id, reason: `missing preconditions: ${missing.join(', ')}` }], graph }
      graph = repaired.graph
      attempts += 1
      if (attempts > (options.repairBudget?.maxAttempts ?? 3)) return { ok: false, route, completed, failedNode: node.id, events, graph }
      continue
    }
    const result = await skill.execute(node.args, context)
    for (const fact of result.removedFacts ?? []) context.state.delete(fact)
    for (const fact of result.addedFacts ?? []) context.state.add(fact)
    for (const [key, value] of Object.entries(result.data ?? {})) context.data.set(key, value)
    const verification = skill.verify === undefined ? { ok: result.ok, ...(result.error === undefined ? {} : { reason: result.error }) } : await skill.verify(result, context)
    if (!result.ok || !verification.ok) {
      const reason = verification.reason ?? result.error ?? 'postcondition verification failed'
      events.push({ type: 'node-failure', nodeId: node.id, reason })
      const repaired = repairSkillGraph(graph, { nodeId: node.id, reason, missingFacts: verification.missingEffects ?? [] }, options.skills, options.repairBudget)
      events.push({ type: 'repair', nodeId: node.id, operator: repaired.operator, repaired: repaired.repaired })
      if (!repaired.repaired || route === 'reactive') return { ok: false, route, completed, failedNode: node.id, events, graph }
      graph = repaired.graph
      continue
    }
    for (const fact of node.effects) context.state.add(fact)
    completed.push(node.id)
    events.push({ type: 'node-success', nodeId: node.id, effects: node.effects })
  }
  return { ok: true, route, completed, events, graph }
}

function createContext(task: string, signal: AbortSignal | undefined): SkillExecutionContext {
  return signal === undefined
    ? { state: new Set(), data: new Map(), task }
    : { state: new Set(), data: new Map(), signal, task }
}
