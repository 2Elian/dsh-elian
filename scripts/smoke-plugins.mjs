/**
 * Load each built client bundle the way the browser does, then run its plugin
 * body against a stub Cordis client context.
 *
 * This is the closest thing to activation available without launching the
 * harness: it proves the factory executes, the module exports the documented
 * `{ inject, apply }` pair, and `apply` registers the expected seat entries and
 * disposes them cleanly. What it cannot prove is what the user sees — that
 * needs a live `dsh web` with the plugin's overlay mounted.
 *
 *   node build.mjs            # in each plugin, first
 *   node scripts/smoke-plugins.mjs
 */

import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { globSync } from 'node:fs'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(pathToFileURL(join(ROOT, 'package.json')))

let failures = 0
const ok = (condition, message) => {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${message}`)
  if (!condition) failures += 1
}

/** Minimal Cordis client context: enough for a pure-UI plugin body to run. */
function stubContext() {
  const registered = []
  const injected = []
  const effects = []
  const listeners = new Map()
  const dictionaries = new Map()
  const events = []

  const source = (initial) => {
    let value = initial
    const set = new Set()
    return {
      getSnapshot: () => value,
      subscribe(listener) { set.add(listener); return () => { set.delete(listener) } },
      push(next) { value = next; for (const listener of [...set]) listener() },
    }
  }

  const eventSource = source({ entries: [], hasMore: false })

  const ctx = {
    locale: {
      register(namespace, dict) { dictionaries.set(namespace, dict); return () => { dictionaries.delete(namespace) } },
      bind: () => (key) => key,
    },
    slots: {
      // `slots.inject` returns the contribution's disposer; the plugin hands it
      // to `ctx.effect`, which is the teardown path this script exercises.
      inject(key, callback) { injected.push(key); return callback() },
      register(options, component) {
        registered.push({ options, component })
        return () => {
          const at = registered.findIndex(entry => entry.options === options)
          if (at >= 0) registered.splice(at, 1)
        }
      },
    },
    sessions: { binding: () => ({ eventSource }) },
    conversation: { loadOlder: async () => {} },
    effect(callback, label) {
      const dispose = callback()
      effects.push({ dispose, label })
      return dispose
    },
    on(name, listener) { (listeners.get(name) ?? listeners.set(name, []).get(name)).push(listener) },
    events,
  }
  return { ctx, registered, injected, effects, dictionaries }
}

const bundles = globSync('plugins/*/client.js', { cwd: ROOT })
if (bundles.length === 0) {
  console.error('no built bundles found; run `node build.mjs` in each plugin first')
  process.exit(1)
}

for (const relative of bundles) {
  const manifest = JSON.parse(await readFile(join(ROOT, dirname(relative), 'package.json'), 'utf8'))
  console.log(`\n${manifest.name}`)

  // The browser module table hands the factory a `require` that answers only
  // the platform rows. Answering exactly those here keeps a stray import loud.
  const platform = new Set([
    'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
  ])
  const fakeRequire = (specifier) => {
    if (!platform.has(specifier)) throw new Error(`module table cannot answer ${specifier}`)
    return require(specifier)
  }

  let handoff
  globalThis.window = { __ModuleLoader__: { load: (value) => { handoff = value } } }
  await import(pathToFileURL(join(ROOT, relative)).href)
  ok(handoff !== undefined, 'bundle called window.__ModuleLoader__.load')
  if (handoff === undefined) continue
  ok(handoff.id === manifest.name, `registered id is the package name (${String(handoff.id)})`)
  delete globalThis.window

  const exported = handoff.factory(fakeRequire)
  ok(typeof exported.apply === 'function', 'module exports apply()')
  ok(Array.isArray(exported.inject), `module exports inject[] (${(exported.inject ?? []).join(', ')})`)
  if (typeof exported.apply !== 'function') continue

  const harness = stubContext()
  exported.apply(harness.ctx)

  ok(harness.dictionaries.size === 1, `registered one locale namespace (${[...harness.dictionaries.keys()].join(', ')})`)
  const seats = harness.registered.map(entry => `${entry.options.name}#${String(entry.options.id)}`)
  ok(seats.some(seat => seat.startsWith('conversation.session.header.utilities#')), 'registered the header toggle seat')
  ok(seats.some(seat => seat.startsWith('conversation.input.overlay#')), 'registered the panel seat')
  console.log(`        seats: ${seats.join(', ')}`)

  // The registration's inject factory is what the renderer calls per session.
  // Every seat exposes the open observable; the panel additionally exposes the
  // transcript it reads.
  for (const entry of harness.registered) {
    const factory = entry.options.inject
    if (typeof factory !== 'function') continue
    const face = factory('session-1')
    const hooks = face.hooks ?? {}
    const isPanel = entry.options.name === 'conversation.input.overlay'
    ok(typeof hooks.open?.getSnapshot === 'function' && typeof hooks.open?.subscribe === 'function', `${entry.options.name}: exposes an open observable`)
    ok(
      isPanel
        ? typeof hooks.transcript?.getSnapshot === 'function' && typeof hooks.transcript?.subscribe === 'function'
        : hooks.transcript === undefined,
      isPanel ? `${entry.options.name}: exposes a transcript observable` : `${entry.options.name}: exposes no unrelated hook`,
    )
  }

  const panel = harness.registered.find(entry => entry.options.name === 'conversation.input.overlay')
  ok(panel !== undefined && typeof panel.component === 'function', 'panel seat has a renderable component')

  for (const effect of harness.effects) {
    if (typeof effect.dispose === 'function') effect.dispose()
  }
  const remaining = harness.registered.length
  ok(remaining === 0, `every registration disposed (${String(remaining)} left)`)
}

console.log(`\n${failures === 0 ? 'all bundles activate and register cleanly' : `${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
