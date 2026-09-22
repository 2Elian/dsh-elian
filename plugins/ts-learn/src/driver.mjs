/**
 * Isolated case driver for one ts-learn submission.
 *
 * The plugin copies this file into a fresh directory beside the learner's
 * `submission.ts` and a generated `cases.json`, then runs it with the current
 * Node binary. It never imports the plugin, so nothing here can reach the host
 * process; its only output channel is stdout.
 *
 * The marker literal is duplicated from `runner.js` on purpose: this file is
 * copied away from the package and must stay self-contained.
 *
 * @module driver
 */

import { readFile } from 'node:fs/promises'

const MARKER = '__TS_LEARN_RESULT__'

/**
 * Canonical, key-sorted, type-tagged rendering of a JSON-able value.
 * Two values are structurally equal exactly when their renderings match.
 * @param value - any value a learner's function may return.
 * @returns the canonical rendering.
 */
function stable(value) {
  if (value === undefined) return 'undefined'
  if (value === null) return 'null'
  const type = typeof value
  if (type === 'number') return `n:${Object.is(value, -0) ? '0' : String(value)}`
  if (type === 'string') return `s:${JSON.stringify(value)}`
  if (type === 'boolean') return `b:${String(value)}`
  if (type === 'bigint') return `i:${String(value)}`
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (type === 'object') {
    if (value instanceof Map) {
      return `M{${[...value.entries()].map(([key, item]) => `${stable(key)}=>${stable(item)}`).sort().join(',')}}`
    }
    if (value instanceof Set) return `S{${[...value].map(stable).sort().join(',')}}`
    const keys = Object.keys(value).sort()
    return `{${keys.map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return `?:${String(value)}`
}

/** Multiset comparison for `compare: 'unordered'`: element order is ignored. */
function unorderedStable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).sort().join(',')}]`
  return stable(value)
}

/** Set comparison for `compare: 'set'`: order and duplicates are ignored. */
function setStable(value) {
  if (Array.isArray(value)) return `[${[...new Set(value.map(stable))].sort().join(',')}]`
  return stable(value)
}

/**
 * Compare an actual value against its expectation under one comparison mode.
 * @param actual - the learner's returned value.
 * @param expected - the case's expected value.
 * @param mode - `deep` (default), `unordered`, or `set`.
 * @returns whether the case passes.
 */
function matches(actual, expected, mode) {
  if (mode === 'unordered') return unorderedStable(actual) === unorderedStable(expected)
  if (mode === 'set') return setStable(actual) === setStable(expected)
  return stable(actual) === stable(expected)
}

/** Human-readable rendering of one value for the result panel. */
function display(value) {
  if (typeof value === 'string') return value
  if (value === undefined) return '(undefined)'
  if (typeof value === 'bigint') return `${String(value)}n`
  try {
    const text = JSON.stringify(value)
    return text === undefined ? String(value) : text
  } catch {
    return stable(value)
  }
}

/** Compact failure text: the message plus one frame in the learner's own file. */
function describe(error) {
  if (!(error instanceof Error)) return String(error)
  const message = `${error.name}: ${error.message}`
  const frame = (error.stack ?? '')
    .split('\n')
    .map(line => line.trim())
    .find(line => line.includes('submission.ts'))
  return frame === undefined ? message : `${message}\n    ${frame}`
}

/** Write one machine-readable frame on its own stdout line. */
function emit(frame) {
  process.stdout.write(`${MARKER}${JSON.stringify(frame)}\n`)
}

const cases = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'))

let module
try {
  module = await import('./submission.ts')
} catch (error) {
  emit({ kind: 'compile-error', message: describe(error) })
  process.exit(0)
}

const entry = module[cases.entry]
if (typeof entry !== 'function') {
  const exported = Object.keys(module).filter(name => name !== 'default')
  emit({
    kind: 'entry-missing',
    entry: cases.entry,
    message: `没有找到导出的函数 ${cases.entry}。当前导出了：${exported.length === 0 ? '（无）' : exported.join(', ')}`,
  })
  process.exit(0)
}

for (let index = 0; index < cases.tests.length; index += 1) {
  const test = cases.tests[index]
  const args = structuredClone(test.args ?? [])
  const startedAt = performance.now()
  let frame
  try {
    const actual = await entry(...args)
    const passed = matches(actual, test.expected, test.compare ?? 'deep')
    frame = {
      kind: 'case',
      index,
      name: test.name,
      passed,
      expected: display(test.expected),
      actual: display(actual),
      ms: Math.round((performance.now() - startedAt) * 1000) / 1000,
    }
  } catch (error) {
    frame = {
      kind: 'case',
      index,
      name: test.name,
      passed: false,
      expected: display(test.expected),
      actual: '（函数抛出异常）',
      error: describe(error),
      ms: Math.round((performance.now() - startedAt) * 1000) / 1000,
    }
  }
  emit(frame)
}

emit({ kind: 'done' })
