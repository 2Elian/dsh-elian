/**
 * Bank loading, integrity gating, and round selection.
 *
 * The bank is validated once at plugin load. An invalid problem is reported and
 * excluded rather than taking the host down with it, because one bad entry in a
 * content file must not disable every session; an empty valid bank is a
 * packaging failure and throws.
 *
 * @module catalog
 */

import { THEMES, validateProblem } from './problem-schema.js'
import { problems as agentLoop } from './problems/agent-loop.js'
import { problems as contextPrompt } from './problems/context-prompt.js'
import { problems as eventStream } from './problems/event-stream.js'
import { problems as llmGateway } from './problems/llm-gateway.js'
import { problems as subagentSkill } from './problems/subagent-skill.js'
import { problems as toolExecution } from './problems/tool-execution.js'

/** Every problem the package ships, before integrity gating. */
const RAW_BANK = [
  ...agentLoop,
  ...contextPrompt,
  ...eventStream,
  ...llmGateway,
  ...subagentSkill,
  ...toolExecution,
]

/**
 * Report duplicate ids and titles, which validation cannot see from one problem.
 * @param problems - the whole bank.
 * @returns one message per duplicate occurrence.
 */
function findDuplicates(problems) {
  const errors = []
  const seenIds = new Map()
  const seenTitles = new Map()
  problems.forEach((problem, index) => {
    const at = problem?.id ?? `#${index}`
    if (seenIds.has(problem?.id)) errors.push(`id "${problem.id}" 在 #${seenIds.get(problem?.id)} 与 ${at} 重复`)
    else seenIds.set(problem?.id, index)
    if (seenTitles.has(problem?.title)) errors.push(`title "${problem.title}" 在 #${seenTitles.get(problem?.title)} 与 ${at} 重复`)
    else seenTitles.set(problem?.title, index)
  })
  return errors
}

/**
 * Validate the shipped bank and split it into admissible problems and reports.
 * @param raw - the unvalidated bank; defaults to the shipped one.
 * @returns `{ problems, reports }` with one report per rejected entry.
 */
export function gateBank(raw = RAW_BANK) {
  const reports = []
  const problems = []
  for (const problem of raw) {
    if (problem === null || typeof problem !== 'object') {
      reports.push({ id: String(problem), errors: ['题目必须是一个对象'] })
      continue
    }
    const errors = validateProblem(problem)
    if (errors.length > 0) reports.push({ id: problem.id ?? '(无 id)', errors })
    else problems.push(problem)
  }
  for (const message of findDuplicates(raw)) reports.push({ id: 'bank', errors: [message] })
  return { problems, reports }
}

/** The validated bank, computed once per module instance. */
const GATED = gateBank()

/** Every admissible problem, in file order. */
export const PROBLEMS = GATED.problems

/** Integrity reports for rejected entries; the plugin logs these at load. */
export const BANK_REPORTS = GATED.reports

if (PROBLEMS.length === 0) {
  throw new Error('ts-learn: 题目库为空，插件无法工作（详见 scripts/verify-problems.mjs 的报告）')
}

/** Lookup by problem id. */
const BY_ID = new Map(PROBLEMS.map(problem => [problem.id, problem]))

/**
 * Find one problem by id.
 * @param id - the problem id.
 * @returns the problem, or `undefined`.
 */
export function findProblem(id) {
  return BY_ID.get(id)
}

/** Every theme that currently has at least one problem, with its label. */
export function availableThemes() {
  const present = new Set(PROBLEMS.map(problem => problem.theme))
  return Object.entries(THEMES)
    .filter(([theme]) => present.has(theme))
    .map(([theme, label]) => ({ theme, label }))
}

/**
 * Choose the next problem for a learner.
 *
 * Recency is the first filter: when any problem falls outside the recent
 * window it is preferred, so a learner never sees the same题 twice in a row
 * while the bank has variety left. The theme filter then narrows that pool.
 *
 * @param options - selection inputs.
 * @param options.recentIds - ids already served to this agent, most recent last.
 * @param options.theme - optional theme to restrict the round to.
 * @param options.rng - random source in `[0, 1)`; injectable for tests.
 * @returns the chosen problem, or `undefined` when the theme has no problem.
 */
export function pickProblem({ recentIds = [], theme, rng = Math.random } = {}) {
  const pool = theme === undefined ? PROBLEMS : PROBLEMS.filter(problem => problem.theme === theme)
  if (pool.length === 0) return undefined
  const recent = new Set(recentIds.slice(-Math.max(0, pool.length - 1)))
  const fresh = pool.filter(problem => !recent.has(problem.id))
  const candidates = fresh.length > 0 ? fresh : pool
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length))
  return candidates[index]
}
