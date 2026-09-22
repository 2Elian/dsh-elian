#!/usr/bin/env node
/**
 * Behavioural verification of the whole problem bank: every reference solution
 * must pass all of its own cases through the real runner, and every starter
 * template must fail at least one.
 */
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkBank, formatReport } from './lib/bank-check.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE = join(ROOT, 'plugins', 'ts-learn', 'src')

const { PROBLEMS } = await import(pathToFileURL(join(PACKAGE, 'catalog.js')).href)
const result = await checkBank(PROBLEMS, { workRoot: join(ROOT, '.ts-learn-work'), behavioural: true })

process.stdout.write(formatReport(result, `整库（${PROBLEMS.length} 道题，真实子进程执行）`))

const cases = PROBLEMS.reduce((total, problem) => total + problem.tests.length, 0)
const publicCases = PROBLEMS.reduce(
  (total, problem) => total + problem.tests.filter(test => test.public === true).length,
  0,
)
process.stdout.write(`执行规模：${PROBLEMS.length} 道题 / ${cases} 个用例（其中公开 ${publicCases} 个）\n`)
process.exitCode = result.ok ? 0 : 1
