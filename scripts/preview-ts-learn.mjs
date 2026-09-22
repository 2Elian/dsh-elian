#!/usr/bin/env node
/**
 * Standalone preview of the challenge page.
 *
 * Boots the real Cordis runtime, the real DSH web server package, and this
 * plugin with the minimum stub services, so the editor, sample tests, hidden
 * judging and hints all run for real — without installing anything into a DSH
 * profile. The one thing it cannot do is reach a live agent, so a submission
 * prints the exact review request that DSH would receive instead of delivering
 * it.
 *
 *   node scripts/preview.mjs [--port 3211] [--no-open]
 */
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGE = join(ROOT, 'plugins', 'ts-learn')
const HARNESS = 'E:/Project/deepseek-harness'

const portArgument = process.argv.indexOf('--port')
const port = portArgument === -1 ? 3211 : Number(process.argv[portArgument + 1])

const cordis = await import(
  pathToFileURL(join(HARNESS, 'packages/host/webserver/node_modules/@deepseek-ai/cordis/lib/index.js')).href
)
const webserver = await import(pathToFileURL(join(HARNESS, 'packages/host/webserver/lib/index.js')).href)
const plugin = await import(pathToFileURL(join(PACKAGE, 'index.js')).href)
const { Context, Service } = cordis
const { WebServer } = webserver

/** Minimal command registry for the preview. */
class Commands extends Service {
  constructor(ctx) {
    super(ctx, 'commands')
    this.definitions = new Map()
  }

  register(definition) {
    this.definitions.set(definition.name, definition)
    return () => this.definitions.delete(definition.name)
  }
}

/** Minimal tool registry for the preview. */
class Tools extends Service {
  constructor(ctx) {
    super(ctx, 'tools')
    this.definitions = new Map()
  }

  register(definition) {
    this.definitions.set(definition.name, definition)
    return () => this.definitions.delete(definition.name)
  }
}

/** Minimal prompt-section registry for the preview. */
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

const app = new Context()
await app.plugin(WebServer, { host: '127.0.0.1', port, compression: 'none' })
await app.plugin(Commands)
await app.plugin(Tools)
await app.plugin(SystemPrompt)
await app.plugin(plugin, {
  openBrowser: false,
  workDir: join(ROOT, '.ts-learn-work'),
})

const commands = app.get('commands')

/** A stand-in agent that prints what DSH would have received. */
const stubAgent = {
  id: 'preview',
  followup(message) {
    const text = message.content[0].text
    process.stdout.write('\n──────── 提交已生成给 agent 的评审请求（预览模式不会真的送给模型）────────\n')
    process.stdout.write(`${text.split('\n').slice(0, 24).join('\n')}\n`)
    process.stdout.write(`……（完整内容 ${text.length} 字符；隐藏用例已全部附上，供 agent 在沙箱里复跑）\n`)
    process.stdout.write('──────────────────────────────────────────────────────────────\n')
    process.stdout.write('预览模式的限制：页面的「Agent 点评」会一直等待，因为这里没有真的 agent。\n')
    process.stdout.write('装上 DSH 之后，同一个提交通知会送到会话里的 agent，它会复跑并调用\n')
    process.stdout.write('ts_learn_report 工具把点评回传，页面就会显示出来。\n\n')
  },
}

const result = await commands.definitions.get('ts-learn').handler({
  agent: stubAgent,
  rawInput: '',
  attachments: [],
  signal: new AbortController().signal,
})

const url = /(http:\/\/[^\s]+)/.exec(result.text)?.[1] ?? `http://127.0.0.1:${port}/ts-learn/`

process.stdout.write(`\n${result.text}\n`)
process.stdout.write(`\n预览地址：${url}\n`)
process.stdout.write('按 Ctrl+C 结束预览。\n')

if (process.argv.includes('--no-open')) {
  process.stdout.write('（--no-open：不自动打开浏览器，请手动访问上面的地址）\n')
} else if (process.platform === 'win32') {
  spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', detached: true, windowsHide: true }).unref()
} else {
  spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref()
}

process.on('SIGINT', () => {
  void (async () => {
    await app.fiber.dispose()
    process.exit(0)
  })()
})
