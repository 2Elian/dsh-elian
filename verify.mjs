/**
 * End-to-end verification for this repository. Runs the built plugin against a
 * stub skill registry — no DeepSeek Harness checkout, no network, no API key:
 *
 *   pnpm build && node verify.mjs
 *
 * It checks the publish contract (bundle metadata, patch rows) and the four
 * tool actions against fixture skills, including the unsatisfiable-precondition
 * path that drives GraSP's bounded local repair.
 */
import { readFile, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
let failures = 0
let checks = 0

/**
 * Record one assertion.
 * @param condition - the assertion result.
 * @param label - what was asserted.
 */
function check(condition, label) {
  checks += 1
  if (condition) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}`)
  }
}

/**
 * Import one built package entry.
 * @param relative - path from the repository root.
 * @returns the imported module namespace.
 */
async function load(relative) {
  const path = join(root, relative)
  try {
    await stat(path)
  } catch {
    console.log(`missing build output: ${relative}\nrun \`pnpm build\` first`)
    process.exit(1)
  }
  return import(pathToFileURL(path).href)
}

/**
 * Build a stub skill registry and tool registry.
 * @param skills - skill summaries the registry reports.
 * @returns the stub context plus the registered tool definition.
 */
function stubContext(skills) {
  const state = { registered: [], disposed: [], effects: [], disposers: [] }
  const ctx = {
    logger: { info() {}, warn() {} },
    effect(run, label) {
      state.effects.push(label)
      const disposer = run()
      state.disposers.push(typeof disposer === 'function' ? disposer : () => {})
    },
    skills: {
      async list() { return skills },
      async get(name) { return skills.find(skill => skill.name === name) },
    },
    tools: {
      register(definition) {
        state.registered.push(definition)
        return () => { state.disposed.push(definition.name) }
      },
    },
  }
  return { ctx, state }
}

/**
 * A skill summary with a GraSP declaration.
 * @param name - skill name and graph fact prefix.
 * @param effects - facts the skill produces.
 * @param preconditions - facts the skill needs first.
 * @param description - routing description.
 * @returns the summary object the registry would return.
 */
function declared(name, effects, preconditions, description) {
  return {
    name,
    description: description ?? name,
    invocation: { modelInvocable: true, userInvocable: true },
    metadata: { grasp: { preconditions, effects } },
  }
}

console.log('1) publish contract')
{
  const manifest = JSON.parse(await readFile(join(root, 'plugins/grasp/package.json'), 'utf8'))
  const patchPath = manifest.dsh?.bundle?.patch
  check(Boolean(patchPath), 'plugin declares dsh.bundle.patch')
  check(manifest.files?.includes('cordis.patch.yml') === true, 'plugin ships cordis.patch.yml')
  const patch = await readFile(join(root, 'plugins/grasp', patchPath ?? 'cordis.patch.yml'), 'utf8')
  check(patch.includes('insert:'), 'patch declares an insert list')
  check(patch.includes(manifest.name), 'patch row names the plugin package')
  check(manifest.dependencies?.['@tt-a1i/dsh-skill-grasp'] !== undefined, 'plugin depends on the GraSP core')
  const core = JSON.parse(await readFile(join(root, 'packages/skill/grasp/package.json'), 'utf8'))
  check(core.name === '@tt-a1i/dsh-skill-grasp', 'core package is renamed out of the dsh scope')
  check(core.dependencies === undefined && core.peerDependencies === undefined, 'core stays dependency-free')
}

const plugin = await load('plugins/grasp/lib/index.js')
const core = await load('packages/skill/grasp/lib/index.js')

console.log('2) apply() and config validation')
{
  const { ctx, state } = stubContext([])
  plugin.apply(ctx, { topK: 4 })
  check(state.registered.length === 1, 'apply registers exactly one tool')
  check(state.registered[0]?.name === 'grasp', 'tool name is grasp')
  check(plugin.inject.includes('skills') && plugin.inject.includes('tools'), 'inject names both services')
  const { ctx: inert, state: inertState } = stubContext([])
  plugin.apply(inert, { enabled: false })
  check(inertState.registered.length === 0, 'enabled:false mounts the plugin inert')
  let threw = false
  try {
    plugin.resolveConfig({ topK: 'eight' })
  } catch (error) {
    threw = error instanceof TypeError
  }
  check(threw, 'malformed config throws a TypeError')
}

console.log('2b) unload removes the registration')
{
  const { ctx, state } = stubContext([])
  plugin.apply(ctx, {})
  check(state.registered.length === 1, 'tool registered before unload')
  for (const disposer of state.disposers) disposer()
  check(state.disposed.includes('grasp'), 'the effect disposer unregisters the tool')
}

console.log('3) the metadata bridge')
{
  const ok = plugin.readGraspMetadata({ grasp: { preconditions: ['a'], effects: ['b'] } })
  check(ok.declaration?.preconditions[0] === 'a' && ok.declaration?.effects[0] === 'b', 'reads metadata.grasp')
  check(plugin.readGraspMetadata({}).declaration === undefined, 'absent declaration returns undefined')
  check(plugin.readGraspMetadata({ grasp: { effects: 'nope' } }).problem !== undefined, 'malformed declaration reports a problem')
}

const CHAIN = [
  declared('repo-scan', ['repo-scanned'], [], 'scan the repository layout'),
  declared('deps-count', ['deps-counted'], ['repo-scanned'], 'count dependencies'),
  declared('report-compose', ['report-composed'], ['deps-counted'], 'compose the dependency report'),
]
const TASK = 'scan the repository and compose a dependency report'

/**
 * Apply the plugin to a stub registry and return the registered tool.
 * @param skills - skill summaries for this scenario.
 * @param config - plugin configuration.
 * @returns the registered tool definition.
 */
async function toolFor(skills, config) {
  const { ctx, state } = stubContext(skills)
  plugin.apply(ctx, config)
  return state.registered[0]
}

const exec = { signal: new AbortController().signal }

console.log('4) action catalog')
{
  const tool = await toolFor([...CHAIN, { name: 'misc-helper', description: 'unrelated helper' }, { name: 'user-only', description: 'user command', invocation: { modelInvocable: false, userInvocable: true } }], {})
  const report = await tool.execute({ action: 'catalog', task: TASK }, exec)
  check(report.catalog.total === 5, 'catalog counts every listed skill')
  check(report.catalog.included === 3, 'only declared model-invocable skills enter the graph')
  check(report.catalog.declared === 3, 'declared count is reported')
  check(report.catalog.skipped.some(row => row.name === 'misc-helper' && row.reason.includes('metadata.grasp')), 'undeclared skill is skipped with a reason')
  check(report.catalog.skipped.some(row => row.name === 'user-only' && row.reason === 'not model-invocable'), 'user-only skill is skipped with a reason')
  check(report.ok === true, 'catalog always reports ok')
}

console.log('5) action retrieve')
{
  const tool = await toolFor(CHAIN, { topK: 8 })
  const report = await tool.execute({ action: 'retrieve', task: TASK }, exec)
  check(report.selected.length > 0, 'retrieval selects candidates')
  check(report.selected.some(row => row.skill === 'repo-scan'), 'the task-relevant skill is selected')
  check(report.selected.every(row => typeof row.score === 'number'), 'every candidate carries a score')
  check(['reactive', 'graph', 'graph-repair'].includes(report.route), 'routing picks one of the three routes')
  check(report.executed === false, 'retrieve never executes')
}

console.log('6) action plan')
{
  const tool = await toolFor(CHAIN, {})
  const report = await tool.execute({ action: 'plan', task: TASK }, exec)
  check(report.steps.length === 3, 'three nodes compile into the plan')
  check(report.steps.map(step => step.skill)[0] === 'repo-scan', 'the fact chain orders repo-scan first')
  check(report.steps.map(step => step.skill).indexOf('report-compose') > report.steps.map(step => step.skill).indexOf('deps-count'), 'report-compose runs after deps-count')
  check(report.steps.every(step => step.ready), 'every step is ready once its producers precede it')
  check(report.unmet.length === 0, 'no unmet preconditions')
  check(report.ok === true, 'plan reports ok')
  check(report.steps.some(step => Array.isArray(step.dependsOn) && step.dependsOn.length > 0), 'state edges surface as dependsOn')
}

console.log('7) action run (rehearsal)')
{
  const tool = await toolFor(CHAIN, {})
  const report = await tool.execute({ action: 'run', task: TASK }, exec)
  check(report.executed === false, 'run never executes a skill')
  check(report.ok === true, 'the happy chain rehearses successfully')
  check(report.events.some(event => event.startsWith('scheduled')), 'events record scheduling')
  check(report.events.filter(event => event.startsWith('start')).length === 3, 'every node is scheduled once')
}

console.log('8) unsatisfiable precondition drives local repair')
{
  const tool = await toolFor([...CHAIN, declared('release-publish', ['release-published'], ['human-approved'], 'publish the release after human approval')], {})
  const report = await tool.execute({ action: 'run', task: 'scan the repository, compose the report, and publish the release' }, exec)
  check(report.selected.some(row => row.skill === 'release-publish'), 'the blocked skill is selected')
  check(report.unmet.includes('human-approved'), 'the unmet precondition is reported')
  check(report.ok === false, 'the run does not claim success')
  check(report.warnings.some(warning => warning.includes('could not be scheduled')), 'the blocked node is explained')
  check(report.events.some(event => event.startsWith('repair')), 'bounded repair was attempted')
  check(report.steps.some(step => step.ready === false), 'the blocked step is marked not ready')
}

console.log('9) includeUndeclaredSkills')
{
  const tool = await toolFor([...CHAIN, { name: 'misc-helper', description: 'unrelated helper' }], { includeUndeclaredSkills: true })
  const report = await tool.execute({ action: 'catalog', task: TASK }, exec)
  check(report.catalog.included === 4, 'undeclared skills join the graph when enabled')
  check(report.catalog.declared === 3, 'the declared count stays honest')
}

console.log('10) tool arguments are validated')
{
  const tool = await toolFor(CHAIN, {})
  const badAction = await tool.execute({ action: 'fly', task: TASK }, exec).then(() => false, error => error instanceof TypeError)
  check(badAction, 'unknown action throws a TypeError')
  const badTask = await tool.execute({ action: 'plan' }, exec).then(() => false, error => error instanceof TypeError)
  check(badTask, 'missing task throws a TypeError')
}

console.log('11) the core library is reachable and unmodified')
{
  check(typeof core.retrieveSkills === 'function', 'core exports retrieveSkills')
  check(typeof core.compileSkillGraph === 'function', 'core exports compileSkillGraph')
  check(typeof core.repairSkillGraph === 'function', 'core exports repairSkillGraph')
  const result = core.retrieveSkills(TASK, [
    { id: 'a', description: 'scan repository', preconditions: [], effects: ['x'], execute: async () => ({ ok: true }) },
  ])
  check(result.selected.length === 1, 'core retrieval works standalone')
}

console.log('')
if (failures > 0) {
  console.log(`${failures} of ${checks} checks failed`)
  process.exitCode = 1
} else {
  console.log(`all ${checks} checks passed`)
}
