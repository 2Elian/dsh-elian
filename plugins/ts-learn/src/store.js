/**
 * In-memory round state: one challenge per command invocation, the submissions
 * made against it, and the reviewing agent's report once it arrives.
 *
 * This state is deliberately process-local. A challenge is a live teaching
 * round bound to a live agent, not durable user data; losing it on restart
 * costs the learner a `/ts-learn` re-issue and nothing else. The LRU cap bounds
 * memory so a long-running host cannot accumulate abandoned rounds.
 *
 * @module store
 */

import { randomUUID } from 'node:crypto'

/** Round ids are opaque and only ever compared for equality. */
function nextId(prefix) {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

/**
 * One teaching round: the chosen problem, the agent it belongs to, and every
 * submission made through the browser page.
 */
export class Challenge {
  /**
   * @param options - round identity.
   * @param options.agent - the live agent whose UI received `/ts-learn`.
   * @param options.problem - the chosen problem.
   */
  constructor({ agent, problem }) {
    this.id = nextId('c')
    this.agent = agent
    this.agentId = String(agent?.id ?? 'unknown')
    this.problem = problem
    this.createdAt = Date.now()
    /** Ordered submissions, oldest first. */
    this.submissions = []
  }

  /** The most recent submission, or `undefined` before the first one. */
  get latest() {
    return this.submissions[this.submissions.length - 1]
  }

  /** How many submissions have been judged, which drives automatic hints. */
  get attempts() {
    return this.submissions.length
  }
}

/**
 * Process-local challenge registry with per-agent recency tracking.
 */
export class ChallengeStore {
  /**
   * @param options - bounds.
   * @param options.maxChallenges - LRU cap on retained rounds.
   * @param options.recentProblemWindow - how many recent problems an agent avoids repeating.
   */
  constructor({ maxChallenges, recentProblemWindow }) {
    this.maxChallenges = maxChallenges
    this.recentProblemWindow = recentProblemWindow
    /** @type {Map<string, Challenge>} insertion-ordered, used as the LRU. */
    this.challenges = new Map()
    /** @type {Map<string, { recentIds: string[], challengeId: string | null }>} */
    this.agents = new Map()
    /** Submission id → its round, so the reporting tool needs only the id. */
    this.submissionIndex = new Map()
  }

  /**
   * Per-agent bookkeeping, created on first contact.
   * @param agentId - session identity of the agent.
   * @returns the mutable agent record.
   */
  agentState(agentId) {
    let state = this.agents.get(agentId)
    if (state === undefined) {
      state = { recentIds: [], challengeId: null }
      this.agents.set(agentId, state)
    }
    return state
  }

  /**
   * Start a round on a specific problem.
   * @param options - `{ agent, problem }`.
   * @returns the new challenge.
   */
  create({ agent, problem }) {
    const challenge = new Challenge({ agent, problem })
    this.challenges.set(challenge.id, challenge)
    const state = this.agentState(challenge.agentId)
    state.challengeId = challenge.id
    state.recentIds = [...state.recentIds, problem.id].slice(-this.recentProblemWindow)
    this.evict()
    return challenge
  }

  /**
   * Find a round.
   * @param id - round id from the page URL.
   * @returns the challenge, or `undefined` when it was evicted or never existed.
   */
  get(id) {
    return this.challenges.get(id)
  }

  /** The agent's current round, if any. */
  currentFor(agentId) {
    const state = this.agents.get(agentId)
    return state?.challengeId === null || state?.challengeId === undefined
      ? undefined
      : this.challenges.get(state.challengeId)
  }

  /** Problem ids already served to one agent, most recent last. */
  recentFor(agentId) {
    return this.agents.get(agentId)?.recentIds ?? []
  }

  /**
   * Record a judged submission on a round.
   * @param challenge - the round.
   * @param submission - the judged submission record.
   * @returns the stored record.
   */
  record(challenge, submission) {
    challenge.submissions.push(submission)
    this.submissionIndex.set(submission.id, challenge)
    return submission
  }

  /**
   * Resolve the round a submission belongs to.
   * @param submissionId - the id the reviewing agent was given.
   * @returns the round, or `undefined` when it was evicted.
   */
  challengeForSubmission(submissionId) {
    return this.submissionIndex.get(submissionId)
  }

  /**
   * Attach the reviewing agent's report to the submission it describes.
   * @param challenge - the round.
   * @param submissionId - the submission the report names.
   * @param review - the agent's structured review.
   * @returns whether a submission matched.
   */
  attachReview(challenge, submissionId, review) {
    const submission = challenge.submissions.find(item => item.id === submissionId)
    if (submission === undefined) return false
    submission.review = review
    return true
  }

  /** Keep the map within its cap, oldest round first. */
  evict() {
    while (this.challenges.size > this.maxChallenges) {
      const oldest = this.challenges.keys().next().value
      const evicted = this.challenges.get(oldest)
      this.challenges.delete(oldest)
      for (const submission of evicted?.submissions ?? []) this.submissionIndex.delete(submission.id)
      for (const [agentId, state] of this.agents) {
        if (state.challengeId === oldest) state.challengeId = null
        if (state.challengeId === null) this.agents.delete(agentId)
      }
    }
  }
}

/**
 * Build one submission record.
 * @param options - submission inputs.
 * @param options.code - the learner's source.
 * @param options.scope - `'sample'` or `'full'`.
 * @param options.run - the runner outcome.
 * @returns the submission record.
 */
export function createSubmission({ code, scope, run }) {
  return {
    id: nextId('s'),
    code,
    scope,
    createdAt: Date.now(),
    run,
    review: null,
  }
}
