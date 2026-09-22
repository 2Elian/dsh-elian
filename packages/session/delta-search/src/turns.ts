/**
 * User-turn outline over a session event window.
 *
 * `ui-chat` merges its loaded turns with the host `turnOutline` projection to
 * build the rail. A plugin sees neither, so this rebuilds the same list from
 * the events it already holds. Each entry keeps `turn/start`'s seq — the paging
 * cursor for a turn that is not loaded yet — and the transcript row keys that
 * land on it.
 */

import { anchorKeysForEvent } from './anchors.ts'
import type { RawEventLike, TurnItem } from './types.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Which content-block kind a caller wants joined: assistant prose, or its reasoning. */
type WantedBlock = 'text' | 'reasoning'

function plainText(blocks: unknown, wanted: WantedBlock): string {
  if (!Array.isArray(blocks)) return ''
  const parts: string[] = []
  for (const raw of blocks) {
    if (!isRecord(raw)) continue
    if (typeof raw.text !== 'string') continue
    if (raw.type === wanted) parts.push(raw.text)
  }
  return parts.join('\n').trim()
}

interface MutableTurn {
  turn: number
  seq: number
  time: number
  prompt: string
  response: string
  anchorKeys: readonly string[]
}

/**
 * Build the session's user-turn list.
 *
 * A turn's prompt is the first human `user/message` inside it — the same rule
 * the host outline uses, so injected context never shows up as the prompt. The
 * response is the last assistant text of the turn, matching the rail's
 * `findLast` semantics.
 * @param events - the event window's raw events, ascending by seq.
 * @returns one entry per started turn, ascending.
 */
export function buildTurnItems(events: readonly RawEventLike[]): TurnItem[] {
  const items: MutableTurn[] = []
  let current: MutableTurn | undefined

  for (const event of events) {
    const data = isRecord(event.data) ? event.data : {}
    switch (event.type) {
      case 'turn/start': {
        const turn = typeof data.turn === 'number' ? data.turn : undefined
        if (turn === undefined) break
        if (current !== undefined) items.push(current)
        // The tail row is the fallback target: a turn whose prompt row is not
        // loaded still has a row to land on once the turn itself is present.
        current = { turn, seq: event.seq, time: event.time ?? 0, prompt: '', response: '', anchorKeys: anchorKeysForEvent(event) }
        break
      }
      case 'user/message': {
        if (current === undefined || current.prompt !== '') break
        if (!isRecord(data.source) || data.source.kind !== 'user') break
        current.prompt = plainText(data.content, 'text')
        const keys = anchorKeysForEvent(event)
        if (keys.length > 0) current.anchorKeys = [...keys, ...current.anchorKeys]
        break
      }
      case 'assistant/message': {
        if (current === undefined) break
        const message = isRecord(data.message) ? data.message : undefined
        const body = plainText(message?.content, 'text')
        if (body !== '') current.response = body
        break
      }
      default:
        break
    }
  }
  if (current !== undefined) items.push(current)
  return items
}

/**
 * Preview one turn's text for a list row.
 * @param value - full text, possibly empty.
 * @param maxLength - maximum characters kept.
 * @returns the collapsed preview.
 */
export function preview(value: string, maxLength = 120): string {
  const normalized = value.replaceAll(/\s+/gu, ' ').trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`
}
