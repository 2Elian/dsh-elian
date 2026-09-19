import { hopDistance, replaceGraph } from './graph.ts'
import type { RepairBudget, RepairFailure, RepairOperator, RepairResult, SkillDefinition, SkillEdge, SkillGraph, SkillNode } from './types.ts'

/** Local, bounded implementation of GraSP's five repair operators. */
export function repairSkillGraph(
  graph: SkillGraph,
  failure: RepairFailure,
  skills: readonly SkillDefinition[],
  budget: RepairBudget = {},
): RepairResult {
  const maxHops = budget.maxHops ?? 2
  const node = graph.nodes.find(item => item.id === failure.nodeId)
  if (node === undefined) return unsuccessful(graph, 'failed node is not present')
  const operators: Array<[RepairOperator, () => SkillGraph | undefined]> = [
    ['REBIND', () => rebind(graph, node, failure)],
    ['INSERT_PREREQ', () => insertPrerequisite(graph, node, failure, skills, maxHops)],
    ['SUBSTITUTE', () => substitute(graph, node, skills)],
    ['REWIRE', () => rewire(graph, node, maxHops)],
    ['BYPASS', () => bypass(graph, node, failure)],
  ]
  for (const [operator, attempt] of operators) {
    const candidate = attempt()
    if (candidate !== undefined) return { operator, graph: candidate, repaired: true }
  }
  return unsuccessful(graph, 'no bounded repair operator produced a valid graph')
}

function rebind(graph: SkillGraph, node: SkillNode, failure: RepairFailure): SkillGraph | undefined {
  if (failure.missingFacts.length > 0) return undefined
  const updated = { ...node, args: { ...node.args, repairAttempt: true } }
  return replaceGraph(graph, graph.nodes.map(item => item.id === node.id ? updated : item), graph.edges)
}

function insertPrerequisite(graph: SkillGraph, node: SkillNode, failure: RepairFailure, skills: readonly SkillDefinition[], maxHops: number): SkillGraph | undefined {
  const candidate = skills.find(skill => failure.missingFacts.some(fact => skill.effects.includes(fact)))
  if (candidate === undefined || graph.nodes.some(item => item.skillId === candidate.id)) return undefined
  const inserted: SkillNode = { id: `repair-${candidate.id}`, skillId: candidate.id, args: {}, preconditions: candidate.preconditions, effects: candidate.effects, confidence: 0.5 }
  const edge: SkillEdge = { id: `repair-edge-${inserted.id}-${node.id}`, from: inserted.id, to: node.id, type: 'state', confidence: 0.5 }
  const near = graph.edges.some(item => item.from === node.id && hopDistance(graph, item.to, node.id, maxHops) !== undefined)
  return near || graph.nodes.length === 1 ? replaceGraph(graph, [...graph.nodes, inserted], [...graph.edges, edge]) : undefined
}

function substitute(graph: SkillGraph, node: SkillNode, skills: readonly SkillDefinition[]): SkillGraph | undefined {
  const replacement = skills.find(skill => skill.id !== node.skillId && skill.preconditions.every(fact => node.preconditions.includes(fact)) && skill.effects.some(fact => node.effects.includes(fact)))
  if (replacement === undefined) return undefined
  const updated = { ...node, skillId: replacement.id, preconditions: replacement.preconditions, effects: replacement.effects, confidence: Math.min(node.confidence, 0.5) }
  return replaceGraph(graph, graph.nodes.map(item => item.id === node.id ? updated : item), graph.edges)
}

function rewire(graph: SkillGraph, node: SkillNode, maxHops: number): SkillGraph | undefined {
  const incoming = graph.edges.filter(edge => edge.to === node.id && edge.from !== graph.sourceId)
  const outgoing = graph.edges.filter(edge => edge.from === node.id && edge.to !== graph.sinkId)
  if (incoming.length === 0 || outgoing.length === 0) return undefined
  const firstIncoming = incoming[0]
  const firstOutgoing = outgoing[0]
  if (firstIncoming === undefined || firstOutgoing === undefined) return undefined
  const distance = hopDistance(graph, firstIncoming.from, firstOutgoing.to, maxHops)
  if (distance === undefined) return undefined
  const without = graph.edges.filter(edge => edge.to !== node.id && edge.from !== node.id)
  return replaceGraph(graph, graph.nodes.filter(item => item.id !== node.id), without)
}

function bypass(graph: SkillGraph, node: SkillNode, failure: RepairFailure): SkillGraph | undefined {
  if (failure.missingFacts.length > 0) return undefined
  const incoming = graph.edges.filter(edge => edge.to === node.id && edge.from !== graph.sourceId)
  const outgoing = graph.edges.filter(edge => edge.from === node.id && edge.to !== graph.sinkId)
  if (incoming.length === 0 || outgoing.length === 0) return undefined
  const bypassEdges = incoming.flatMap(left => outgoing.map(right => ({ id: `bypass-${left.from}-${right.to}`, from: left.from, to: right.to, type: 'order' as const, confidence: 0.25 })))
  return replaceGraph(graph, graph.nodes.filter(item => item.id !== node.id), [...graph.edges.filter(edge => edge.to !== node.id && edge.from !== node.id), ...bypassEdges])
}

function unsuccessful(graph: SkillGraph, reason: string): RepairResult {
  return { operator: 'BYPASS', graph, repaired: false, reason }
}
