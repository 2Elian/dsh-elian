/**
 * Isolated single-file TypeScript runner for one ts-learn submission.
 *
 * The runner writes an isolated directory containing the learner's
 * `submission.ts`, a generated `cases.json`, and a copy of `driver.mjs`, then
 * executes it with the current Node binary. Isolation is process-level: a fresh
 * directory, a scrubbed environment, a memory cap, and a hard wall-clock kill.
 *
 * The authoritative judgement of a submission is the reviewing agent's own
 * sandboxed re-run; this runner exists to give the browser immediate, precise
 * sample-case feedback and to hand the agent exact failing cases.
 *
 * @module runner
 */

import { spawn } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Line prefix the driver uses for its machine-readable frames. */
export const RESULT_MARKER = '__TS_LEARN_RESULT__'

/** Byte cap for one captured stream before the runner stops appending. */
const STREAM_CAP_BYTES = 64 * 1024

/** Byte cap for one rendered value inside a case frame. */
const VALUE_CAP_CHARS = 2000

const DRIVER_SOURCE = fileURLToPath(new URL('./driver.mjs', import.meta.url))

/**
 * Whether this Node can execute a `.ts` file without a separate build step.
 * Node 22.18+/23.6+ strip types by default; older lines need the explicit flag.
 * @returns {{ supported: boolean, extraArgs: string[] }} capability plus the flags to pass.
 */
export function typescriptCapability() {
  const feature = process.features?.typescript
  if (feature === 'strip' || feature === 'transform') return { supported: true, extraArgs: [] }
  return { supported: true, extraArgs: ['--experimental-strip-types'] }
}

/**
 * Launch environment for the child: no inherited secrets, no inherited
 * `NODE_OPTIONS`, and only the platform variables Node itself needs.
 * @param workDir - the isolated directory, reused as the child's temp space.
 * @returns the environment object handed to `spawn`.
 */
function childEnv(workDir) {
  const env = {
    PATH: process.env.PATH ?? '',
    TEMP: workDir,
    TMP: workDir,
    TMPDIR: workDir,
  }
  if (process.platform === 'win32') {
    env.SystemRoot = process.env.SystemRoot ?? 'C:\\Windows'
    env.PATHEXT = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD'
    if (process.env.USERPROFILE !== undefined) env.USERPROFILE = process.env.USERPROFILE
  }
  return env
}

/**
 * Accumulate one child stream under a byte cap.
 * @returns {{ push(chunk: Buffer): void, text(): string, overflowed(): boolean }} the collector.
 */
function createCollector() {
  const chunks = []
  let size = 0
  let overflowed = false
  return {
    push(chunk) {
      if (size >= STREAM_CAP_BYTES) {
        overflowed = true
        return
      }
      const room = STREAM_CAP_BYTES - size
      const slice = chunk.length > room ? chunk.subarray(0, room) : chunk
      if (slice.length < chunk.length) overflowed = true
      chunks.push(slice)
      size += slice.length
    },
    text() {
      return Buffer.concat(chunks).toString('utf8')
    },
    overflowed() {
      return overflowed
    },
  }
}

/**
 * Split raw stdout into the driver's frames and the learner's own output.
 * @param raw - complete stdout text.
 * @returns parsed frames in order plus the leftover learner output.
 */
export function parseFrames(raw) {
  const frames = []
  const passthrough = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith(RESULT_MARKER)) {
      if (line.length > 0) passthrough.push(line)
      continue
    }
    try {
      frames.push(JSON.parse(line.slice(RESULT_MARKER.length)))
    } catch (error) {
      // A frame the driver wrote but the parent cannot read means the learner's
      // code corrupted stdout; surface it rather than guessing at the content.
      passthrough.push(`[runner] 无法解析判题帧：${error.message}`)
    }
  }
  return { frames, passthrough }
}

/** Truncate a rendered value for transport and display. */
function clampText(text) {
  return text.length <= VALUE_CAP_CHARS ? text : `${text.slice(0, VALUE_CAP_CHARS)}…（已截断）`
}

/**
 * Execute one submission against one case list.
 *
 * @param options - run inputs.
 * @param options.source - the learner's complete TypeScript source.
 * @param options.entry - exported function name the driver calls.
 * @param options.tests - ordered cases; each is `{ name, args, expected, compare? }`.
 * @param options.timeoutMs - hard wall-clock ceiling for the whole child process.
 * @param options.workRoot - parent directory for the isolated run directory.
 * @param options.memoryMb - V8 old-space cap for the child.
 * @param options.keep - keep the run directory for inspection instead of deleting it.
 * @returns the run outcome: one record per executed case plus infrastructure facts.
 */
export async function runSubmission({
  source,
  entry,
  tests,
  timeoutMs,
  workRoot,
  memoryMb = 256,
  keep = false,
}) {
  await mkdir(workRoot, { recursive: true })
  const dir = await mkdtemp(join(workRoot, 'run-'))
  const startedAt = Date.now()
  const capability = typescriptCapability()

  await writeFile(join(dir, 'package.json'), '{"type":"module"}\n', 'utf8')
  await writeFile(join(dir, 'submission.ts'), source, 'utf8')
  await writeFile(join(dir, 'cases.json'), JSON.stringify({ entry, tests }), 'utf8')
  await copyFile(DRIVER_SOURCE, join(dir, 'driver.mjs'))

  const stdout = createCollector()
  const stderr = createCollector()

  const outcome = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [
        '--no-warnings',
        ...capability.extraArgs,
        `--max-old-space-size=${memoryMb}`,
        'driver.mjs',
      ],
      {
        cwd: dir,
        env: childEnv(dir),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
      },
    )
    child.stdout.on('data', chunk => stdout.push(chunk))
    child.stderr.on('data', chunk => stderr.push(chunk))
    child.on('error', (error) => resolve({ exitCode: null, signal: null, spawnError: error.message }))
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal, spawnError: null }))
  })

  const elapsedMs = Date.now() - startedAt
  const { frames, passthrough } = parseFrames(stdout.text())
  const caseFrames = frames.filter(frame => frame.kind === 'case')
  const terminal = frames.find(frame => frame.kind !== 'case') ?? null
  const timedOut = outcome.signal === 'SIGKILL' && caseFrames.length < tests.length

  if (!keep) {
    await rm(dir, { recursive: true, force: true }).catch(() => {
      // A leftover run directory is inert temp data; failing the run because
      // cleanup lost a race would hide the result the learner is waiting for.
    })
  }

  return {
    dir: keep ? dir : null,
    elapsedMs,
    timedOut,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    spawnError: outcome.spawnError,
    compileError: terminal?.kind === 'compile-error' ? terminal.message : null,
    entryMissing: terminal?.kind === 'entry-missing' ? terminal.entry : null,
    cases: caseFrames.map(frame => ({
      index: frame.index,
      name: frame.name,
      passed: frame.passed === true,
      expected: clampText(frame.expected ?? ''),
      actual: clampText(frame.actual ?? ''),
      error: frame.error === undefined || frame.error === null ? null : clampText(String(frame.error)),
      ms: frame.ms ?? null,
    })),
    completed: terminal?.kind === 'done',
    learnerOutput: clampText(passthrough.join('\n')),
    stderr: clampText(stderr.text()),
    stderrOverflowed: stderr.overflowed(),
  }
}

/**
 * Convenience helper: run one submission and reduce it to a pass/fail verdict.
 * @param options - the same inputs {@link runSubmission} accepts.
 * @returns the run outcome plus `passed`/`total` counts.
 */
export async function judgeSubmission(options) {
  const run = await runSubmission(options)
  const passed = run.cases.filter(item => item.passed).length
  return { ...run, passed, total: options.tests.length }
}

/** Directory of this module, exported so callers can locate shipped assets. */
export const moduleDir = dirname(fileURLToPath(import.meta.url))
