#!/usr/bin/env node
/**
 * Check one authoring file (or the whole shipped bank) against the problem
 * contract and against the real runner.
 *
 * Usage:
 *   node scripts/check-bank.mjs                                  # whole bank
 *   node scripts/check-bank.mjs lib/problems/tool-execution.js   # one file
 *   node scripts/check-bank.mjs --no-run <file>                  # contract only
 */
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkBank, formatReport } from './lib/bank-check.mjs'

const PACKAGE = resolve(import.meta.dirname, '..', 'plugins', 'ts-learn', 'src')
const WORK_ROOT = resolve(import.meta.dirname, '..', '.ts-learn-work')

const args = process.argv.slice(2)
const behavioural = !args.includes('--no-run')
const files = args.filter(arg => !arg.startsWith('--'))

/**
 * Collect every problem a module exports as a `problems` array, or as a bare
 * default array, so one authoring file is checkable on its own.
 * @param module - the imported module namespace.
 * @param label - file label for error messages.
 * @returns the collected problems.
 */
function collect(module, label) {
  if (Array.isArray(module.problems)) return module.problems
  if (Array.isArray(module.default)) return module.default
  throw new Error(`${label}: 没有导出名为 problems 的数组`)
}

let problems = []
let label = '整库（catalog.js）'
if (files.length === 0) {
  const catalog = await import(pathToFileURL(resolve(PACKAGE, 'catalog.js')).href)
  problems = catalog.PROBLEMS
} else {
  label = files.map(file => file.replace(/\\/g, '/').split('/').pop()).join(', ')
  for (const file of files) {
    const target = resolve(process.cwd(), file)
    const module = await import(pathToFileURL(target).href)
    problems.push(...collect(module, file))
  }
}

const result = await checkBank(problems, { workRoot: WORK_ROOT, behavioural })
process.stdout.write(formatReport(result, label))
process.exitCode = result.ok ? 0 : 1
