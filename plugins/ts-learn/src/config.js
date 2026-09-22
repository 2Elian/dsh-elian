/**
 * Validated plugin configuration.
 *
 * Every deployment-varying choice is a declared field so a profile can change
 * it from `cordis.patch.yml`; nothing here is a hidden constant. Bad values
 * fail at load with the offending field named, because a silently ignored
 * option is worse than a refused boot.
 *
 * @module config
 */

import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Default values for every accepted field. */
export const CONFIG_DEFAULTS = Object.freeze({
  openBrowser: true,
  promptSection: true,
  autoReview: true,
  runTimeoutMs: 15000,
  caseTimeoutMs: 4000,
  memoryMb: 256,
  workDir: '',
  maxChallenges: 32,
  recentProblemWindow: 5,
  routePrefix: '/ts-learn',
  allowRemote: false,
  maxSourceBytes: 200000,
})

/**
 * Read one boolean field.
 * @param config - raw config object.
 * @param field - field name.
 * @param errors - accumulator receiving failures.
 * @returns the resolved value.
 */
function booleanField(config, field, errors) {
  const value = config[field]
  if (value === undefined) return CONFIG_DEFAULTS[field]
  if (typeof value !== 'boolean') {
    errors.push(`${field}: 需要布尔值，得到 ${typeof value}`)
    return CONFIG_DEFAULTS[field]
  }
  return value
}

/**
 * Read one positive-integer field.
 * @param config - raw config object.
 * @param field - field name.
 * @param errors - accumulator receiving failures.
 * @returns the resolved value.
 */
function integerField(config, field, errors) {
  const value = config[field]
  if (value === undefined) return CONFIG_DEFAULTS[field]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    errors.push(`${field}: 需要正整数，得到 ${JSON.stringify(value)}`)
    return CONFIG_DEFAULTS[field]
  }
  return value
}

/**
 * Read one non-empty string field.
 * @param config - raw config object.
 * @param field - field name.
 * @param errors - accumulator receiving failures.
 * @returns the resolved value.
 */
function stringField(config, field, errors) {
  const value = config[field]
  if (value === undefined) return CONFIG_DEFAULTS[field]
  if (typeof value !== 'string') {
    errors.push(`${field}: 需要字符串，得到 ${typeof value}`)
    return CONFIG_DEFAULTS[field]
  }
  return value
}

/**
 * Resolve and validate the row config of this plugin.
 * @param raw - the `config` object from `cordis.patch.yml`, if any.
 * @returns the complete resolved configuration.
 * @throws when a declared field has an unsupported type or value.
 */
export function resolveConfig(raw) {
  const config = raw ?? {}
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new TypeError('ts-learn: config 必须是一个对象')
  }
  const errors = []

  const known = new Set(Object.keys(CONFIG_DEFAULTS))
  for (const key of Object.keys(config)) {
    if (!known.has(key)) errors.push(`未知配置项 "${key}"（可用：${[...known].join(', ')}）`)
  }

  const resolved = {
    openBrowser: booleanField(config, 'openBrowser', errors),
    promptSection: booleanField(config, 'promptSection', errors),
    autoReview: booleanField(config, 'autoReview', errors),
    allowRemote: booleanField(config, 'allowRemote', errors),
    runTimeoutMs: integerField(config, 'runTimeoutMs', errors),
    caseTimeoutMs: integerField(config, 'caseTimeoutMs', errors),
    memoryMb: integerField(config, 'memoryMb', errors),
    maxChallenges: integerField(config, 'maxChallenges', errors),
    recentProblemWindow: integerField(config, 'recentProblemWindow', errors),
    maxSourceBytes: integerField(config, 'maxSourceBytes', errors),
    workDir: stringField(config, 'workDir', errors) || join(tmpdir(), 'dsh-ts-learn'),
    routePrefix: stringField(config, 'routePrefix', errors),
  }

  if (!resolved.routePrefix.startsWith('/')) errors.push('routePrefix: 必须以 / 开头')
  if (resolved.routePrefix.endsWith('/')) errors.push('routePrefix: 不能以 / 结尾')
  if (resolved.caseTimeoutMs > resolved.runTimeoutMs) {
    errors.push('caseTimeoutMs: 不能大于 runTimeoutMs')
  }
  if (resolved.memoryMb < 64) errors.push('memoryMb: 至少 64')

  if (errors.length > 0) {
    throw new TypeError(`ts-learn: 配置无效：\n  - ${errors.join('\n  - ')}`)
  }
  return Object.freeze(resolved)
}

/**
 * Deadline for one submission run: the wall-clock ceiling, itself capped by the
 * per-case budget so a long case list cannot outlive a per-case expectation.
 * @param config - resolved configuration.
 * @param caseCount - how many cases the run will attempt.
 * @returns the timeout in milliseconds.
 */
export function runDeadlineMs(config, caseCount) {
  return Math.max(1000, Math.min(config.runTimeoutMs, config.caseTimeoutMs * Math.max(1, caseCount)))
}
