#!/usr/bin/env node
/**
 * End-to-end verification against the real runtime: this boots the actual
 * Cordis version the host ships, the actual `dsh-host-webserver` package built
 * in the checkout, stub `commands` / `tools` / `systemPrompt` services, and
 * this plugin — then drives the whole product over HTTP exactly as the browser
 * does, including a real submission executed in a child process.
 *
 * Stubs replace only services the plugin registers *into*; everything under
 * test (route matching, config resolution, judging, projection, message
 * construction, disposal) is the shipped code path.
 */
import { rm, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createChecker } from './lib/check.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE = join(ROOT, 'plugins', 'ts-learn')
const HARNESS = 'E:/Project/deepseek-harness'
const WORK_ROOT = join(ROOT, '.ts-learn-work')

const check = createChecker('3) 端到端：真实 Cordis + 真实 dsh-host-webserver + 真实提交执行')

/** The webserver package resolves its own cordis copy; reuse that identity. */
const cordis = await import(
  pathToFileURL(join(HARNESS, 'packages/host/webserver/node_modules/@deepseek-ai/cordis/lib/index.js')).href
)
const webserver = await import(pathToFileURL(join(HARNESS, 'packages/host/webserver/lib/index.js')).href)
const plugin = await import(pathToFileURL(join(PACKAGE, 'index.js')).href)
const { PROBLEMS } = await import(pathToFileURL(join(PACKAGE, 'src', 'catalog.js')).href)

const { Context, Service } = cordis

/** Records command definitions, standing in for the real command registry. */
class Commands extends Service {
  constructor(ctx) {
    super(ctx, 'commands')
    this.definitions = new Map()
  }

  register(definition) {
    if (this.definitions.has(definition.name)) throw new Error(`duplicate command ${definition.name}`)
    this.definitions.set(definition.name, definition)
    return () => this.definitions.delete(definition.name)
  }
}

/** Records tool definitions, standing in for the real tool registry. */
class Tools extends Service {
  constructor(ctx) {
    super(ctx, 'tools')
    this.definitions = new Map()
  }

  register(definition) {
    if (this.definitions.has(definition.name)) throw new Error(`duplicate tool ${definition.name}`)
    this.definitions.set(definition.name, definition)
    return () => this.definitions.delete(definition.name)
  }
}

/** Records prompt sections, standing in for the real system-prompt service. */
class SystemPrompt extends Service {
  constructor(ctx) {
    super(ctx, 'systemPrompt')
    this.sections = new Map()
  }

  section(section) {
    this.sections.set(section.name, section)
    return () => this.sections.delete(section.name)
  }
}

/** A stand-in for the live agent: records what the plugin hands it. */
function createFakeAgent() {
  const inbox = []
  return {
    id: 'test-agent',
    inbox,
    followup(message) {
      inbox.push(message)
    },
  }
}

/**
 * Boot one composition and load this plugin into it.
 * @param options - `{ withOptionalServices, config }`.
 * @returns the running harness.
 */
async function boot({ withOptionalServices = true, config = {} } = {}) {
  const app = new Context()
  await app.plugin(webserver.WebServer, { host: '127.0.0.1', port: 0, compression: 'none' })
  await app.plugin(Commands)
  if (withOptionalServices) {
    await app.plugin(Tools)
    await app.plugin(SystemPrompt)
  }
  const fiber = await app.plugin(plugin, {
    openBrowser: false,
    promptSection: true,
    workDir: WORK_ROOT,
    caseTimeoutMs: 4000,
    runTimeoutMs: 20000,
    ...config,
  })
  const port = app.get('webServer').port
  return { app, fiber, port }
}

/**
 * Call one endpoint and decode whatever comes back.
 * @param port - listening port.
 * @param path - absolute path.
 * @param options - `{ method, body, raw }`.
 * @returns `{ status, text, json, headers }`.
 */
async function call(port, path, { method = 'GET', body, raw } = {}) {
  const init = { method }
  if (raw !== undefined) {
    init.headers = { 'content-type': 'text/plain' }
    init.body = raw
  } else if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init)
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  return { status: response.status, text, json, headers: response.headers }
}

let harness
try {
  harness = await boot()
  const { app, fiber, port } = harness
  const commands = app.get('commands')
  const tools = app.get('tools')
  const prompt = app.get('systemPrompt')
  const agent = createFakeAgent()

  /* ── registrations ─────────────────────────────────────────────────────── */

  check.check(commands.definitions.has('ts-learn'), '全局命令 ts-learn 已注册')
  check.check(tools.definitions.has('ts_learn_report'), '可选工具 ts_learn_report 已注册')
  check.check(prompt.sections.has('plugin:ts-learn'), '可选提示段已贡献')
  check.check(prompt.sections.get('plugin:ts-learn')?.text.includes('ts_learn_report'), '提示段说明了回传工具')

  /* ── the command ───────────────────────────────────────────────────────── */

  const commandResult = await commands.definitions.get('ts-learn').handler({
    agent,
    rawInput: '',
    attachments: [],
    signal: new AbortController().signal,
  })
  check.equal(commandResult.kind, 'success', '命令返回 success')
  check.check(commandResult.text.includes('答题页面'), '命令结果给出答题页面地址')
  const challengeId = /[?&]c=([a-z0-9-]+)/.exec(commandResult.text)?.[1]
  check.check(typeof challengeId === 'string', '命令结果里的 URL 带回合 id')
  // The link must point at THIS host's listening port: a wrong port sends the
  // learner to whatever else happens to be listening there.
  const advertised = /https?:\/\/[^\s]+/.exec(commandResult.text)?.[0] ?? ''
  check.check(
    advertised.includes(`:${port}/`),
    '命令给出的 URL 用的是本进程实际监听的端口',
    `URL=${advertised} 而本进程监听 ${port}`,
  )

  /* ── page assets ───────────────────────────────────────────────────────── */

  const page = await call(port, '/ts-learn/')
  check.equal(page.status, 200, 'GET /ts-learn/ 返回 200')
  check.check(page.headers.get('content-type')?.startsWith('text/html'), '页面是 text/html')
  check.check(page.headers.get('content-security-policy')?.includes("script-src 'self'"), '页面带 CSP')
  check.check(page.text.includes('ts-learn'), '页面内容包含插件标识')
  check.check(!page.text.includes('{{PREFIX}}'), '页面里的 {{PREFIX}} 已被替换')

  const css = await call(port, '/ts-learn/app.css')
  check.equal(css.status, 200, 'GET app.css 返回 200')
  check.check(css.headers.get('content-type')?.startsWith('text/css'), 'CSS 的类型正确')
  const js = await call(port, '/ts-learn/app.js')
  check.equal(js.status, 200, 'GET app.js 返回 200')
  check.check(js.headers.get('content-type')?.startsWith('text/javascript'), 'JS 的类型正确')

  const health = await call(port, '/ts-learn/api/health')
  check.equal(health.status, 200, 'GET api/health 返回 200')
  check.equal(health.json.problemCount, PROBLEMS.length, 'health 报告题目数量')
  check.equal(health.json.themes.length, 9, 'health 报告 9 个方向')

  const missing = await call(port, '/ts-learn/nope')
  check.equal(missing.status, 404, '未知路径返回 404')
  const wrongMethod = await call(port, '/ts-learn/api/run')
  check.equal(wrongMethod.status, 404, '错误方法不被路由接受')

  /* ── challenge view ────────────────────────────────────────────────────── */

  const loaded = await call(port, '/ts-learn/api/challenge', { method: 'POST', body: { c: challengeId } })
  check.equal(loaded.status, 200, 'POST api/challenge 返回 200')
  const view = loaded.json.challenge
  check.equal(view.id, challengeId, '取回的是同一个回合')
  check.equal(view.attempts, 0, '新回合提交次数为 0')
  check.check(view.problem.starter.length > 0, '下发起始代码')
  check.check(view.problem.sampleCases.length >= 3, '下发样例用例')
  check.check(!JSON.stringify(view).includes('solution'), '下发内容里没有参考答案字段')
  check.check(view.problem.hintCount >= 2, '下发提示层数')
  check.check(view.problem.themeLabel.length > 0, '下发方向中文名')

  const unknownChallenge = await call(port, '/ts-learn/api/challenge', { method: 'POST', body: { c: 'c-nope' } })
  check.equal(unknownChallenge.status, 404, '未知回合返回 404')
  const missingChallenge = await call(port, '/ts-learn/api/challenge', { method: 'POST', body: {} })
  check.equal(missingChallenge.status, 400, '缺少回合 id 返回 400')

  /* ── self-check: starter fails, reference solution passes ──────────────── */

  const problem = PROBLEMS.find(item => item.id === view.problem.id)

  const starterRun = await call(port, '/ts-learn/api/run', {
    method: 'POST',
    body: { c: challengeId, code: view.problem.starter },
  })
  check.equal(starterRun.status, 200, '自测接口返回 200')
  check.equal(starterRun.json.result.ok, false, '起始模板在样例用例上不通过')
  check.check(starterRun.json.result.cases[0].expected !== undefined, '自测会展示期望值')

  const referenceRun = await call(port, '/ts-learn/api/run', {
    method: 'POST',
    body: { c: challengeId, code: problem.solution },
  })
  check.equal(referenceRun.json.result.ok, true, '参考实现通过全部样例用例')

  const emptyRun = await call(port, '/ts-learn/api/run', { method: 'POST', body: { c: challengeId, code: '   ' } })
  check.equal(emptyRun.status, 400, '空代码返回 400')

  const oversized = await call(port, '/ts-learn/api/run', {
    method: 'POST',
    body: { c: challengeId, code: 'x'.repeat(300000) },
  })
  check.equal(oversized.status, 413, '超长代码返回 413')

  const brokenRun = await call(port, '/ts-learn/api/run', {
    method: 'POST',
    body: { c: challengeId, code: 'export function broken( {' },
  })
  check.check(brokenRun.json.result.compileError !== null, '语法错误会作为编译错误回报')

  /* ── hints and the gated reference solution ────────────────────────────── */

  const hint = await call(port, '/ts-learn/api/hint', { method: 'POST', body: { c: challengeId, level: 1 } })
  check.equal(hint.json.hint.level, 1, '取到第一层提示')
  check.equal(hint.json.hint.total, problem.hints.length, '提示总层数与题库一致')
  check.check(hint.json.hint.text === problem.hints[0], '提示文本来自题库')
  const deepHint = await call(port, '/ts-learn/api/hint', { method: 'POST', body: { c: challengeId, level: 99 } })
  check.equal(deepHint.json.hint.level, problem.hints.length, '超范围的提示层数被夹到最后一层')

  const gated = await call(port, '/ts-learn/api/solution', { method: 'POST', body: { c: challengeId } })
  check.equal(gated.json.available, false, '未提交满 3 次时不给参考实现')

  /* ── submission, agent hand-off, review round-trip ─────────────────────── */

  const wrongCode = problem.starter
  const submit = await call(port, '/ts-learn/api/submit', {
    method: 'POST',
    body: { c: challengeId, code: wrongCode },
  })
  check.equal(submit.status, 200, '提交接口返回 200')
  check.equal(submit.json.result.ok, false, '错误答案判定为不通过')
  check.equal(submit.json.attempts, 1, '提交次数记为 1')
  check.equal(submit.json.handedOff, true, '提交已转交给 agent')
  check.check(typeof submit.json.submissionId === 'string', '提交返回 submissionId')
  check.equal(submit.json.result.cases.length, problem.tests.length, '提交跑完全部用例')
  check.check(
    submit.json.result.cases.some(item => item.expected === undefined),
    '隐藏用例不会把期望值下发给浏览器',
  )

  check.equal(agent.inbox.length, 1, 'agent 收到了评审请求')
  const handed = agent.inbox[0]
  check.equal(handed.role, 'user', '评审请求是 user 角色')
  check.equal(handed.source.kind, 'plugin', '评审请求来源是插件')
  check.equal(handed.source.plugin, 'dsh-plugin-ts-learn', '评审请求标明插件名')
  const handedText = handed.content[0].text
  check.check(handedText.includes(submit.json.submissionId), '评审请求带上 submissionId')
  check.check(handedText.includes(problem.entry), '评审请求说明要导出的函数名')
  check.check(handedText.includes('沙箱'), '评审请求要求 agent 在沙箱里复跑')
  check.check(handedText.includes('第 1 次提交'), '评审请求标注这是第几次提交')
  check.check(handedText.includes(problem.tests[problem.tests.length - 1].name), '评审请求附上隐藏用例供复跑')

  const pending = await call(port, '/ts-learn/api/review', {
    method: 'POST',
    body: { c: challengeId, s: submit.json.submissionId },
  })
  check.equal(pending.json.status, 'pending', '点评未回传时状态是 pending')

  const reportTool = tools.definitions.get('ts_learn_report')
  const reportResult = await reportTool.execute({
    submissionId: submit.json.submissionId,
    verdict: 'needs_work',
    summary: '思路对了，但边界没处理。',
    rootCause: '循环从 1 开始，漏掉了第 0 个元素。',
    hints: ['先看空数组会发生什么', '下标范围是 [0, n)'],
    nextStep: '把循环起点改成 0 再提交一次。',
  })
  check.check(reportResult.message.includes('仍需修改'), '工具回报写入成功')

  const ready = await call(port, '/ts-learn/api/review', {
    method: 'POST',
    body: { c: challengeId, s: submit.json.submissionId },
  })
  check.equal(ready.json.status, 'ready', '回传后状态是 ready')
  check.equal(ready.json.review.verdict, 'needs_work', '页面拿到 verdict')
  check.equal(ready.json.review.hints.length, 2, '页面拿到分步提示')
  check.equal(ready.json.review.summary, '思路对了，但边界没处理。', '页面拿到结论')

  const badReport = await call(port, '/ts-learn/api/review', {
    method: 'POST',
    body: { c: challengeId, s: 's-nope' },
  })
  check.equal(badReport.status, 404, '未知提交的点评查询返回 404')

  /* ── second submission passes and closes the loop ──────────────────────── */

  const goodSubmit = await call(port, '/ts-learn/api/submit', {
    method: 'POST',
    body: { c: challengeId, code: problem.solution },
  })
  check.equal(goodSubmit.json.result.ok, true, '参考实现提交后全部通过')
  check.equal(goodSubmit.json.attempts, 2, '提交次数累加到 2')
  check.equal(agent.inbox.length, 2, '第二次提交同样转交给了 agent')
  check.check(agent.inbox[1].content[0].text.includes('第 2 次提交'), '第二次评审请求标注第 2 次')

  /* ── new round on a requested theme ────────────────────────────────────── */

  const next = await call(port, '/ts-learn/api/new', {
    method: 'POST',
    body: { c: challengeId, theme: 'skill' },
  })
  check.equal(next.status, 200, '换题接口返回 200')
  check.equal(next.json.challenge.problem.theme, 'skill', '换题按指定方向出题')
  check.check(next.json.challenge.id !== challengeId, '换题产生新的回合 id')
  check.equal(next.json.challenge.attempts, 0, '新回合提交次数归零')

  /* ── command sub-commands ──────────────────────────────────────────────── */

  const handler = commands.definitions.get('ts-learn').handler
  const statusResult = await handler({ agent, rawInput: 'status', attachments: [], signal: new AbortController().signal })
  check.check(statusResult.text.includes(next.json.challenge.problem.title), 'status 显示当前题目')
  const hintResult = await handler({ agent, rawInput: 'hint', attachments: [], signal: new AbortController().signal })
  check.equal(hintResult.kind, 'success', '/ts-learn hint 返回 success')
  const themesResult = await handler({ agent, rawInput: 'themes', attachments: [], signal: new AbortController().signal })
  check.check(themesResult.text.includes('工具执行'), 'themes 列出方向')
  const themedResult = await handler({ agent, rawInput: 'theme:事件流', attachments: [], signal: new AbortController().signal })
  check.check(themedResult.kind === 'error' || themedResult.text.includes('事件流'), 'theme: 子命令被识别')
  const badResult = await handler({ agent, rawInput: 'wat', attachments: [], signal: new AbortController().signal })
  check.equal(badResult.kind, 'error', '未知子命令返回 error')

  /* ── disposal withdraws every registration ─────────────────────────────── */

  await fiber.dispose()
  check.check(!commands.definitions.has('ts-learn'), '卸载后命令消失')
  check.check(!tools.definitions.has('ts_learn_report'), '卸载后工具消失')
  check.check(!prompt.sections.has('plugin:ts-learn'), '卸载后提示段消失')
  const afterDispose = await call(port, '/ts-learn/')
  check.equal(afterDispose.status, 404, '卸载后路由不再匹配')
  await app.fiber.dispose()
  check.check(true, '整个应用可以正常关闭')

  /* ── optional services absent ──────────────────────────────────────────── */

  const lean = await boot({ withOptionalServices: false })
  check.check(lean.app.get('commands').definitions.has('ts-learn'), '没有 tools/systemPrompt 时命令仍然注册')
  const leanPage = await call(lean.port, '/ts-learn/')
  check.equal(leanPage.status, 200, '没有 tools/systemPrompt 时页面仍然可用')
  const leanAgent = createFakeAgent()
  const leanCommand = await lean.app.get('commands').definitions.get('ts-learn').handler({
    agent: leanAgent,
    rawInput: '',
    attachments: [],
    signal: new AbortController().signal,
  })
  check.equal(leanCommand.kind, 'success', '没有 tools/systemPrompt 时命令仍能出题')
  await lean.fiber.dispose()
  await lean.app.fiber.dispose()
  check.check(true, '精简组合也能正常关闭')
} catch (error) {
  check.check(false, '端到端流程未抛异常', error instanceof Error ? `${error.message}\n${error.stack}` : String(error))
} finally {
  await rm(WORK_ROOT, { recursive: true, force: true }).catch(() => {
    // Temp run directories are inert; failing verification over cleanup would
    // hide the result the operator is waiting for.
  })
}

process.exitCode = check.report() ? 0 : 1
void stat
