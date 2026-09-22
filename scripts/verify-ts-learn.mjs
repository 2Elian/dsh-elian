#!/usr/bin/env node
/**
 * Static verification: package layout, bundle patch, configuration, bank
 * integrity, learner-facing projection, round state, model-facing messages,
 * the runner's wire parsing, and the page assets.
 *
 * Nothing here spawns a subprocess or opens a port; `verify-problems.mjs` owns
 * real execution and `verify-http.mjs` owns the live HTTP surface.
 */
import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInContext, createContext } from 'node:vm'
import { createChecker } from './lib/check.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE = join(ROOT, 'plugins', 'ts-learn')
const WORK_ROOT = join(ROOT, '.ts-learn-work')

const check = createChecker('1) 静态检查（包结构、配置、题库、投影、消息、资源）')

/* ── package manifest ────────────────────────────────────────────────────── */

const manifest = JSON.parse(await readFile(join(PACKAGE, 'package.json'), 'utf8'))
check.equal(manifest.name, '@2elian/dsh-ts-learn', 'package.json name')
check.equal(manifest.type, 'module', 'type 是 module')
check.equal(manifest.dsh?.bundle?.patch, './cordis.patch.yml', '声明 dsh.bundle.patch')
check.equal(manifest.dependencies, undefined, '没有 dependencies（零依赖插件）')
check.equal(manifest.peerDependencies, undefined, '没有 peerDependencies（插件不 import cordis）')
check.check(manifest.files?.includes('cordis.patch.yml'), 'files 包含 cordis.patch.yml')
check.check(manifest.files?.includes('src'), 'files 包含 src')
check.equal(manifest.exports?.['.'], './index.js', 'exports["."] 指向入口')
check.check(manifest.exports?.['./cordis.patch.yml'] !== undefined, 'exports 暴露 cordis.patch.yml')
check.equal(manifest.publishConfig?.access, 'public', 'publishConfig.access = public')

const entry = await import(pathToFileURL(join(PACKAGE, manifest.main)).href)
check.equal(entry.name, 'ts-learn', '插件导出 name')
check.equal(entry.inject, ['commands', 'webServer'], '插件 inject 只要求必需服务')
check.check(typeof entry.apply === 'function', '插件导出 apply')
check.check((await stat(join(PACKAGE, manifest.main))).size > 0, '入口文件存在且非空')

/* ── bundle patch ────────────────────────────────────────────────────────── */

// Resolve a YAML parser from this repository first, then from the harness
// checkout. Parse the patch with the real parser rather than pattern-matching
// it: a patch that is not a valid YAML array fails at profile load, and that is
// exactly the failure this check exists to catch.
let yaml = null
for (const base of [join(ROOT, 'package.json'), 'E:/Project/deepseek-harness/package.json']) {
  try {
    const yamlPath = createRequire(base).resolve('js-yaml')
    const loaded = await import(pathToFileURL(yamlPath).href)
    yaml = loaded.default ?? loaded
    break
  } catch {
    // Try the next resolution base; the loop reports when none worked.
  }
}

if (yaml === null) {
  check.check(false, 'cordis.patch.yml 可解析', '找不到 js-yaml（本仓库或 dsh 检出里都没有）')
} else {
  const patch = yaml.load(await readFile(join(PACKAGE, 'cordis.patch.yml'), 'utf8'))
  check.check(Array.isArray(patch), 'cordis.patch.yml 是 YAML 数组')
  const rows = Array.isArray(patch) ? patch.flatMap(item => item?.insert ?? []) : []
  check.equal(rows.length, 1, 'patch 只插入一行')
  const row = rows[0] ?? {}
  check.equal(row.id, 'ts-learn', '插入行 id')
  check.equal(row.name, manifest.name, '插入行 name 等于包名（profile 能解析到）')
  check.check(row.config !== null && typeof row.config === 'object', '插入行带 config')

  const overlay = yaml.load(await readFile(join(PACKAGE, 'dev.overlay.yml'), 'utf8'))
  const overlayRow = Array.isArray(overlay) ? overlay.flatMap(item => item?.insert ?? [])[0] ?? {} : {}
  check.equal(overlayRow.id, 'ts-learn', 'dev.overlay.yml 插入行 id')
  check.check(
    typeof overlayRow.name === 'string' && overlayRow.name.startsWith('file:///'),
    'dev.overlay.yml 用绝对 file URL 命名 host 半（相对名可能被二次解析丢掉）',
  )
  check.check(
    overlayRow.name.endsWith('/plugins/ts-learn/index.js'),
    'dev.overlay.yml 指向本插件的入口',
  )
}

/* ── configuration ───────────────────────────────────────────────────────── */

const { CONFIG_DEFAULTS, resolveConfig, runDeadlineMs } = await import(pathToFileURL(join(PACKAGE, 'src', 'config.js')).href)

const defaults = resolveConfig(undefined)
check.equal(defaults.routePrefix, '/ts-learn', '默认 routePrefix')
check.check(defaults.workDir.length > 0, '默认 workDir 非空')
check.equal(defaults.openBrowser, true, '默认 openBrowser')
check.equal(defaults.autoReview, true, '默认 autoReview')

const throws = (fn) => {
  try {
    fn()
    return null
  } catch (error) {
    return error
  }
}

check.check(throws(() => resolveConfig({ nope: 1 })) !== null, '未知配置项会报错')
check.check(throws(() => resolveConfig({ openBrowser: 'yes' })) !== null, '布尔字段类型错误会报错')
check.check(throws(() => resolveConfig({ runTimeoutMs: -1 })) !== null, '非正整数会报错')
check.check(throws(() => resolveConfig({ routePrefix: 'ts-learn' })) !== null, 'routePrefix 必须以 / 开头')
check.check(throws(() => resolveConfig({ routePrefix: '/ts-learn/' })) !== null, 'routePrefix 不能以 / 结尾')
check.check(throws(() => resolveConfig({ caseTimeoutMs: 999999, runTimeoutMs: 1000 })) !== null, 'caseTimeoutMs 不得大于 runTimeoutMs')
check.check(throws(() => resolveConfig([])) !== null, 'config 必须是对象')

check.equal(runDeadlineMs(resolveConfig({ runTimeoutMs: 15000, caseTimeoutMs: 4000 }), 10), 15000, '多用例时用 runTimeoutMs 封顶')
check.equal(runDeadlineMs(resolveConfig({ runTimeoutMs: 15000, caseTimeoutMs: 4000 }), 1), 4000, '少用例时用 caseTimeoutMs 收紧')
check.equal(runDeadlineMs(resolveConfig({ runTimeoutMs: 15000, caseTimeoutMs: 4000 }), 0), 4000, '零用例也不会低于 1 个用例的下限')
check.check(Object.keys(CONFIG_DEFAULTS).length >= 10, '默认值表覆盖全部字段')

/* ── problem schema ──────────────────────────────────────────────────────── */

const schema = await import(pathToFileURL(join(PACKAGE, 'src', 'problem-schema.js')).href)

check.equal(schema.signatureArity('export function f(a: number, b: string): void'), 2, 'signatureArity 两个普通参数')
check.equal(schema.signatureArity('export function f(): void'), 0, 'signatureArity 零参数')
check.equal(schema.signatureArity('function f(a: Map<number, number>, b: () => number): void'), 2, 'signatureArity 跳过泛型与箭头函数里的逗号')
check.equal(schema.signatureArity('function f(o: { a: number, b: number }, c: number[]): void'), 2, 'signatureArity 跳过对象类型里的逗号')
check.equal(schema.signatureArity('function f(cb: (x: number, y: number) => number): void'), 1, 'signatureArity 嵌套箭头函数只算一个参数')
check.equal(schema.signatureArity('function f(a: number[], ...rest: string[]): void'), 2, 'signatureArity 含剩余参数')
check.equal(schema.signatureArity('no parameters here'), null, 'signatureArity 无参数列表返回 null')

const catalog = await import(pathToFileURL(join(PACKAGE, 'src', 'catalog.js')).href)

check.equal(catalog.PROBLEMS.length, 20, '题库共 20 道题')
check.equal(catalog.BANK_REPORTS.length, 0, '没有题目被契约校验剔除')
check.check(new Set(catalog.PROBLEMS.map(problem => problem.id)).size === 20, '题目 id 全局唯一')
check.check(new Set(catalog.PROBLEMS.map(problem => problem.title)).size === 20, '题目标题全局唯一')
check.check(catalog.PROBLEMS.every(problem => schema.validateProblem(problem).length === 0), '每道题都通过 validateProblem')
check.equal(catalog.availableThemes().length, 9, '九个 agent 开发方向都有题目')
check.check(
  catalog.availableThemes().every(theme => catalog.PROBLEMS.some(problem => problem.theme === theme.theme)),
  'availableThemes 与题库一致',
)

const mutated = structuredClone(catalog.PROBLEMS[0])
mutated.difficulty = 'impossible'
check.check(schema.validateProblem(mutated).length > 0, '非法 difficulty 会被拒绝')
const mutatedSignature = structuredClone(catalog.PROBLEMS[0])
mutatedSignature.tests[0].args = mutatedSignature.tests[0].args.slice(0, 1)
check.check(
  signatureArityMatches(schema, mutatedSignature) === false,
  '用例参数个数与 signature 不一致会被拒绝',
)

/**
 * Whether a tampered problem still passes the arity rule.
 * @param schemaModule - the problem-schema module.
 * @param problem - the tampered problem.
 * @returns whether validation passed.
 */
function signatureArityMatches(schemaModule, problem) {
  return schemaModule.validateProblem(problem).length === 0
}

/* ── catalog selection ───────────────────────────────────────────────────── */

const first = catalog.pickProblem({ rng: () => 0 })
check.check(first !== undefined && first.id === catalog.PROBLEMS[0].id, 'rng=0 时选第一道题')
const recent = catalog.PROBLEMS.slice(0, 19).map(problem => problem.id)
const last = catalog.pickProblem({ recentIds: recent, rng: () => 0 })
check.equal(last.id, catalog.PROBLEMS[19].id, '最近出过的题会被跳过')
check.equal(catalog.pickProblem({ theme: 'nope' }), undefined, '不存在的方向返回 undefined')
check.check(
  catalog.pickProblem({ theme: 'skill' }).theme === 'skill',
  '按方向选题只返回该方向',
)
check.equal(catalog.findProblem(catalog.PROBLEMS[3].id).id, catalog.PROBLEMS[3].id, 'findProblem 能按 id 取回题目')
check.equal(catalog.findProblem('missing'), undefined, 'findProblem 对未知 id 返回 undefined')

/* ── learner-facing projection ───────────────────────────────────────────── */

for (const problem of catalog.PROBLEMS) {
  const view = schema.problemForClient(problem)
  const serialized = JSON.stringify(view)
  if (serialized.includes(problem.solution)) {
    check.check(false, `${problem.id}: 投影里泄露了参考实现`)
    break
  }
  if (view.sampleCases.some(item => problem.tests.find(test => test.name === item.name)?.public !== true)) {
    check.check(false, `${problem.id}: 投影里出现了隐藏用例`)
    break
  }
}
check.check(true, '所有题目的投影都不含参考实现与隐藏用例')
check.check(
  catalog.PROBLEMS.every(problem => schema.problemForClient(problem).sampleCases.length >= 3),
  '每道题至少有 3 个公开样例用例',
)
check.check(
  catalog.PROBLEMS.every(problem => schema.problemForClient(problem).hiddenCaseCount >= 4),
  '每道题至少有 4 个隐藏用例',
)
check.equal(
  schema.caseForClient({ name: 'x', passed: false, expected: 'A', actual: 'B', ms: 1, error: null }, false),
  { name: 'x', passed: false, ms: 1, error: null },
  'caseForClient 在不允许展示时不带期望值',
)

/* ── round store ─────────────────────────────────────────────────────────── */

const { ChallengeStore, createSubmission } = await import(pathToFileURL(join(PACKAGE, 'src', 'store.js')).href)

const store = new ChallengeStore({ maxChallenges: 3, recentProblemWindow: 3 })
const fakeAgent = { id: 'agent-1', followup() {} }
const created = []
for (let index = 0; index < 5; index += 1) {
  created.push(store.create({ agent: fakeAgent, problem: catalog.PROBLEMS[index] }))
}
check.equal(store.challenges.size, 3, 'LRU 上限生效')
check.equal(store.get(created[0].id), undefined, '最旧的回合被淘汰')
check.check(store.get(created[4].id) !== undefined, '最新的回合还在')
check.equal(store.recentFor('agent-1').length, 3, '每个 agent 的最近题目窗口有上限')
check.equal(store.currentFor('agent-1').id, created[4].id, 'currentFor 取到最新回合')

const challenge = created[4]
const submission = store.record(challenge, createSubmission({ code: 'x', scope: 'full', run: { cases: [] } }))
check.equal(store.challengeForSubmission(submission.id), challenge, '提交可以反查所属回合')
check.equal(store.attachReview(challenge, submission.id, { verdict: 'accepted' }), true, 'attachReview 命中提交')
check.equal(submission.review.verdict, 'accepted', '点评写回了提交记录')
check.equal(store.attachReview(challenge, 's-nope', {}), false, 'attachReview 对未知提交返回 false')
check.equal(challenge.attempts, 1, 'attempts 计数正确')
check.equal(challenge.latest.id, submission.id, 'latest 指向最后一次提交')

const evictedStore = new ChallengeStore({ maxChallenges: 1, recentProblemWindow: 1 })
const evictedChallenge = evictedStore.create({ agent: fakeAgent, problem: catalog.PROBLEMS[0] })
const evictedSubmission = evictedStore.record(evictedChallenge, createSubmission({ code: 'y', scope: 'full', run: {} }))
evictedStore.create({ agent: fakeAgent, problem: catalog.PROBLEMS[1] })
check.equal(evictedStore.challengeForSubmission(evictedSubmission.id), undefined, '淘汰回合时清掉提交索引')

/* ── model-facing messages ───────────────────────────────────────────────── */

const messages = await import(pathToFileURL(join(PACKAGE, 'src', 'messages.js')).href)

check.check(messages.PROMPT_SECTION.length > 0, '提示段文本非空')
check.check(messages.PROMPT_SECTION.includes('ts_learn_report'), '提示段告诉模型用工具回传')

const reviewMessage = messages.buildReviewMessage({
  challenge: { problem: catalog.PROBLEMS[0], attempts: 1 },
  submission: { id: 's-1', code: 'export function f() {}' },
  run: { cases: [{ name: 'x', passed: false, expected: 'A', actual: 'B', error: null }], elapsedMs: 12, compileError: null, entryMissing: null, timedOut: false },
})
check.equal(reviewMessage.role, 'user', '评审消息是 user 角色')
check.check(typeof reviewMessage.id === 'string' && reviewMessage.id.length > 0, '评审消息带 id')
check.equal(reviewMessage.source.kind, 'plugin', '评审消息来源是 plugin')
check.equal(reviewMessage.source.form, 'notice', '评审消息 form 是 notice')
check.check(reviewMessage.source.summary.length <= 120, 'summary 不超过 120 字符')
check.check(Object.isFrozen(reviewMessage), '评审消息被冻结')
check.check(reviewMessage.content[0].text.includes('s-1'), '评审消息包含 submissionId')
check.check(reviewMessage.content[0].text.includes(catalog.PROBLEMS[0].entry), '评审消息包含导出函数名')
check.check(reviewMessage.content[0].text.includes('第 1 次提交'), '评审消息标注提交次数')
check.check(reviewMessage.content[0].text.includes('\n\n## '), '评审消息保留了小节之间的空行')
check.check(
  reviewMessage.content[0].text.split('\n').filter(line => line.startsWith('## ')).length === 6,
  '评审消息包含六个小节标题',
)

const secondMessage = messages.buildReviewMessage({
  challenge: { problem: catalog.PROBLEMS[0], attempts: 3 },
  submission: { id: 's-2', code: 'x' },
  run: { cases: [], elapsedMs: 1, compileError: null, entryMissing: null, timedOut: false },
})
check.check(secondMessage.content[0].text.includes('第 3 次提交'), '第三次提交时策略不同（标注次数）')
check.check(!secondMessage.content[0].text.includes('绝对不要给出可直接运行的正确实现'), '第三次提交时不再禁止给答案')

const handoff = messages.buildHandoffMessage({ challenge: { problem: catalog.PROBLEMS[1] } })
check.check(handoff.content[0].text.includes(catalog.PROBLEMS[1].title), '交回消息包含题目标题')
check.check(handoff.content[0].text.includes('不需要调用 ts_learn_report'), '交回消息说明本轮不必回传点评')

/* ── reporting tool ──────────────────────────────────────────────────────── */

const { createReportTool } = await import(pathToFileURL(join(PACKAGE, 'src', 'report.js')).href)
const reportStore = new ChallengeStore({ maxChallenges: 2, recentProblemWindow: 2 })
const reportChallenge = reportStore.create({ agent: fakeAgent, problem: catalog.PROBLEMS[0] })
const reportSubmission = reportStore.record(reportChallenge, createSubmission({ code: 'z', scope: 'full', run: {} }))
const tool = createReportTool(reportStore)

check.equal(tool.name, 'ts_learn_report', '工具名')
check.equal(tool.parameters.required, ['submissionId', 'verdict', 'summary'], '工具必填参数')
check.equal(tool.parameters.properties.verdict.enum, ['accepted', 'needs_work'], 'verdict 取值受限')
const toolResult = await tool.execute({ submissionId: reportSubmission.id, verdict: 'needs_work', summary: '还行，但边界没处理' })
check.check(toolResult.message.includes('仍需修改'), '工具返回值说明判定')
check.equal(reportSubmission.review.summary, '还行，但边界没处理', '工具把点评写进了提交')
check.equal(reportSubmission.review.verdict, 'needs_work', '工具写入了 verdict')
let unknownThrew = false
try {
  await tool.execute({ submissionId: 's-missing', verdict: 'accepted', summary: 'x' })
} catch {
  unknownThrew = true
}
check.check(unknownThrew, '未知 submissionId 会抛错而不是静默成功')
check.check(Array.isArray(tool.output.render({}, toolResult)), '工具声明了输出渲染')

/* ── runner wire parsing ─────────────────────────────────────────────────── */

const runner = await import(pathToFileURL(join(PACKAGE, 'src', 'runner.js')).href)
const driverSource = await readFile(join(PACKAGE, 'src', 'driver.mjs'), 'utf8')

check.check(driverSource.includes(`'${runner.RESULT_MARKER}'`), 'driver 与 runner 的帧标记一致')
const parsed = runner.parseFrames([
  'learner console line',
  `${runner.RESULT_MARKER}{"kind":"case","index":0,"name":"a","passed":true}`,
  'more learner output',
  `${runner.RESULT_MARKER}{"kind":"done"}`,
].join('\n'))
check.equal(parsed.frames.length, 2, 'parseFrames 提取两帧')
check.equal(parsed.passthrough, ['learner console line', 'more learner output'], 'parseFrames 保留学习者输出')
check.check(runner.typescriptCapability().supported, '当前 Node 能执行 .ts（类型剥离可用）')

/* ── page assets ─────────────────────────────────────────────────────────── */

const html = await readFile(join(PACKAGE, 'src', 'assets', 'index.html'), 'utf8')
const css = await readFile(join(PACKAGE, 'src', 'assets', 'app.css'), 'utf8')
const app = await readFile(join(PACKAGE, 'src', 'assets', 'app.js'), 'utf8')

check.check(html.includes('{{PREFIX}}'), 'index.html 使用 {{PREFIX}} 占位符')
check.check(html.includes('ts-learn-prefix'), 'index.html 通过 meta 传给前端前缀')
check.check(!/<script(?![^>]*\bsrc=)/.test(html), 'index.html 没有内联脚本（CSP 允许 script-src self）')
check.check(!/\son[a-z]+\s*=/i.test(html), 'index.html 没有内联事件处理器')
check.check(css.length > 2000, 'app.css 非空')
check.check(app.length > 8000, 'app.js 非空')
check.check(app.includes('tokenize') === false, 'app.js 不含残留占位符')
check.check(app.includes('{{PREFIX}}') === false, 'app.js 不依赖服务端占位符替换')

const assetRefs = [
  ...html.matchAll(/(?:href|src)="\{\{PREFIX\}\}\/([^"]+)"/g),
].map(match => match[1])
check.equal(assetRefs.sort(), ['app.css', 'app.js'], 'index.html 只引用本插件的两个资源')
for (const asset of assetRefs) {
  const size = (await stat(join(PACKAGE, 'src', 'assets', asset))).size
  check.check(size > 0, `资源 ${asset} 存在且非空`)
}

check.check(app.includes('escapeHtml'), 'app.js 有 HTML 转义，用户代码按文本渲染')
check.check(!app.includes('innerHTML = problem.'), 'app.js 不会把未转义的题目内容塞进 innerHTML')
check.check(app.includes("'/api/health'"), 'app.js 调用了 /api/health')
check.check(css.includes('.tok-keyword'), 'CSS 定义了语法高亮 token 样式')
check.check(css.includes('tab-size'), 'CSS 设置了 tab-size')

/* ── the page's own editor logic ─────────────────────────────────────────── */

const editorChecks = createChecker('2) 编辑器：语法高亮与缩进（在 vm 里加载 app.js 真实源码）')

/**
 * Every element id the browser can actually resolve: the ones the served
 * `index.html` declares, plus the ones `app.js` injects through its own
 * `innerHTML`. Anything outside this set is `null` at runtime, so the stub
 * below must return `null` too — a stub that answers every id hides exactly the
 * missing-id defect that produced a blank page in the field.
 */
const HTML_IDS = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
const INJECTED_IDS = new Set([...app.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]))
const KNOWN_IDS = new Set([...HTML_IDS, ...INJECTED_IDS])

const queriedIds = [...app.matchAll(/getElementById\('([^']+)'\)/g)].map(match => match[1])
const unresolvedIds = [...new Set(queriedIds)].filter(id => !KNOWN_IDS.has(id))
check.check(
  unresolvedIds.length === 0,
  'app.js 里每个 getElementById 的 id 都真实存在',
  `找不到：${unresolvedIds.join(', ')}`,
)
check.check(
  HTML_IDS.has('highlight') && HTML_IDS.has('highlight-code'),
  'index.html 同时声明了高亮层 #highlight 与 #highlight-code',
  `html ids: ${[...HTML_IDS].join(', ')}`,
)

/** One stub element standing in for the pieces of the DOM the page touches. */
function stubElement(id) {
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    style: {},
    scrollTop: 0,
    scrollLeft: 0,
    selectionStart: 0,
    selectionEnd: 0,
    listeners: {},
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, listener) {
      ;(this.listeners[type] ??= []).push(listener)
    },
    setSelectionRange(from, to) {
      this.selectionStart = from
      this.selectionEnd = to
    },
  }
}

const elements = new Map()
const storage = new Map()
const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  URL,
  URLSearchParams,
  document: {
    getElementById(id) {
      // Only ids the real page can resolve; anything else is null, exactly as
      // in the browser.
      if (!KNOWN_IDS.has(id)) return null
      if (!elements.has(id)) elements.set(id, stubElement(id))
      return elements.get(id)
    },
    querySelector(selector) {
      return selector.includes('ts-learn-prefix') ? { content: '' } : null
    },
  },
  window: {
    location: { href: 'http://127.0.0.1:3211/ts-learn/' },
    history: { replaceState() {} },
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
  },
}
const context = createContext(sandbox)

const editorTestSource = `
function __tsLearnEditorChecks() {
  const out = []
  const ok = (condition, name, detail) => out.push({ ok: Boolean(condition), name, detail: detail === undefined ? '' : String(detail) })

  // ── syntax highlighting ──
  const keywords = highlight('const total: number = 1')
  ok(keywords.includes('tok-keyword'), '高亮：const 是关键字色')
  ok(keywords.includes('tok-type'), '高亮：number 是类型色')
  ok(keywords.includes('tok-number'), '高亮：数字有独立颜色')
  ok(highlight('// 注释').includes('tok-comment'), '高亮：行注释')
  ok(highlight('/* 块注释 */').includes('tok-comment'), '高亮：块注释')
  ok(highlight('let s = "abc"').includes('tok-string'), '高亮：双引号字符串')
  ok(highlight("let s = 'abc'").includes('tok-string'), '高亮：单引号字符串')
  ok(highlight('let s = \\\`a\\\${b}c\\\`').includes('tok-string'), '高亮：模板字符串')
  ok(highlight('total + "x"').includes('tok-string'), '高亮：加号不会吞掉字符串')
  ok(highlight('helper(1)').includes('tok-func'), '高亮：函数调用有独立颜色')
  ok(highlight('class Widget {}').includes('tok-type'), '高亮：大写开头的名字视为类型')
  ok(highlight('a[0] // t').includes('tok-comment') && highlight('a[0] // t').includes('tok-number'), '高亮：注释与下标同时正确')
  const escaped = highlight('if (a < b && c > d) {}')
  ok(escaped.includes('&lt;') && escaped.includes('&gt;') && escaped.includes('&amp;&amp;'), '高亮：比较符与 & 被转义')
  ok(!escaped.includes('<b'), '高亮：不会产生原始标签')
  const scriptTag = highlight('const s = "<script>alert(1)</script>"')
  ok(!scriptTag.includes('<script>'), '高亮：用户代码里的 script 标签被转义')
  ok(escapeHtml('<&>') === '&lt;&amp;&gt;', 'escapeHtml 转义三个字符')
  ok(lineNumbers(3) === '1\\n2\\n3', 'lineNumbers 生成行号')

  // ── editor mechanics ──
  const ta = dom.textarea
  function setCode(text, caret) {
    ta.value = text
    ta.selectionStart = caret === undefined ? text.length : caret
    ta.selectionEnd = ta.selectionStart
    repaint()
  }
  function press(key, mods) {
    const event = { key, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, preventDefault() { event.defaultPrevented = true } }
    Object.assign(event, mods || {})
    onKeyDown(event)
    return event
  }

  setCode('', 0)
  press('Tab')
  ok(ta.value === '  ', 'Tab 插入两个空格，实际 ' + JSON.stringify(ta.value))
  ok(ta.selectionStart === 2, 'Tab 之后光标在缩进之后')

  setCode('function f() {', 14)
  press('Enter')
  ok(ta.value === 'function f() {\\n  ', 'Enter 在 { 之后自动缩进，实际 ' + JSON.stringify(ta.value))

  setCode('if (ok) {\\n  doIt()', 20)
  press('Enter')
  ok(ta.value === 'if (ok) {\\n  doIt()\\n  ', 'Enter 继承当前行缩进，实际 ' + JSON.stringify(ta.value))

  setCode('{}', 1)
  press('Enter')
  ok(ta.value === '{\\n  \\n}', 'Enter 在空括号对里展开成代码块，实际 ' + JSON.stringify(ta.value))
  ok(ta.selectionStart === 4, '展开后光标停在缩进层，实际 ' + String(ta.selectionStart))

  setCode('    const x = 1', 6)
  press('Tab', { shiftKey: true })
  ok(ta.value === '  const x = 1', 'Shift+Tab 反缩进一层，实际 ' + JSON.stringify(ta.value))
  ok(ta.selectionStart === 4, '反缩进后光标跟着左移')

  setCode('a\\nb\\nc', 5)
  ok(dom.gutter.textContent === '1\\n2\\n3', '行号栏跟随内容，实际 ' + JSON.stringify(dom.gutter.textContent))
  ok(dom.highlight.innerHTML.endsWith('\\n'), '高亮层补了尾行，保证与 textarea 等高')

  setCode('f()', 2)
  press('Backspace')
  ok(ta.value === 'f', '在空括号对中间按退格会成对删除，实际 ' + JSON.stringify(ta.value))

  setCode('', 0)
  press('(')
  ok(ta.value === '()', '输入左括号会自动补右括号，实际 ' + JSON.stringify(ta.value))
  ok(ta.selectionStart === 1, '自动补全后光标留在括号里')

  setCode('if (x) {\\n    ', 13)
  press('}')
  ok(ta.value === 'if (x) {\\n  }', '在缩进空行输入右括号会自动反缩进，实际 ' + JSON.stringify(ta.value))

  setCode('let a = 1', 9)
  const plain = press('a')
  ok(plain.defaultPrevented === false, '普通字符不拦截浏览器默认输入')

  setCode('x', 1)
  const ctrlEnter = press('Enter', { ctrlKey: true })
  ok(ctrlEnter.defaultPrevented === true, 'Ctrl+Enter 被拦截为自测快捷键')

  setCode('let s = "abc"', 13)
  const quote = press('"')
  ok(quote.defaultPrevented === false, '在字符串尾部输入引号不会再多补一个')

  setCode('let s = ', 8)
  press('"')
  ok(ta.value === 'let s = ""', '在赋值号后输入引号会成对补全，实际 ' + JSON.stringify(ta.value))

  setCode('f()', 2)
  press(')')
  ok(ta.value === 'f()' && ta.selectionStart === 3, '在已有右括号上输入右括号只会跳过，实际 ' + JSON.stringify(ta.value) + ' @' + String(ta.selectionStart))

  // syncScroll touches the highlight layer by id. A missing id here once threw
  // inside applyChallenge and blanked the entire page, so it gets its own test.
  const pre = document.getElementById('highlight')
  ok(pre !== null, 'syncScroll 需要的 #highlight 元素存在')
  if (pre !== null) {
    ta.scrollTop = 40
    ta.scrollLeft = 7
    syncScroll()
    ok(pre.scrollTop === 40, 'syncScroll 把纵向滚动同步到高亮层')
    ok(pre.scrollLeft === 7, 'syncScroll 把横向滚动同步到高亮层')
    ok(dom.gutter.style.transform === 'translateY(-40px)', 'syncScroll 同步了行号栏，实际 ' + String(dom.gutter.style.transform))
  }

  return out
}
__tsLearnEditorChecks()
`

try {
  const results = runInContext(`${app}\n${editorTestSource}`, context, { filename: 'app.js' })
  for (const result of results) editorChecks.check(result.ok, result.name, result.detail === '' ? undefined : result.detail)
} catch (error) {
  editorChecks.check(false, 'app.js 能在最小 DOM 环境下加载', error instanceof Error ? `${error.message}` : String(error))
}
editorChecks.report()

void WORK_ROOT
process.exitCode = check.report() && editorChecks.failures.length === 0 ? 0 : 1
