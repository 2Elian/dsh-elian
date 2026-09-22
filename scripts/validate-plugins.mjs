/**
 * Validate each plugin against the harness's OWN client-module contract.
 *
 * Run after `node build.mjs` in each plugin:
 *
 *   node scripts/validate-plugins.mjs [path/to/deepseek-harness]
 *
 * It imports the harness checkout's built `parseDshClient` rather than
 * restating the rules, then reproduces the two things `ClientModuleRegistry`
 * does at activation: resolve `exports["./client"]` relative to the manifest
 * directory, and confirm the bundle registers exactly the package name through
 * `window.__ModuleLoader__.load({ id })`.
 */

import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { globSync } from 'node:fs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const HARNESS = resolve(process.argv[2] ?? 'E:/Project/deepseek-harness')

const parserPath = join(HARNESS, 'packages/client/modules/lib/types/client/manifest.js')
const { parseDshClient } = await import(pathToFileURL(parserPath).href)

let failures = 0
const ok = (condition, message) => {
  console.log(`${condition ? '  ok  ' : ' FAIL '} ${message}`)
  if (!condition) failures += 1
}

const manifests = [
  ...globSync('plugins/*/package.json', { cwd: ROOT }),
].sort()

if (manifests.length === 0) {
  console.error('no plugin manifests found')
  process.exit(1)
}

for (const relative of manifests) {
  const dir = join(ROOT, dirname(relative))
  const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  console.log(`\n${manifest.name ?? relative}`)

  if (manifest.dsh === undefined) {
    console.log('  --   not a client plugin; skipped')
    continue
  }

  let declaration
  try {
    declaration = parseDshClient(manifest.name, manifest.dsh.client)
    ok(declaration.platform === 'web', `dsh.client.platform === "web" (got ${String(declaration.platform)})`)
  } catch (error) {
    ok(false, `parseDshClient rejected the declaration: ${String(error)}`)
    continue
  }

  // The scanner resolves exports["./client"] as a path beside the manifest,
  // not through Node's exports resolution.
  const clientEntry = manifest.exports?.['./client']
  const relativeBundle = typeof clientEntry === 'string' ? clientEntry : clientEntry?.default
  ok(typeof relativeBundle === 'string', 'exports["./client"] is declared')
  if (typeof relativeBundle !== 'string') continue

  const bundlePath = join(dir, relativeBundle)
  let bundleSize = 0
  try {
    bundleSize = (await stat(bundlePath)).size
  } catch {
    ok(false, `${relativeBundle} is missing — run \`node build.mjs\` in ${manifest.name}`)
    continue
  }
  ok(bundleSize > 0, `${relativeBundle} exists (${bundleSize} bytes)`)

  const source = await readFile(bundlePath, 'utf8')
  const header = `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)},`
  ok(source.startsWith(header), `bundle registers id "${manifest.name}"`)
  ok(source.trimEnd().endsWith('return module.exports; } });'), 'bundle closes the loader factory')

  const requires = new Set()
  for (const match of source.matchAll(/require\("([^"]+)"\)/gu)) requires.add(match[1])
  const platform = new Set([
    'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
    ...(declaration.external ?? []),
  ])
  const unbundled = [...requires].filter(specifier => !platform.has(specifier))
  ok(unbundled.length === 0, `every require() is module-table answered (${[...requires].join(', ') || 'none'})`)

  const hostEntry = join(dir, manifest.exports?.['.'] ?? '')
  ok(manifest.exports?.['.'] !== undefined, 'host entry declared')
  if (manifest.exports?.['.'] !== undefined) {
    ok((await stat(hostEntry)).size > 0, 'host entry exists')
    // Existence is not enough: the Loader *imports* this file, so a TypeScript
    // annotation left in a .js host half is a syntax error that silently turns
    // the whole plugin into a non-activating optional entry (a warning at boot,
    // no error, nothing rendered). Import it exactly as the Loader would.
    try {
      const host = await import(pathToFileURL(hostEntry).href)
      ok(typeof host.apply === 'function', 'host entry imports and exports apply()')
    } catch (error) {
      ok(false, `host entry failed to import: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

console.log(`\n${failures === 0 ? 'all plugin contracts satisfied' : `${failures} check(s) failed`}`)
process.exit(failures === 0 ? 0 : 1)
