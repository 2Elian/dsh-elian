/**
 * The problem-bank contract: the accepted field set, validation, and the
 * learner-facing projection that keeps reference solutions and hidden cases off
 * the wire.
 *
 * The authoring rules this module enforces are written out in
 * `docs/PROBLEM_SCHEMA.md`; that document and this validator are the same
 * contract, and `scripts/verify-problems.mjs` runs both against the bank.
 *
 * @module problem-schema
 */

/** Agent-development directions a problem may teach. */
export const THEMES = Object.freeze({
  'agent-loop': 'Agent 循环',
  'llm-provider': 'LLM 调用与 Provider 适配',
  'tool-execution': '工具执行',
  'context-injection': '上下文注入',
  'system-prompt': 'System Prompt 设计与注入',
  skill: 'Skill 相关',
  gateway: 'Gateway 相关',
  'event-stream': '事件流相关',
  subagent: '子代理相关',
})

/** Accepted difficulty labels. */
export const DIFFICULTIES = Object.freeze(['easy', 'medium', 'hard'])

/** Accepted case-comparison modes. */
export const COMPARE_MODES = Object.freeze(['deep', 'unordered', 'set'])

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const ENTRY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/

/** Bounds the bank enforces, so one problem cannot dominate or undercook a round. */
export const LIMITS = Object.freeze({
  maxTitle: 24,
  minStory: 60,
  maxStory: 200,
  minTask: 80,
  maxTask: 300,
  minTests: 7,
  maxTests: 12,
  minPublicTests: 3,
  minHiddenTests: 4,
  minAlgorithms: 1,
  maxAlgorithms: 3,
  minKnowledge: 2,
  maxKnowledge: 4,
  minExamples: 2,
  maxExamples: 3,
  minConstraints: 2,
  maxConstraints: 5,
  minHints: 2,
  maxHints: 4,
})

/**
 * Count the top-level parameters a TypeScript signature declares.
 *
 * Generic arguments, nested function types, and object types all contain
 * commas, so the count tracks nesting depth instead of splitting naively. An
 * arrow function's `>` is skipped, because it closes no bracket. Returns
 * `null` when the signature has no parameter list, which makes the caller
 * report "cannot check" rather than "zero parameters".
 *
 * @param signature - one-line TypeScript function signature.
 * @returns the declared parameter count, or `null`.
 */
export function signatureArity(signature) {
  const open = signature.indexOf('(')
  if (open === -1) return null
  let depth = 0
  let close = -1
  for (let index = open; index < signature.length; index += 1) {
    const char = signature[index]
    if (char === '(' || char === '[' || char === '{' || char === '<') depth += 1
    else if (char === ')' || char === ']' || char === '}' || char === '>') {
      if (char === '>' && signature[index - 1] === '=') continue
      depth -= 1
      if (depth === 0) {
        close = index
        break
      }
    }
  }
  if (close === -1) return null
  const inner = signature.slice(open + 1, close).trim()
  if (inner === '') return 0
  let nesting = 0
  let count = 1
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index]
    if (char === '(' || char === '[' || char === '{' || char === '<') nesting += 1
    else if (char === ')' || char === ']' || char === '}' || char === '>') {
      if (!(char === '>' && inner[index - 1] === '=')) nesting -= 1
    } else if (char === ',' && nesting === 0) count += 1
  }
  return count
}

/**
 * Assert that one value is a JSON-able value with no lossy members.
 * @param value - candidate value.
 * @param path - dotted path used in the reported problem.
 * @param errors - accumulator receiving human-readable failures.
 */
function checkJsonValue(value, path, errors) {
  if (value === undefined) {
    errors.push(`${path}: 不允许 undefined`)
    return
  }
  if (value === null) return
  const type = typeof value
  if (type === 'number') {
    if (!Number.isFinite(value)) errors.push(`${path}: 不允许 NaN/Infinity`)
    if (!Number.isInteger(value) && !Number.isFinite(value)) errors.push(`${path}: 数字必须有限`)
    return
  }
  if (type === 'string' || type === 'boolean') return
  if (type !== 'object') {
    errors.push(`${path}: 不允许 ${type}`)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkJsonValue(item, `${path}[${index}]`, errors))
    return
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    errors.push(`${path}: 只允许纯对象`)
    return
  }
  for (const [key, item] of Object.entries(value)) checkJsonValue(item, `${path}.${key}`, errors)
}

/** Report tabs and trailing whitespace, which break the rendered layout. */
function checkProse(value, path, errors) {
  if (value.includes('\t')) errors.push(`${path}: 不允许制表符`)
  for (const line of value.split('\n')) {
    if (line !== line.trimEnd()) {
      errors.push(`${path}: 存在行尾空格`)
      break
    }
  }
}

/**
 * Validate one problem against the documented contract.
 * @param problem - candidate problem object.
 * @returns every violation found; empty means the problem is admissible.
 */
export function validateProblem(problem) {
  const errors = []
  if (problem === null || typeof problem !== 'object' || Array.isArray(problem)) {
    return ['题目必须是一个对象']
  }

  const requiredStrings = ['id', 'title', 'story', 'task', 'entry', 'signature', 'starter', 'solution']
  for (const field of requiredStrings) {
    if (typeof problem[field] !== 'string' || problem[field].trim() === '') {
      errors.push(`${field}: 必须是非空字符串`)
    }
  }
  if (errors.length > 0) return errors

  if (!ID_PATTERN.test(problem.id)) errors.push(`id: 必须是 kebab-case，得到 "${problem.id}"`)
  for (const field of ['title', 'story', 'task', 'starter', 'solution']) {
    checkProse(problem[field], field, errors)
  }
  for (const [field, min, max] of [
    ['title', 2, LIMITS.maxTitle],
    ['story', LIMITS.minStory, LIMITS.maxStory],
    ['task', LIMITS.minTask, LIMITS.maxTask],
  ]) {
    const length = [...problem[field]].length
    if (length < min || length > max) {
      errors.push(`${field}: 字数需要 ${min}~${max}，得到 ${length}`)
    }
  }
  if (!DIFFICULTIES.includes(problem.difficulty)) {
    errors.push(`difficulty: 必须是 ${DIFFICULTIES.join(' | ')}`)
  }
  if (!Object.hasOwn(THEMES, problem.theme)) {
    errors.push(`theme: 必须是 ${Object.keys(THEMES).join(' | ')} 之一`)
  }
  if (!ENTRY_PATTERN.test(problem.entry)) errors.push(`entry: 不是合法标识符`)
  if (!problem.signature.includes(problem.entry)) errors.push('signature: 必须包含 entry 名')
  if (!problem.starter.includes(problem.entry)) errors.push('starter: 必须包含 entry 名')
  if (!problem.solution.includes(problem.entry)) errors.push('solution: 必须包含 entry 名')
  if (!problem.starter.includes('export')) errors.push('starter: 必须导出 entry（含 export 关键字）')
  if (!problem.starter.includes('TODO')) errors.push('starter: 必须留下 // TODO 标记，学习者才知道从哪里写起')
  if (!problem.solution.includes('export')) errors.push('solution: 必须导出 entry（含 export 关键字）')

  if (Array.isArray(problem.knowledge)) {
    problem.knowledge.forEach((item, index) => {
      if (typeof item === 'string' && !/^[^：\n]{1,12}：\S/.test(item)) {
        errors.push(`knowledge[${index}]: 必须以「类型：内容」开头，例如 TypeScript：…`)
      }
    })
  }

  for (const [field, min, max] of [
    ['algorithms', LIMITS.minAlgorithms, LIMITS.maxAlgorithms],
    ['knowledge', LIMITS.minKnowledge, LIMITS.maxKnowledge],
    ['constraints', LIMITS.minConstraints, LIMITS.maxConstraints],
    ['hints', LIMITS.minHints, LIMITS.maxHints],
  ]) {
    const value = problem[field]
    if (!Array.isArray(value)) {
      errors.push(`${field}: 必须是数组`)
      continue
    }
    if (value.length < min || value.length > max) {
      errors.push(`${field}: 需要 ${min}~${max} 条，得到 ${value.length}`)
    }
    value.forEach((item, index) => {
      if (typeof item !== 'string' || item.trim() === '') {
        errors.push(`${field}[${index}]: 必须是非空字符串`)
        return
      }
      checkProse(item, `${field}[${index}]`, errors)
    })
  }

  if (!Array.isArray(problem.examples)) {
    errors.push('examples: 必须是数组')
  } else {
    const { minExamples, maxExamples } = LIMITS
    if (problem.examples.length < minExamples || problem.examples.length > maxExamples) {
      errors.push(`examples: 需要 ${minExamples}~${maxExamples} 条，得到 ${problem.examples.length}`)
    }
    problem.examples.forEach((example, index) => {
      if (example === null || typeof example !== 'object' || Array.isArray(example)) {
        errors.push(`examples[${index}]: 必须是对象`)
        return
      }
      for (const field of ['input', 'output', 'explain']) {
        if (typeof example[field] !== 'string' || example[field].trim() === '') {
          errors.push(`examples[${index}].${field}: 必须是非空字符串`)
          continue
        }
        checkProse(example[field], `examples[${index}].${field}`, errors)
      }
    })
  }

  if (!Array.isArray(problem.tests)) {
    errors.push('tests: 必须是数组')
    return errors
  }
  const { minTests, maxTests, minPublicTests, minHiddenTests } = LIMITS
  if (problem.tests.length < minTests || problem.tests.length > maxTests) {
    errors.push(`tests: 需要 ${minTests}~${maxTests} 个，得到 ${problem.tests.length}`)
  }
  let publicCount = 0
  problem.tests.forEach((test, index) => {
    const at = `tests[${index}]`
    if (test === null || typeof test !== 'object') {
      errors.push(`${at}: 必须是对象`)
      return
    }
    if (typeof test.name !== 'string' || test.name.trim() === '') errors.push(`${at}.name: 必须是非空字符串`)
    if (!Array.isArray(test.args)) errors.push(`${at}.args: 必须是数组`)
    else checkJsonValue(test.args, `${at}.args`, errors)
    if (!Object.hasOwn(test, 'expected')) errors.push(`${at}.expected: 缺失`)
    else checkJsonValue(test.expected, `${at}.expected`, errors)
    if (test.compare !== undefined && !COMPARE_MODES.includes(test.compare)) {
      errors.push(`${at}.compare: 必须是 ${COMPARE_MODES.join(' | ')} 之一`)
    }
    if (test.public === true) publicCount += 1
  })
  const arity = signatureArity(problem.signature)
  const hiddenCount = problem.tests.length - publicCount
  if (publicCount < minPublicTests) errors.push(`tests: 至少需要 ${minPublicTests} 个 public 用例，得到 ${publicCount}`)
  if (hiddenCount < minHiddenTests) errors.push(`tests: 至少需要 ${minHiddenTests} 个隐藏用例，得到 ${hiddenCount}`)

  if (arity === null) {
    errors.push('signature: 解析不出参数列表，无法核对用例参数个数')
  } else {
    problem.tests.forEach((test, index) => {
      if (Array.isArray(test?.args) && test.args.length !== arity) {
        errors.push(`tests[${index}].args: 有 ${test.args.length} 个参数，但 signature 声明了 ${arity} 个`)
      }
    })
  }

  return errors
}

/**
 * Build the projection the browser is allowed to see: no reference solution, no
 * hidden expectations, and only the public cases.
 * @param problem - a validated problem.
 * @returns the learner-facing problem view.
 */
export function problemForClient(problem) {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    theme: problem.theme,
    themeLabel: THEMES[problem.theme] ?? problem.theme,
    algorithms: [...problem.algorithms],
    story: problem.story,
    task: problem.task,
    entry: problem.entry,
    signature: problem.signature,
    starter: problem.starter,
    examples: problem.examples.map(example => ({ ...example })),
    constraints: [...problem.constraints],
    knowledge: [...problem.knowledge],
    hintCount: problem.hints.length,
    sampleCases: problem.tests
      .filter(test => test.public === true)
      .map(test => ({ name: test.name, args: test.args, expected: test.expected })),
    hiddenCaseCount: problem.tests.filter(test => test.public !== true).length,
  }
}

/**
 * Reduce one runner case record to what a browser may display.
 * @param record - a case record produced by the runner.
 * @param reveal - whether expectations and actual values may be shown.
 * @returns the displayable case record.
 */
export function caseForClient(record, reveal) {
  return {
    name: record.name,
    passed: record.passed,
    ms: record.ms,
    error: record.error,
    ...(reveal ? { expected: record.expected, actual: record.actual } : {}),
  }
}
