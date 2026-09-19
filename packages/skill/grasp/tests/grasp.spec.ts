import { describe, expect, it } from 'vitest'
import { compileSkillGraph } from '../src/compiler.ts'
import { executeSkillGraph } from '../src/executor.ts'
import { createSkillGraph } from '../src/graph.ts'
import { retrieveSkills } from '../src/retrieval.ts'
import type { SkillDefinition } from '../src/types.ts'

function skill(id: string, description: string, preconditions: string[], effects: string[], body: (context: Parameters<SkillDefinition['execute']>[1]) => Promise<{ ok: boolean; addedFacts?: string[] }>): SkillDefinition {
  return { id, description, preconditions, effects, execute: async (_args, context) => body(context) }
}

describe('GraSP core', () => {
  it('fuses lexical retrieval with successful memory and exposes confidence features', () => {
    const skills = [skill('open', 'open a browser page', [], ['page-open'], async () => ({ ok: true }))]
    const result = retrieveSkills('open browser page', skills, [{ id: '1', task: 'open browser page', skills: ['open'], success: true }])
    expect(result.selected[0]?.skill.id).toBe('open')
    expect(result.features.memorySimilarity).toBeGreaterThan(0)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
  })

  it('compiles precondition effects into state edges and terminals', async () => {
    const skills = [
      skill('login', 'login', [], ['authenticated'], async () => ({ ok: true })),
      skill('fetch', 'fetch private data', ['authenticated'], ['data-ready'], async () => ({ ok: true })),
    ]
    const graph = await compileSkillGraph({ task: 'fetch', candidates: skills.map(skill => ({ skill })), goalFacts: ['data-ready'] })
    expect(graph.edges.some(edge => edge.type === 'state' && edge.from.includes('login') && edge.to.includes('fetch'))).toBe(true)
    expect(graph.edges.some(edge => edge.from === '__source__')).toBe(true)
    expect(graph.edges.some(edge => edge.to === '__sink__')).toBe(true)
  })

  it('executes nodes and records verification events', async () => {
    const open = skill('open', 'open', [], ['page-open'], async () => ({ ok: true }))
    const graph = createSkillGraph({
      nodes: [{ id: 'open-1', skillId: 'open', args: {}, preconditions: [], effects: ['page-open'], confidence: 1 }],
      edges: [
        { id: 'source', from: '__source__', to: 'open-1', type: 'order', confidence: 1 },
        { id: 'sink', from: 'open-1', to: '__sink__', type: 'order', confidence: 1 },
      ],
      goalFacts: ['page-open'],
    })
    const result = await executeSkillGraph({ graph, skills: [open], task: 'open' })
    expect(result.ok).toBe(true)
    expect(result.completed).toEqual(['open-1'])
    expect(result.events.some(event => event.type === 'node-success')).toBe(true)
  })
})
