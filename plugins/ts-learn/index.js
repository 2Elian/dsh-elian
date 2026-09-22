/**
 * ts-learn: a DSH plugin that hands a learner a random medium TypeScript
 * exercise framed in agent development, serves an in-browser editor with the
 * sample cases, and routes submissions to the session's own agent for a
 * sandboxed re-run and a beginner-first review.
 *
 * This is the plugin's host half and the module the Loader imports, so it must
 * stay plain JavaScript. Everything it depends on lives under `src/`; the plugin
 * has no build step and no runtime dependencies.
 *
 * Registrations bind to this plugin's fiber through `ctx.effect`, so unloading
 * the row withdraws the command and the HTTP route together. The tool and the
 * prompt section are nested through `ctx.inject`, because this Cordis resolves
 * `inject` all-or-nothing: requiring services a minimal composition lacks would
 * keep the whole plugin from loading rather than degrade one feature.
 *
 * @module ts-learn
 */

import { spawn } from 'node:child_process'
import { BANK_REPORTS, availableThemes, PROBLEMS } from './src/catalog.js'
import { resolveConfig } from './src/config.js'
import { PROMPT_SECTION } from './src/messages.js'
import { createReportTool } from './src/report.js'
import { THEMES } from './src/problem-schema.js'
import { createRoundService } from './src/rounds.js'
import { createRouteHandler } from './src/server.js'
import { ChallengeStore } from './src/store.js'

/** Plugin name shown in Loader diagnostics. */
export const name = 'ts-learn'

/**
 * Services this plugin cannot work without. `tools`, `systemPrompt`, and
 * `shell` are deliberately absent: each has a nested optional fiber below.
 */
export const inject = ['commands', 'webServer']

/** Usage text returned for an unrecognized sub-command. */
const USAGE = [
  '/ts-learn          随机出一道题，并给出答题页面',
  '/ts-learn next     换一道题',
  '/ts-learn hint     看当前题的下一层提示',
  '/ts-learn status   看当前题和提交次数',
  '/ts-learn themes   看有哪些方向可选',
  '/ts-learn theme:工具执行   指定方向出题',
].join('\n')

/**
 * Build the `/ts-learn` handler.
 *
 * @param options - handler inputs.
 * @param options.rounds - the round service.
 * @param options.store - the round registry.
 * @param options.config - resolved configuration.
 * @param options.urlFor - builds the page URL for a challenge.
 * @param options.openBrowser - opens a URL in the OS browser.
 * @param options.log - `(level, message)` sink.
 * @returns the command handler.
 */
function createCommandHandler({ rounds, store, config, urlFor, openBrowser, log }) {
  /**
   * Summarize a started round for the command result.
   * @param challenge - the new round.
   * @returns the rendered command text.
   */
  function announce(challenge) {
    const problem = challenge.problem
    const url = urlFor(challenge)
    if (config.openBrowser) openBrowser(url)
    return [
      `🎯 《${problem.title}》 · ${problem.difficulty} · ${THEMES[problem.theme] ?? problem.theme}`,
      `算法考点：${problem.algorithms.join(' / ')}`,
      '',
      problem.task,
      '',
      `答题页面（已尝试为你打开）：${url}`,
      '',
      '在页面里写 TypeScript，点「运行自测」跑样例用例，点「提交」由我判定并点评。',
      '卡住了可以点页面上的「要提示」，或者在会话里发 /ts-learn hint。',
    ].join('\n')
  }

  return function handle({ agent, rawInput }) {
    const argument = String(rawInput ?? '').trim()
    const lower = argument.toLowerCase()

    if (argument === '' || lower === 'next' || lower === 'new') {
      const challenge = rounds.start({ agent })
      return { kind: 'success', text: announce(challenge) }
    }

    if (lower === 'hint') {
      const challenge = store.currentFor(String(agent?.id))
      if (challenge === undefined) {
        return { kind: 'error', text: '还没有进行中的题目，先发一次 /ts-learn。' }
      }
      const nextLevel = Math.min(challenge.problem.hints.length, challenge.attempts + 1)
      const hint = rounds.hint(challenge, nextLevel)
      return {
        kind: 'success',
        text: `《${challenge.problem.title}》提示 ${hint.level}/${hint.total}：\n\n${hint.text}${hint.more ? '\n\n（还想更具体就再发一次 /ts-learn hint）' : '\n\n（这是最后一层提示，再卡住可以点页面上的「看参考实现」）'}`,
      }
    }

    if (lower === 'status') {
      const challenge = store.currentFor(String(agent?.id))
      if (challenge === undefined) {
        return { kind: 'success', text: '当前没有进行中的题目。发一次 /ts-learn 开始。' }
      }
      const latest = challenge.latest
      const verdict = latest === undefined
        ? '还没有提交过'
        : `${latest.run.cases.filter(item => item.passed).length}/${latest.run.cases.length} 个用例通过`
      return {
        kind: 'success',
        text: [
          `当前题目：《${challenge.problem.title}》`,
          `提交次数：${challenge.attempts}（${verdict}）`,
          `页面：${urlFor(challenge)}`,
        ].join('\n'),
      }
    }

    if (lower === 'themes' || lower === 'list') {
      const themes = availableThemes()
        .map(theme => `  ${theme.label}（theme: ${theme.theme}）`)
        .join('\n')
      return {
        kind: 'success',
        text: `当前题库共 ${PROBLEMS.length} 道题，可选方向：\n${themes}\n\n用法：/ts-learn theme:工具执行`,
      }
    }

    if (lower.startsWith('theme:')) {
      const wanted = lower.slice('theme:'.length).trim()
      const match = availableThemes().find(theme => theme.theme === wanted || theme.label.toLowerCase() === wanted)
      if (match === undefined) {
        return { kind: 'error', text: `没有这个方向：${wanted}\n\n${USAGE}` }
      }
      const challenge = rounds.start({ agent, theme: match.theme })
      return { kind: 'success', text: announce(challenge) }
    }

    log('info', `ts-learn: 无法识别的子命令 "${argument}"`)
    return { kind: 'error', text: `不认识的用法。可用命令：\n${USAGE}` }
  }
}

/**
 * Open a URL with the platform's default handler, ignoring every failure —
 * the URL is also printed, so a missing browser is not an error.
 * @param url - the URL to open.
 * @param log - `(level, message)` sink.
 */
function createBrowserOpener(log) {
  return function open(url) {
    const command = process.platform === 'win32'
      ? { file: 'cmd', args: ['/c', 'start', '', url] }
      : process.platform === 'darwin'
        ? { file: 'open', args: [url] }
        : { file: 'xdg-open', args: [url] }
    try {
      const child = spawn(command.file, command.args, { detached: true, stdio: 'ignore', windowsHide: true })
      child.on('error', error => log('warn', `ts-learn: 打不开浏览器（${error.message}），请手动打开上面的链接`))
      child.unref()
    } catch (error) {
      log('warn', `ts-learn: 打不开浏览器（${error instanceof Error ? error.message : String(error)}）`)
    }
  }
}

/**
 * Mount the plugin.
 *
 * @param ctx - the plugin's scoped Cordis context.
 * @param rawConfig - this row's `config` from `cordis.patch.yml`.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)

  /**
   * Route one diagnostic to the Cordis logger.
   * @param level - `info`, `warn`, or `error`.
   * @param message - the message.
   */
  const log = (level, message) => {
    const method = ctx.logger?.[level]
    if (typeof method === 'function') method.call(ctx.logger, message)
  }

  for (const report of BANK_REPORTS) {
    log('error', `ts-learn: 题目 ${report.id} 未通过契约校验，已从题库剔除：${report.errors.join('；')}`)
  }
  log('info', `ts-learn: 已载入 ${PROBLEMS.length} 道题`)

  const store = new ChallengeStore({
    maxChallenges: config.maxChallenges,
    recentProblemWindow: config.recentProblemWindow,
  })
  const rounds = createRoundService({ config, store, log })

  /**
   * Build the page URL for one round.
   * @param challenge - the round.
   * @returns the absolute loopback URL.
   */
  const urlFor = (challenge) => {
    const host = ctx.webServer.host === '0.0.0.0' ? '127.0.0.1' : ctx.webServer.host
    return `http://${host}:${ctx.webServer.port}${config.routePrefix}/?c=${challenge.id}`
  }

  const openBrowser = createBrowserOpener(log)

  ctx.effect(
    () => ctx.commands.register({
      name: 'ts-learn',
      description: '随机出一道 Agent 开发方向、含 LeetCode 算法的 TypeScript 中等练习题，并打开答题页面。',
      input: { hint: '[next | hint | status | themes | theme:方向]' },
      handler: createCommandHandler({ rounds, store, config, urlFor, openBrowser, log }),
    }),
    'ts-learn: /ts-learn command',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      path: config.routePrefix,
      handler: createRouteHandler({
        config,
        store,
        rounds,
        log,
        host: ctx.webServer.host,
        bank: { problemCount: PROBLEMS.length, themes: availableThemes() },
      }),
    }),
    'ts-learn: challenge page route',
  )

  ctx.inject(['tools'], (scoped) => {
    scoped.effect(
      () => scoped.tools.register(createReportTool(store)),
      'ts-learn: ts_learn_report tool',
    )
  })

  if (config.promptSection) {
    ctx.inject(['systemPrompt'], (scoped) => {
      scoped.effect(
        () => scoped.systemPrompt.section({
          name: 'plugin:ts-learn',
          order: 910,
          text: PROMPT_SECTION,
        }),
        'ts-learn: review etiquette prompt section',
      )
    })
  }
}
