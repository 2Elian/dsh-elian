/**
 * Round orchestration: what happens when a learner starts a round, runs the
 * sample cases, submits, or asks for a hint.
 *
 * The slash command and the browser API are two front doors onto this one
 * service, so both entry points judge identically and neither can drift from
 * the other.
 *
 * @module rounds
 */

import { pickProblem } from './catalog.js'
import { runDeadlineMs } from './config.js'
import { buildHandoffMessage, buildReviewMessage } from './messages.js'
import { caseForClient, problemForClient } from './problem-schema.js'
import { runSubmission } from './runner.js'
import { createSubmission } from './store.js'

/** Public cases only, in bank order. */
function publicTests(problem) {
  return problem.tests.filter(test => test.public === true)
}

/**
 * Project one runner outcome for the browser.
 * @param run - the runner outcome.
 * @param revealAt - predicate deciding whether a case index may show values.
 * @returns the displayable result.
 */
function runView(run, revealAt) {
  return {
    ok: run.cases.length > 0 && run.cases.every(item => item.passed) && run.completed === true,
    completed: run.completed,
    timedOut: run.timedOut,
    compileError: run.compileError,
    entryMissing: run.entryMissing,
    elapsedMs: run.elapsedMs,
    passed: run.cases.filter(item => item.passed).length,
    total: run.cases.length,
    cases: run.cases.map(item => caseForClient(item, revealAt(item.index))),
    learnerOutput: run.learnerOutput,
    stderr: run.stderr,
  }
}

/**
 * The learner-facing view of one round.
 * @param challenge - the round.
 * @returns the view sent to the page.
 */
export function challengeView(challenge) {
  const latest = challenge.latest
  return {
    id: challenge.id,
    attempts: challenge.attempts,
    createdAt: challenge.createdAt,
    problem: problemForClient(challenge.problem),
    latest: latest === undefined
      ? null
      : {
        id: latest.id,
        scope: latest.scope,
        createdAt: latest.createdAt,
        run: runView(latest.run, index => challenge.problem.tests[index]?.public === true),
        review: latest.review,
      },
  }
}

/**
 * Build the round service.
 *
 * @param options - service inputs.
 * @param options.config - resolved plugin configuration.
 * @param options.store - the round registry.
 * @param options.log - `(level, message)` sink for non-fatal problems.
 * @returns the round service.
 */
export function createRoundService({ config, store, log }) {
  /**
   * Run one source string against a case subset.
   * @param challenge - the round supplying entry and cases.
   * @param tests - the cases to attempt.
   * @param source - the learner's source.
   * @returns the runner outcome.
   */
  function execute(challenge, tests, source) {
    return runSubmission({
      source,
      entry: challenge.problem.entry,
      tests,
      timeoutMs: runDeadlineMs(config, tests.length),
      workRoot: config.workDir,
      memoryMb: config.memoryMb,
    })
  }

  return {
    /**
     * Start a round on a freshly chosen problem.
     * @param options - `{ agent, theme }`.
     * @returns the new challenge.
     */
    start({ agent, theme }) {
      const problem = pickProblem({ recentIds: store.recentFor(String(agent?.id)), theme })
      if (problem === undefined) {
        throw new Error(theme === undefined ? 'ts-learn: 题目库为空' : `ts-learn: 没有 theme = ${theme} 的题目`)
      }
      return store.create({ agent, problem })
    },

    /**
     * Sample-case self-check. Deliberately not recorded as a submission, so
     * experimenting never costs the learner their attempt count.
     * @param challenge - the round.
     * @param source - the learner's source.
     * @returns the displayable result.
     */
    async runSample(challenge, source) {
      const tests = publicTests(challenge.problem)
      const run = await execute(challenge, tests, source)
      return runView(run, () => true)
    },

    /**
     * Judge a submission against every case and hand it to the reviewing agent.
     * @param options - `{ challenge, source }`.
     * @returns the displayable result plus the submission id.
     */
    async submit({ challenge, source }) {
      const run = await execute(challenge, challenge.problem.tests, source)
      const submission = store.record(challenge, createSubmission({ code: source, scope: 'full', run }))
      let handedOff = false
      let handoffError = null
      if (config.autoReview) {
        try {
          challenge.agent.followup(buildReviewMessage({ challenge, submission, run }))
          handedOff = true
        } catch (error) {
          handoffError = error instanceof Error ? error.message : String(error)
          log('warn', `ts-learn: 无法把提交转给 agent 点评：${handoffError}`)
        }
      }
      return {
        submissionId: submission.id,
        handedOff,
        handoffError,
        attempts: challenge.attempts,
        result: runView(run, index => challenge.problem.tests[index]?.public === true),
      }
    },

    /**
     * One progressive hint.
     * @param challenge - the round.
     * @param level - requested 1-based level.
     * @returns the clamped hint and whether deeper hints exist.
     */
    hint(challenge, level) {
      const hints = challenge.problem.hints
      const requested = Number.isSafeInteger(level) ? level : 1
      const index = Math.max(0, Math.min(hints.length - 1, requested - 1))
      return {
        level: index + 1,
        total: hints.length,
        text: hints[index],
        more: index + 1 < hints.length,
      }
    },

    /**
     * The reference implementation, gated so a learner must have tried first.
     * @param challenge - the round.
     * @returns the solution source, or a refusal reason.
     */
    solution(challenge) {
      const requiredAttempts = 3
      if (challenge.attempts < requiredAttempts) {
        return {
          available: false,
          reason: `先自己提交 ${requiredAttempts} 次再看参考实现（当前 ${challenge.attempts} 次）。`,
        }
      }
      return { available: true, solution: challenge.problem.solution }
    },

    /**
     * Ask the agent to explain the problem in chat.
     * @param challenge - the round.
     * @returns whether the request was delivered.
     */
    handoff(challenge) {
      challenge.agent.followup(buildHandoffMessage({ challenge }))
      return { ok: true }
    },
  }
}
