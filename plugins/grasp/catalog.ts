/**
 * Demo skill catalog for the GraSP scratch plugin: workspace-inspection skills
 * whose facts chain into one report, plus two scenarios that drive the repair
 * and post-verification paths of `@deepseek-ai/dsh-skill-grasp`.
 *
 * @module scratch-plugin/grasp/catalog
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type {
  ExperienceRecord,
  Fact,
  SkillDefinition,
  SkillExecutionContext,
  SkillExecutionResult,
  VerificationResult,
} from '@deepseek-ai/dsh-skill-grasp'

/** Demo scenario; each one isolates a different GraSP stage. */
export type Scenario = 'happy' | 'missing-precondition' | 'verify-failure'

/** Inputs the catalog needs from the calling tool. */
export interface CatalogOptions {
  /** Workspace directory the inspection skills read. */
  readonly cwd: string
  /** Which failure mode to compose into the graph, if any. */
  readonly scenario: Scenario
}

/** A skill set plus the goal facts it is expected to produce. */
export interface Catalog {
  readonly skills: readonly SkillDefinition[]
  readonly goalFacts: readonly Fact[]
}

const MAX_LISTED_FILES = 25

/**
 * Memory records that bias retrieval toward the workspace-report chain.
 * A production deployment replaces these with session or trajectory projections.
 */
export const experience: readonly ExperienceRecord[] = [
  {
    id: 'demo-workspace-report',
    task: 'inspect the workspace and write a status report',
    skills: ['workspace.scan', 'workspace.metadata', 'deps.count', 'report.compose'],
    success: true,
  },
  {
    id: 'demo-scan-only',
    task: 'scan the workspace files',
    skills: ['workspace.scan'],
    success: true,
  },
]

/**
 * Build the demo catalog for one scenario.
 * @param options - workspace directory and scenario selection.
 * @returns The skills retrieval may select and the goal facts compilation targets.
 */
export function createCatalog(options: CatalogOptions): Catalog {
  const skills: SkillDefinition[] = [
    {
      id: 'workspace.scan',
      description: 'scan the workspace directory and list its top-level entries',
      preconditions: [],
      effects: ['workspace-scanned'],
      execute: (_args, context) => scanWorkspace(options.cwd, context),
    },
    {
      id: 'workspace.metadata',
      description: 'read workspace metadata from the package manifest',
      preconditions: ['workspace-scanned'],
      effects: ['metadata-collected'],
      execute: (_args, context) => collectMetadata(options.cwd, context),
    },
    {
      id: 'deps.count',
      description: 'count the declared dependencies in the workspace manifest',
      preconditions: ['metadata-collected'],
      effects: ['dependencies-counted'],
      execute: (_args, context) => countDependencies(context),
    },
    {
      id: 'report.compose',
      description: 'compose a markdown status report from the collected workspace facts',
      preconditions: ['dependencies-counted'],
      effects: ['report-ready'],
      execute: (_args, context) => composeReport(options.scenario, context),
      verify: (_result, context) => verifyReport(context),
    },
  ]
  if (options.scenario === 'missing-precondition') {
    skills.push({
      id: 'report.publish',
      description: 'publish the composed report after review approval',
      // `review-approved` has no producer in this catalog: execution reaches the
      // repair stage with a missing precondition, which is the point of the scenario.
      preconditions: ['report-ready', 'review-approved'],
      effects: ['report-published'],
      execute: () => Promise.resolve({ ok: true, addedFacts: ['report-published'] }),
    })
  }
  const goalFacts = options.scenario === 'missing-precondition' ? ['report-published'] : ['report-ready']
  return { skills, goalFacts }
}

/**
 * Read the artifacts a run stored, for the tool's model-facing summary.
 * @param context - execution context the skills wrote into.
 * @returns JSON-safe artifact values, absent keys as null.
 */
export function readArtifacts(context: SkillExecutionContext): Record<string, unknown> {
  return {
    files: context.data.get('workspace.files') ?? null,
    package: context.data.get('workspace.package') ?? null,
    dependencies: context.data.get('workspace.dependencies') ?? null,
    report: context.data.get('report.body') ?? null,
  }
}

async function scanWorkspace(cwd: string, context: SkillExecutionContext): Promise<SkillExecutionResult> {
  assertLive(context)
  const entries = readdirSync(cwd, { withFileTypes: true })
    .slice(0, MAX_LISTED_FILES)
    .map(entry => entry.isDirectory() ? `${entry.name}/` : entry.name)
    .sort()
  context.data.set('workspace.files', entries)
  return { ok: true, addedFacts: ['workspace-scanned'], data: { 'workspace.files': entries } }
}

async function collectMetadata(cwd: string, context: SkillExecutionContext): Promise<SkillExecutionResult> {
  assertLive(context)
  const manifest = readManifest(cwd)
  context.data.set('workspace.package', manifest)
  return { ok: true, addedFacts: ['metadata-collected'], data: { 'workspace.package': manifest } }
}

async function countDependencies(context: SkillExecutionContext): Promise<SkillExecutionResult> {
  assertLive(context)
  const manifest = context.data.get('workspace.package')
  const dependencies = isManifest(manifest) ? manifest.dependencies : 0
  context.data.set('workspace.dependencies', dependencies)
  return { ok: true, addedFacts: ['dependencies-counted'], data: { 'workspace.dependencies': dependencies } }
}

async function composeReport(scenario: Scenario, context: SkillExecutionContext): Promise<SkillExecutionResult> {
  assertLive(context)
  const files = context.data.get('workspace.files')
  const manifest = context.data.get('workspace.package')
  const dependencies = context.data.get('workspace.dependencies')
  const body = scenario === 'verify-failure'
    // Deliberately empty: `verify` rejects it, so the run ends on the
    // post-verification path instead of a successful node.
    ? ''
    : [
      '# Workspace report',
      '',
      `- entries listed: ${Array.isArray(files) ? files.length : 0}`,
      `- package: ${isManifest(manifest) ? `${manifest.name}@${manifest.version}` : '(no manifest)'}`,
      `- declared dependencies: ${typeof dependencies === 'number' ? dependencies : 0}`,
    ].join('\n')
  context.data.set('report.body', body)
  return { ok: true, addedFacts: ['report-ready'], data: { 'report.body': body } }
}

function verifyReport(context: SkillExecutionContext): VerificationResult {
  const body = context.data.get('report.body')
  return typeof body === 'string' && body.trim().length > 0
    ? { ok: true }
    : { ok: false, missingEffects: ['report-ready'], reason: 'report body is empty' }
}

/** One readable manifest summary, or null when the workspace has none. */
interface ManifestSummary {
  readonly name: string
  readonly version: string
  readonly dependencies: number
}

function isManifest(value: unknown): value is ManifestSummary {
  return typeof value === 'object' && value !== null && typeof (value as { dependencies?: unknown }).dependencies === 'number'
}

function readManifest(cwd: string): ManifestSummary | null {
  const path = join(cwd, 'package.json')
  if (!existsSync(path)) return null
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const manifest = parsed as { name?: unknown; version?: unknown; dependencies?: unknown; devDependencies?: unknown }
    return {
      name: typeof manifest.name === 'string' ? manifest.name : '(unnamed)',
      version: typeof manifest.version === 'string' ? manifest.version : '(unversioned)',
      dependencies: countKeys(manifest.dependencies) + countKeys(manifest.devDependencies),
    }
  } catch (_unreadableManifest) {
    // A malformed manifest is reported as absent; this demo skill only summarizes.
    return null
  }
}

function countKeys(value: unknown): number {
  return typeof value === 'object' && value !== null ? Object.keys(value).length : 0
}

function assertLive(context: SkillExecutionContext): void {
  if (context.signal?.aborted === true) throw context.signal.reason
}
