/**
 * Client-bundle emitter for out-of-repo DeepSeek Harness UI plugins.
 *
 * A harness client bundle is a lazy CommonJS factory registered with the
 * browser's module table:
 *
 *     window.__ModuleLoader__.load({ id, factory: (require) => { ... } })
 *
 * The repository's own `clientBundle()` tsdown preset cannot run outside the
 * checkout (`workspaceManifest()` globs `packages/* / * /package.json` under the
 * repo root), and the harness documents that an external author must reproduce
 * the artifact format. This script does exactly that with esbuild: the bundle
 * stays CommonJS, every platform module stays a `require()` the injected loader
 * answers, and everything else is inlined.
 *
 * The registered `id` must equal the package name; the loader throws
 * `bundle ... loaded without registering "<id>"` on a mismatch.
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, context } from 'esbuild'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Specifiers the browser's frozen module table answers.
 * Mirrors `PLATFORM_MODULES` in `packages/client/web/src/platform.ts`.
 */
export const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const LOADER_OPEN = 'window.__ModuleLoader__.load({ id: %ID%, factory: (require) => {'
const CJS_PREAMBLE = 'var module = { exports: {} }; var exports = module.exports;'
const LOADER_CLOSE = 'return module.exports; } });'

/**
 * Emit one plugin's `client.js` from `src/client/index.ts`.
 * @param packageDir - absolute path of the plugin package directory.
 * @param options - `watch` keeps a rebuild loop alive until the process is killed.
 * @returns resolves once a one-shot build finishes.
 */
export async function bundleClient(packageDir, options = {}) {
  const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8'))
  const id = manifest.name
  if (typeof id !== 'string' || id === '') throw new Error(`${packageDir}: package.json declares no name`)
  const external = [...PLATFORM_MODULES, ...(manifest.dsh?.client?.external ?? [])]
  const config = {
    absWorkingDir: packageDir,
    entryPoints: [join(packageDir, 'src/client/index.ts')],
    outfile: join(packageDir, 'client.js'),
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2022'],
    jsx: 'automatic',
    jsxDev: false,
    sourcemap: false,
    minify: false,
    // A requested specifier stays an import the module table must answer;
    // every other dependency is inlined, because an unanswerable require()
    // throws at factory execution.
    external,
    banner: { js: LOADER_OPEN.replace('%ID%', JSON.stringify(id)) + ' ' + CJS_PREAMBLE },
    footer: { js: LOADER_CLOSE },
    logLevel: 'info',
  }
  if (options.watch === true) {
    const watcher = await context(config)
    await watcher.watch()
    console.log(`[client-bundle] watching ${id}`)
    return
  }
  await build(config)
  console.log(`[client-bundle] wrote ${join(packageDir, 'client.js')} for ${id}`)
}

/** Run the emitter for the plugin package that owns the calling build script. */
export async function bundleSelf() {
  const caller = process.argv[1]
  if (caller === undefined) throw new Error('client-bundle: no calling script path')
  await bundleClient(dirname(caller), { watch: process.argv.includes('--watch') })
}

export { HERE }
