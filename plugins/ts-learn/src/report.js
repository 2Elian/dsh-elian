/**
 * The `ts_learn_report` tool: the structured channel the reviewing agent uses
 * to push its verdict back to the browser page.
 *
 * A tool rather than a hidden side channel, because the report is a real
 * model-visible contribution with an owner, a schema, and a logged call. The
 * tool returns once the report is attached; the page polls for it.
 *
 * @module report
 */

/** Bounds the page can render without truncating the layout. */
const LIMITS = Object.freeze({ summary: 400, rootCause: 600, hint: 300, nextStep: 300, maxHints: 4 })

/** Parameter schema shown to the model. */
const PARAMETERS = {
  type: 'object',
  properties: {
    submissionId: {
      type: 'string',
      description: 'ts-learn 提交评审请求里给出的 submissionId，必须原样回传。',
    },
    verdict: {
      type: 'string',
      enum: ['accepted', 'needs_work'],
      description: 'accepted = 全部用例通过且写法可接受；needs_work = 还需要修改。',
    },
    summary: {
      type: 'string',
      description: '一句话结论，面向 TypeScript 新手，会显示在页面顶部。',
    },
    rootCause: {
      type: 'string',
      description: '最关键的问题所在（哪一行、什么原因）。通过时可以省略。',
    },
    hints: {
      type: 'array',
      items: { type: 'string' },
      description: '1~4 条分步提示，从浅到深。第一次失败时不要直接给答案。',
    },
    nextStep: {
      type: 'string',
      description: '建议用户下一步做什么。',
    },
  },
  required: ['submissionId', 'verdict', 'summary'],
  additionalProperties: false,
}

/** Result schema shown to the model. */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    message: { type: 'string' },
    attempt: { type: 'integer' },
  },
  required: ['message', 'attempt'],
  additionalProperties: false,
}

/**
 * Clamp and normalize the model's report into the page-facing value.
 * @param args - validated tool arguments.
 * @returns the stored review.
 */
function normalizeReview(args) {
  const hints = (Array.isArray(args.hints) ? args.hints : [])
    .filter(hint => typeof hint === 'string' && hint.trim() !== '')
    .slice(0, LIMITS.maxHints)
    .map(hint => hint.slice(0, LIMITS.hint))
  return {
    verdict: args.verdict,
    summary: String(args.summary).slice(0, LIMITS.summary),
    rootCause: typeof args.rootCause === 'string' && args.rootCause.trim() !== ''
      ? args.rootCause.slice(0, LIMITS.rootCause)
      : null,
    hints,
    nextStep: typeof args.nextStep === 'string' && args.nextStep.trim() !== ''
      ? args.nextStep.slice(0, LIMITS.nextStep)
      : null,
    reportedAt: Date.now(),
  }
}

/**
 * Declare the reporting tool bound to one challenge store.
 *
 * @param store - the round registry the tool writes into.
 * @returns the tool definition for `ctx.tools.register`.
 */
export function createReportTool(store) {
  return {
    name: 'ts_learn_report',
    description: [
      '把对一次 ts-learn 提交的点评回传给练习页面。',
      'ts-learn 插件发来「提交评审」请求后，必须先自己在沙箱里复跑这份代码，',
      '然后用这个工具回传结论：页面只会展示这里的内容，写进聊天正文的点评不会出现在页面上。',
    ].join(''),
    parameters: PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: value.message }],
    },
    /**
     * Attach one review to the submission it names.
     * @param args - validated arguments.
     * @returns the confirmation shown back to the model.
     */
    async execute(args) {
      const challenge = store.challengeForSubmission(args.submissionId)
      if (challenge === undefined) {
        throw new Error(
          `ts-learn: 找不到提交 ${args.submissionId}（可能已被淘汰或插件重启）。`
          + '请把点评直接写在聊天正文里，并说明页面无法展示。',
        )
      }
      const submission = challenge.submissions.find(item => item.id === args.submissionId)
      if (submission === undefined) {
        throw new Error(`ts-learn: 提交 ${args.submissionId} 不在其所属的挑战里，请勿编造 submissionId。`)
      }
      const review = normalizeReview(args)
      store.attachReview(challenge, args.submissionId, review)
      const verdictLabel = review.verdict === 'accepted' ? '已通过' : '仍需修改'
      return {
        message: `已回传点评：${verdictLabel}（第 ${challenge.attempts} 次提交，${challenge.problem.title}）。页面会立刻显示。`,
        attempt: challenge.attempts,
      }
    },
  }
}
