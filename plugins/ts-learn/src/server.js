/**
 * The browser-facing HTTP surface: one prefix route on the host's web server
 * that serves the page assets and the JSON API.
 *
 * The page is same-origin with the DSH web GUI, so no CORS handling is needed.
 * What it does need is a bound on what a request may carry and a refusal to
 * serve a non-loopback caller when the deployment bound the server to every
 * interface: a local learning page must not silently become a LAN endpoint
 * that runs submitted code.
 *
 * @module server
 */

import { readFile } from 'node:fs/promises'
import { challengeView } from './rounds.js'

/** Largest JSON request body accepted, on top of the source cap. */
const BODY_OVERHEAD_BYTES = 16 * 1024

/** Assets served from `lib/assets`, with their content types. */
const ASSETS = new Map([
  ['/app.css', ['app.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
])

/**
 * Whether a request arrived over a loopback interface.
 * @param req - the incoming request.
 * @returns `true` for IPv4/IPv6 loopback and for the worker tunnel.
 */
function isLoopback(req) {
  const address = req.socket?.remoteAddress
  if (address === undefined) return true
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/**
 * Write a JSON response.
 * @param res - the response.
 * @param status - HTTP status.
 * @param body - JSON-able body.
 */
function sendJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}

/**
 * Write a text response.
 * @param res - the response.
 * @param status - HTTP status.
 * @param text - body text.
 * @param contentType - media type.
 * @param extraHeaders - additional headers, merged over the defaults.
 */
function sendText(res, status, text, contentType, extraHeaders = {}) {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  res.end(text)
}

/**
 * Policy for the page: same-origin assets only, no inline script, no framing.
 * The page renders learner code as text, so this is the only thing standing
 * between a crafted submission and an injected script tag.
 */
const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

/**
 * Build an error the handler turns into a specific HTTP status.
 * @param status - HTTP status to answer with.
 * @param message - client-facing reason.
 * @returns the tagged error.
 */
function httpError(status, message) {
  return Object.assign(new Error(message), { status })
}

/**
 * Read a bounded request body.
 * @param req - the incoming request.
 * @param limit - byte ceiling.
 * @returns the decoded body.
 * @throws with `status: 413` when the body exceeds `limit`.
 */
async function readBody(req, limit) {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) {
    throw httpError(413, `请求体超过 ${limit} 字节上限`)
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw httpError(413, `请求体超过 ${limit} 字节上限`)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Parse a JSON request body, treating an empty body as `{}`.
 * @param req - the incoming request.
 * @param limit - byte ceiling.
 * @returns the parsed object.
 * @throws when the body is not a JSON object.
 */
async function readJson(req, limit) {
  const text = (await readBody(req, limit)).trim()
  if (text === '') return {}
  let value
  try {
    value = JSON.parse(text)
  } catch (error) {
    throw httpError(400, `请求体不是合法 JSON：${error.message}`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, '请求体必须是 JSON 对象')
  }
  return value
}

/**
 * Read one asset from the package.
 * @param name - file name under `lib/assets`.
 * @param prefix - the configured route prefix, substituted into the HTML shell.
 * @returns the file text.
 */
async function readAsset(name, prefix) {
  const text = await readFile(new URL(`./assets/${name}`, import.meta.url), 'utf8')
  return name === 'index.html' ? text.replaceAll('{{PREFIX}}', prefix) : text
}

/**
 * Build the route handler for the configured prefix.
 *
 * @param options - handler inputs.
 * @param options.config - resolved plugin configuration.
 * @param options.store - the round registry.
 * @param options.rounds - the round service.
 * @param options.log - `(level, message)` sink.
 * @param options.host - the resolved bind host, used for the remote-caller policy.
 * @param options.bank - `{ problemCount, themes }` describing the loaded bank.
 * @returns an async request handler.
 */
export function createRouteHandler({ config, store, rounds, log, host, bank }) {
  const description = {
    name: 'ts-learn',
    prefix: config.routePrefix,
    allowRemote: config.allowRemote,
    bindHost: host,
    problemCount: bank.problemCount,
    themes: bank.themes,
  }

  /**
   * Resolve the round a request names, distinguishing "unknown" from "absent".
   * @param id - the `c` parameter.
   * @returns the challenge.
   * @throws when the id is missing or unknown.
   */
  function requireChallenge(id) {
    if (typeof id !== 'string' || id === '') {
      throw httpError(400, '缺少挑战 id（先发送 /ts-learn 获取一个）')
    }
    const challenge = store.get(id)
    if (challenge === undefined) {
      throw httpError(404, '这个挑战已经失效了（插件重启或回合被淘汰），请在会话里重新发送 /ts-learn')
    }
    return challenge
  }

  /**
   * Validate the learner's source before it reaches the runner.
   * @param code - raw source from the request.
   * @returns the source.
   * @throws when it is missing, not a string, or oversized.
   */
  function requireSource(code) {
    if (typeof code !== 'string' || code.trim() === '') {
      throw httpError(400, '代码不能为空')
    }
    if (Buffer.byteLength(code, 'utf8') > config.maxSourceBytes) {
      throw httpError(413, `代码超过 ${config.maxSourceBytes} 字节上限`)
    }
    return code
  }

  /**
   * Dispatch one API call.
   * @param route - the path after the configured prefix, e.g. `/api/run`.
   * @param req - the incoming request.
   * @param res - the response.
   * @returns whether the route was handled.
   */
  async function dispatchApi(route, req, res) {
    const bodyLimit = config.maxSourceBytes + BODY_OVERHEAD_BYTES

    if (route === '/api/health' && req.method === 'GET') {
      sendJson(res, 200, description)
      return true
    }

    if (route === '/api/challenge' && req.method === 'POST') {
      const challenge = requireChallenge((await readJson(req, bodyLimit)).c)
      sendJson(res, 200, { challenge: challengeView(challenge) })
      return true
    }

    if (route === '/api/new' && req.method === 'POST') {
      const body = await readJson(req, bodyLimit)
      const previous = requireChallenge(body.c)
      const theme = typeof body.theme === 'string' && body.theme !== '' ? body.theme : undefined
      const challenge = rounds.start({ agent: previous.agent, theme })
      sendJson(res, 200, { challenge: challengeView(challenge) })
      return true
    }

    if (route === '/api/run' && req.method === 'POST') {
      const body = await readJson(req, bodyLimit)
      const challenge = requireChallenge(body.c)
      const result = await rounds.runSample(challenge, requireSource(body.code))
      sendJson(res, 200, { result })
      return true
    }

    if (route === '/api/submit' && req.method === 'POST') {
      const body = await readJson(req, bodyLimit)
      const challenge = requireChallenge(body.c)
      const outcome = await rounds.submit({ challenge, source: requireSource(body.code) })
      sendJson(res, 200, outcome)
      return true
    }

    if (route === '/api/hint' && req.method === 'POST') {
      const body = await readJson(req, bodyLimit)
      const challenge = requireChallenge(body.c)
      sendJson(res, 200, { hint: rounds.hint(challenge, body.level) })
      return true
    }

    if (route === '/api/solution' && req.method === 'POST') {
      const body = await readJson(req, bodyLimit)
      const challenge = requireChallenge(body.c)
      sendJson(res, 200, rounds.solution(challenge))
      return true
    }

    if (route === '/api/review' && req.method === 'POST') {
      const body = await readJson(req, bodyLimit)
      const challenge = requireChallenge(body.c)
      const submission = challenge.submissions.find(item => item.id === body.s)
      if (submission === undefined) {
        sendJson(res, 404, { error: '找不到这次提交' })
        return true
      }
      sendJson(res, 200, {
        status: submission.review === null ? 'pending' : 'ready',
        review: submission.review,
      })
      return true
    }

    if (route === '/api/handoff' && req.method === 'POST') {
      const body = await readJson(req, bodyLimit)
      const challenge = requireChallenge(body.c)
      sendJson(res, 200, rounds.handoff(challenge))
      return true
    }

    return false
  }

  /** Local alias so `dispatchApi` stays readable. */
  function challengeViewFor(challenge) {
    return challengeView(challenge)
  }
  return async function handle(req, res) {
    try {
      if (host === '0.0.0.0' && !config.allowRemote && !isLoopback(req)) {
        sendJson(res, 403, {
          error: 'ts-learn 只接受本机请求。要允许局域网访问，请把插件配置里的 allowRemote 设为 true。',
        })
        return
      }

      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname
      const route = pathname === config.routePrefix ? '/' : pathname.slice(config.routePrefix.length)

      if (route === '/' || route === '/index.html') {
        sendText(
          res,
          200,
          await readAsset('index.html', config.routePrefix),
          'text/html; charset=utf-8',
          { 'content-security-policy': PAGE_CSP },
        )
        return
      }

      const asset = ASSETS.get(route)
      if (asset !== undefined && req.method === 'GET') {
        sendText(res, 200, await readAsset(asset[0], config.routePrefix), asset[1])
        return
      }

      if (route.startsWith('/api/')) {
        if (await dispatchApi(route, req, res)) return
        sendJson(res, 404, { error: `未知的接口 ${route}` })
        return
      }

      sendJson(res, 404, { error: `未知的路径 ${pathname}` })
    } catch (error) {
      const status = typeof error?.status === 'number' ? error.status : 500
      const message = error instanceof Error ? error.message : String(error)
      if (status >= 500) log('error', `ts-learn: 处理 ${req.method} ${req.url} 失败：${message}`)
      if (!res.headersSent) sendJson(res, status, { error: message })
      else res.end()
    }
  }
}
