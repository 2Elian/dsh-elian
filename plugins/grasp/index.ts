/**
 * GraSP scratch plugin: one `grasp` tool that runs memory-conditioned
 * retrieval, typed DAG compilation, node verification, and local repair from
 * `@deepseek-ai/dsh-skill-grasp` over the demo workspace catalog.
 *
 * The library owns the five GraSP stages; this plugin supplies the four host
 * adapters it leaves open (skill catalog, experience records, execution
 * context, repair budget). A model-backed compiler replaces the deterministic
 * fallback at the `compileSkillGraph` call below.
 *
 * @module scratch-plugin/grasp
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, TOOL_RUNTIME_SCHEDULER } from '@deepseek-ai/dsh-tools'
import {
  compileSkillGraph,
  executeSkillGraph,
  retrieveSkills,
  routeByConfidence,
  topologicalOrder,
  type Fact,
  type GraphExecutionResult,
} from '@deepseek-ai/dsh-skill-grasp'
import { snapshotJsonValue, type JsonValue } from '@deepseek-ai/dsh-util-values'
import { createCatalog, experience, readArtifacts, type Scenario } from './catalog.ts'

/** Cordis plugin name. */
export const name = 'grasp'
/** Service the tool registration needs. */
export const inject = ['tools']

/** Plugin configuration, overridable from the patch overlay. */
export interface Config {
  /** Register the `grasp` tool. */
  enabled?: boolean
  /** Retrieval cutoff handed to `retrieveSkills`. */
  topK?: number
  /** Maximum graph hops a repair operator may touch. */
  maxHops?: number
  /** Maximum repair attempts before the run reports failure. */
  maxAttempts?: number
}

/** Validated plugin configuration. */
export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
  topK: z.number().default(8),
  maxHops: z.number().default(2),
  maxAttempts: z.number().default(3),
})

/** Canonical tool value, mirroring the declared output schema. */
interface GraspReport {
  action: string
  route: string
  confidence: number
  selected: string[]
  order: string[]
  ok: boolean
  completed: string[]
  events: string[]
  artifacts: JsonValue
  graph: JsonValue
  error?: string
}

/** Register the GraSP demo tool on `ctx.tools`. */
export function apply(ctx: Context, config: Config = {}): void {
  if (config.enabled === false) return
  if (process.env.DSH_GRASP_DIAGNOSE !== undefined) diagnoseToolPlane(ctx)
  const topK = config.topK ?? 8
  const repairBudget = { maxHops: config.maxHops ?? 2, maxAttempts: config.maxAttempts ?? 3 }
  ctx.tools.register(defineTool({
    name: 'grasp',
    description: [
      'Run the GraSP skill-graph loop over a workspace-inspection catalog.',
      'Use action "retrieve" to inspect retrieval scores, "plan" to compile the typed DAG without running it,',
      'and "run" to execute the graph with node verification and bounded local repair.',
    ].join(' '),
    parameters: {
      action: { type: 'string', required: true, enum: ['retrieve', 'plan', 'run'], description: 'How far to take the GraSP pipeline.' },
      task: { type: 'string', required: true, description: 'The task string retrieval and compilation are conditioned on.' },
      scenario: { type: 'string', enum: ['happy', 'missing-precondition', 'verify-failure'], description: 'Demo scenario; defaults to happy.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          route: { type: 'string', required: true },
          confidence: { type: 'number', required: true },
          selected: { type: 'array', required: true, items: { type: 'string' } },
          order: { type: 'array', required: true, items: { type: 'string' } },
          ok: { type: 'boolean', required: true },
          completed: { type: 'array', required: true, items: { type: 'string' } },
          events: { type: 'array', required: true, items: { type: 'string' } },
          artifacts: { type: 'json', required: true },
          graph: { type: 'json', required: true },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: renderReport(value) }],
    },
    async execute(args, exec) {
      const scenario: Scenario = args.scenario ?? 'happy'
      const cwd = exec.agent?.session.header.cwd ?? process.cwd()
      const base: GraspReport = {
        action: args.action,
        route: 'graph-repair',
        confidence: 0,
        selected: [],
        order: [],
        ok: false,
        completed: [],
        events: [],
        artifacts: {},
        graph: null,
      }
      try {
        const catalog = createCatalog({ cwd, scenario })
        const retrieval = retrieveSkills(args.task, catalog.skills, experience, { topK })
        base.route = routeByConfidence(retrieval)
        base.confidence = retrieval.confidence
        base.selected = retrieval.selected.map(candidate => candidate.skill.id)
        if (args.action === 'retrieve') return { ...base, ok: true }
        // Replace this call with a ctx.llm structured-output adapter to let a model
        // propose invocations, argument bindings, and typed edges.
        const graph = await compileSkillGraph({ task: args.task, candidates: retrieval.selected, goalFacts: catalog.goalFacts })
        base.order = topologicalOrder(graph)
        base.graph = toJson(graph)
        if (args.action === 'plan') return { ...base, ok: true }
        const context = { state: new Set<Fact>(), data: new Map<string, unknown>(), task: args.task, signal: exec.signal }
        const result = await executeSkillGraph({ graph, skills: catalog.skills, task: args.task, retrieval, context, repairBudget })
        return {
          ...base,
          ok: result.ok,
          completed: [...result.completed],
          events: result.events.map(renderEvent),
          artifacts: toJson(readArtifacts(context)),
          graph: toJson(result.graph),
          ...(result.failedNode === undefined ? {} : { error: `failed node: ${result.failedNode}` }),
        }
      } catch (error) {
        // Report a thrown failure (bad workspace path, graph validation, repair
        // rewrite) as this call's outcome so the reason stays visible in the
        // session instead of collapsing into an opaque tool failure.
        return { ...base, error: describeError(error) }
      }
    },
    presentCall: args => ({ card: 'generic', title: `GraSP ${args.action}`, kind: 'read', rawInput: args.task }),
  }))
}

function toJson(value: unknown): JsonValue {
  return snapshotJsonValue(value as JsonValue) ?? null
}

/**
 * Report which physical module graph this process loaded for the tools service
 * and whether the plugin's own `@deepseek-ai/dsh-tools` import shares its
 * symbol-keyed scheduler with the live service.
 * @param ctx - live application context the plugin was applied to.
 */
function diagnoseToolPlane(ctx: Context): void {
  const scheduler = (ctx.tools as unknown as Record<symbol, unknown>)[TOOL_RUNTIME_SCHEDULER]
  console.log('[grasp-diag] plugin module:', import.meta.url)
  console.log('[grasp-diag] tools via plugin scope:', import.meta.resolve('@deepseek-ai/dsh-tools'))
  console.log('[grasp-diag] scheduler reachable from plugin symbol:', scheduler !== undefined)
  void import('../../packages/core/tools/lib/index.js').then((built) => {
    const viaBuilt = (ctx.tools as unknown as Record<symbol, unknown>)[built.TOOL_RUNTIME_SCHEDULER]
    console.log('[grasp-diag] scheduler reachable from built symbol:', viaBuilt !== undefined)
  }, (error: unknown) => {
    console.log('[grasp-diag] built import failed:', String(error))
  })
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const frame = error.stack?.split('\n')[1]?.trim()
  return frame === undefined ? `${error.name}: ${error.message}` : `${error.name}: ${error.message} (${frame})`
}

function renderEvent(event: GraphExecutionResult['events'][number]): string {
  switch (event.type) {
    case 'node-start': return `start ${event.nodeId} (${event.skillId})`
    case 'node-success': return `success ${event.nodeId} -> ${event.effects.join(', ')}`
    case 'node-failure': return `failure ${event.nodeId}: ${event.reason}`
    case 'repair': return `repair ${event.nodeId}: ${event.operator} repaired=${event.repaired}`
    case 'fallback': return `fallback: ${event.reason}`
  }
}

function renderReport(value: GraspReport): string {
  const lines = [
    `GraSP ${value.action}`,
    `route: ${value.route} (retrieval confidence ${value.confidence.toFixed(3)})`,
    `selected: ${value.selected.join(', ') || '(none)'}`,
  ]
  if (value.order.length > 0) lines.push(`topological order: ${value.order.join(' -> ')}`)
  if (value.action === 'run') {
    lines.push(`completed: ${value.completed.join(', ') || '(none)'}`, `ok: ${value.ok}`)
    if (value.events.length > 0) lines.push('', 'events:', ...value.events.map(event => `- ${event}`))
    lines.push('', 'artifacts:', JSON.stringify(value.artifacts, null, 2))
  }
  if (value.error !== undefined) lines.push('', `error: ${value.error}`)
  return lines.join('\n')
}
