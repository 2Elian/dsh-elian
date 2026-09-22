#!/usr/bin/env node
/**
 * Real-browser verification of the challenge page.
 *
 * The HTTP suite proves the API answers; the vm suite proves the editor's pure
 * logic. Neither can catch a page that loads, receives a valid challenge, and
 * still renders nothing — which is exactly what a dropped element id did once.
 * This suite boots the plugin, opens the page in a real browser, and asserts
 * what a learner actually sees and does.
 *
 * Needs a browser. It uses whatever Playwright can launch (bundled Chromium,
 * then system Edge, then system Chrome); with none available it prints SKIP and
 * exits 0 so a machine without a browser does not fail the gate.
 *
 *   node scripts/verify-ts-learn-page.mjs
 */
import { rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createChecker } from './lib/check.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE = join(ROOT, 'plugins', 'ts-learn')
const HARNESS = 'E:/Project/deepseek-harness'
const WORK_ROOT = join(ROOT, '.ts-learn-work')

const check = createChecker('4) 真实浏览器：答题页真的渲染出题目并能自测/提交')

/**
 * Load Playwright from this repository, then from the DSH checkout.
 * @returns the `chromium` export, or `null`.
 */
async function loadPlaywright() {
  const candidates = [
    'playwright',
    join(HARNESS, 'node_modules', 'playwright', 'index.mjs'),
    join(HARNESS, 'node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/index.mjs'),
  ]
  for (const candidate of candidates) {
    try {
      const specifier = candidate.startsWith('E:') ? pathToFileURL(candidate).href : candidate
      const loaded = await import(specifier)
      if (typeof loaded.chromium?.launch === 'function') return loaded.chromium
    } catch {
      // Try the next candidate; the caller reports when none worked.
    }
  }
  return null
}

/**
 * Launch a browser, preferring the bundled build, then the system ones.
 * @param chromium - the Playwright chromium export.
 * @returns the launched browser, or `null`.
 */
async function launchBrowser(chromium) {
  for (const options of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try {
      return await chromium.launch(options)
    } catch {
      // Try the next launch shape.
    }
  }
  return null
}

const chromium = await loadPlaywright()
if (chromium === null) {
  process.stdout.write('\n4) 真实浏览器：跳过（没有可用的 Playwright）\n')
  process.exit(0)
}

const browser = await launchBrowser(chromium)
if (browser === null) {
  process.stdout.write('\n4) 真实浏览器：跳过（Playwright 装不到浏览器内核）\n')
  process.exit(0)
}

/** Records command definitions, standing in for the real command registry. */
const cordis = await import(
  pathToFileURL(join(HARNESS, 'packages/host/webserver/node_modules/@deepseek-ai/cordis/lib/index.js')).href
)
const webserver = await import(pathToFileURL(join(HARNESS, 'packages/host/webserver/lib/index.js')).href)
const plugin = await import(pathToFileURL(join(PACKAGE, 'index.js')).href)
const { PROBLEMS } = await import(pathToFileURL(join(PACKAGE, 'src', 'catalog.js')).href)
const { Context, Service } = cordis

class Commands extends Service {
  constructor(ctx) { super(ctx, 'commands'); this.definitions = new Map() }
  register(definition) { this.definitions.set(definition.name, definition); return () => this.definitions.delete(definition.name) }
}
class Tools extends Service {
  constructor(ctx) { super(ctx, 'tools'); this.definitions = new Map() }
  register(definition) { this.definitions.set(definition.name, definition); return () => this.definitions.delete(definition.name) }
}
class SystemPrompt extends Service {
  constructor(ctx) { super(ctx, 'systemPrompt'); this.sections = new Map() }
  section(section) { this.sections.set(section.name, section); return () => this.sections.delete(section.name) }
}

const app = new Context()
const inbox = []
try {
  await app.plugin(webserver.WebServer, { host: '127.0.0.1', port: 0, compression: 'none' })
  await app.plugin(Commands)
  await app.plugin(Tools)
  await app.plugin(SystemPrompt)
  await app.plugin(plugin, {
    openBrowser: false,
    workDir: WORK_ROOT,
    caseTimeoutMs: 4000,
    runTimeoutMs: 20000,
  })

  const port = app.get('webServer').port
  const agent = { id: 'browser-agent', followup: message => inbox.push(message) }

  const commandResult = await app.get('commands').definitions.get('ts-learn').handler({
    agent,
    rawInput: '',
    attachments: [],
    signal: new AbortController().signal,
  })
  const url = /(http:\/\/[^\s]+)/.exec(commandResult.text)?.[1]
  check.check(typeof url === 'string', '命令给出了答题页地址')
  check.check(commandResult.text.includes('算法考点'), '命令结果里带着题目本身')

  const challengeId = /[?&]c=([a-z0-9-]+)/.exec(url ?? '')?.[1]
  const problem = PROBLEMS.find(item => commandResult.text.includes(item.title))
  check.check(problem !== undefined, '命令返回的题目能在题库里找到')

  const page = await browser.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => pageErrors.push(error.message))

  const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
  check.equal(response?.status(), 200, '页面返回 200')
  await page.waitForTimeout(900)

  /* ── what a learner sees on load ───────────────────────────────────────── */

  const rendered = await page.evaluate(() => ({
    title: document.title,
    problemText: document.querySelector('#problem')?.textContent ?? '',
    badges: document.querySelector('#badges')?.textContent ?? '',
    editor: document.querySelector('#code')?.value ?? '',
    themeOptions: document.querySelector('#theme-select')?.options.length ?? 0,
    hintStripHidden: document.querySelector('#hint-strip')?.hidden ?? true,
  }))

  check.check(rendered.problemText.includes(problem?.title ?? '\u0000'), '题目标题出现在页面上')
  check.check(rendered.problemText.length > 400, '题目正文完整渲染（不是空面板）')
  check.check(!rendered.problemText.includes('还没有进行中的题目'), '页面没有回退到「还没有进行中的题目」')
  check.check(!rendered.problemText.includes('Cannot set properties'), '页面没有把内部异常当成题目显示')
  check.check(rendered.badges.includes('中等'), '难度徽章渲染')
  check.check(rendered.badges.includes(problem?.algorithms?.[0] ?? '\u0000'), '算法考点徽章渲染')
  check.equal(rendered.editor, problem?.starter, '编辑器预填了起始模板')
  check.check(rendered.themeOptions >= 10, `出题方向下拉框有选项（${rendered.themeOptions} 项）`)
  check.check(rendered.hintStripHidden, '初始不显示提示条')
  check.equal(pageErrors.length, 0, '页面没有未捕获异常', pageErrors.join(' | '))

  /* ── 运行自测 with the reference solution ──────────────────────────────── */

  await page.fill('#code', problem.solution)
  await page.click('#btn-run')
  await page.waitForSelector('#results .summary-line', { timeout: 30000 })
  const runSummary = await page.textContent('#results .summary-line')
  check.check(runSummary?.includes('全部通过') === true, `自测通过全部样例用例（${runSummary?.trim()}）`)

  /* ── 提交 routes the work to the agent ─────────────────────────────────── */

  const inboxBefore = inbox.length
  await page.click('#btn-submit')
  await page.waitForSelector('#review-slot .review', { timeout: 30000 })
  check.check(inbox.length === inboxBefore + 1, '提交转交给了 agent')

  const submitSummary = await page.textContent('#results .summary-line')
  check.check(submitSummary?.includes('全部通过') === true, `提交后仍然全部通过（${submitSummary?.trim()}）`)

  const reviewSlot = await page.textContent('#review-slot')
  check.check(reviewSlot?.includes('Agent 正在沙箱里复跑') === true, '页面提示等待 agent 点评')

  /* ── 提示与参考实现的门槛 ──────────────────────────────────────────────── */

  await page.click('#btn-hint')
  await page.waitForSelector('#hint-strip:not([hidden])', { timeout: 10000 })
  const hintText = await page.textContent('#hint-strip')
  check.check(hintText?.includes('提示 1/') === true, `点「要提示」给出第一层提示（${hintText?.slice(0, 24)}）`)

  const solutionVisible = await page.evaluate(() => document.querySelector('#solution-body')?.textContent ?? '')
  check.equal(solutionVisible, '', '提交 1 次后仍不展示参考实现')

  /* ── 换方向 ────────────────────────────────────────────────────────────── */

  const previousTitle = (await page.textContent('.problem-title')) ?? ''
  await page.selectOption('#theme-select', 'skill')
  await page.waitForFunction(
    title => document.querySelector('.problem-title')?.textContent !== title,
    previousTitle,
    { timeout: 30000 },
  )
  const newTitle = await page.textContent('.problem-title')
  const newBadges = await page.textContent('#badges')
  check.check(newTitle !== previousTitle, `换方向后题目变了（${newTitle?.trim()}）`)
  check.check(newBadges?.includes('Skill') === true, '换方向后方向徽章正确')

  check.equal(pageErrors.length, 0, '整轮操作没有未捕获异常', pageErrors.join(' | '))
  check.check(
    consoleErrors.every(text => text.includes('favicon') || text.includes('404')),
    '控制台没有除 favicon 之外的错误',
    consoleErrors.join(' | '),
  )

  await page.close()
  check.check(challengeId !== undefined, '回合 id 可从地址里解析')
} catch (error) {
  check.check(false, '浏览器流程未抛异常', error instanceof Error ? `${error.message}\n${error.stack}` : String(error))
} finally {
  await browser.close()
  await app.fiber.dispose().catch(() => {})
  await rm(WORK_ROOT, { recursive: true, force: true }).catch(() => {})
}

process.exitCode = check.report() ? 0 : 1
