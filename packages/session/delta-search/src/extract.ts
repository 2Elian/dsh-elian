/**
 * Turn one logged session event into the spans a query may match.
 *
 * The harness's own `extractSessionEventText` deliberately returns nothing for
 * `reasoning` blocks, which is exactly the content this search exists to cover.
 * Extraction therefore walks the event payloads here instead of reusing it.
 * Every field is read structurally: the log is a durable boundary, so an
 * unexpected payload yields fewer spans rather than an exception.
 */

import type { RawEventLike, SearchDocument, SearchSegment, SegmentKind } from './types.ts'

/** One span read out of a payload, before it is attached to an event. */
interface BlockSpan {
  readonly kind: SegmentKind
  readonly text: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Read every searchable span out of one content-block array.
 * @param blocks - a `ContentBlock[]` from a message, however malformed.
 * @param textKind - kind assigned to plain `text` blocks (context differs from assistant prose).
 * @returns the spans in block order.
 */
function blockSpans(blocks: unknown, textKind: SegmentKind): BlockSpan[] {
  if (!Array.isArray(blocks)) return []
  const spans: BlockSpan[] = []
  for (const raw of blocks) {
    if (!isRecord(raw)) continue
    const direct = text(raw.text)
    if (raw.type === 'reasoning') {
      if (direct !== undefined) spans.push({ kind: 'reasoning', text: direct })
      continue
    }
    if (raw.type === 'tool-call' || raw.type === 'tool-result') {
      const head = [text(raw.name), text(raw.arguments) ?? text(raw.input)].filter((part): part is string => part !== undefined).join(' ')
      if (head !== '') spans.push({ kind: 'tool-call', text: head })
      spans.push(...blockSpans(raw.content, 'tool-result'))
      continue
    }
    if (direct !== undefined) {
      spans.push({ kind: textKind, text: direct })
      continue
    }
    // Image and file blocks carry references, not prose, but a nested content
    // array still holds anything the producer chose to inline.
    spans.push(...blockSpans(raw.content, textKind))
  }
  return spans
}

/**
 * Read reasoning and text out of an assistant stream record.
 * `assistant/attempt` commits no message, so its stream is the only evidence.
 * @param stream - the event's `stream` array.
 * @returns the spans in record order.
 */
function streamSpans(stream: unknown): BlockSpan[] {
  if (!Array.isArray(stream)) return []
  const spans: BlockSpan[] = []
  for (const raw of stream) {
    if (!isRecord(raw)) continue
    const kind: SegmentKind = raw.type === 'reasoning-chunks' ? 'reasoning' : 'assistant'
    if (!Array.isArray(raw.texts)) continue
    for (const chunk of raw.texts) {
      const chunkText = text(chunk)
      if (chunkText !== undefined) spans.push({ kind, text: chunkText })
    }
  }
  return spans
}

/** Message payload of `tool/result`, whose content is the model-facing result body. */
function toolResultSpans(data: Record<string, unknown>): BlockSpan[] {
  const spans = blockSpans(isRecord(data.message) ? data.message.content : undefined, 'tool-result')
  const error = isRecord(data.error) ? data.error : undefined
  if (error !== undefined) {
    const reason = [text(error.name), text(error.code), text(error.reason)].filter((part): part is string => part !== undefined).join(' ')
    if (reason !== '') spans.push({ kind: 'tool-result', text: reason })
  }
  return spans
}

/**
 * Project one event-window entry into a searchable document.
 * @param event - raw session event from the browser transcript window.
 * @returns the document, or `undefined` when the event carries no text.
 */
export function documentFromEvent(event: RawEventLike): SearchDocument | undefined {
  const data = isRecord(event.data) ? event.data : {}
  const turn = number(data.turn) ?? null
  const step = number(data.step) ?? null
  let spans: BlockSpan[]

  switch (event.type) {
    case 'user/message': {
      const source = isRecord(data.source) ? data.source : undefined
      // Injected context (skills, workspace rules, cron notices) is user-role on
      // the wire but is not something the reader typed.
      spans = blockSpans(data.content, source?.kind === 'user' ? 'user' : 'context')
      break
    }
    case 'assistant/message':
      spans = blockSpans(isRecord(data.message) ? data.message.content : undefined, 'assistant')
      break
    case 'assistant/attempt':
      spans = streamSpans(data.stream)
      break
    case 'system/message':
      spans = blockSpans(isRecord(data.message) ? data.message.content : undefined, 'context')
      break
    case 'tool/call': {
      const head = [text(data.name), text(data.arguments)].filter((part): part is string => part !== undefined).join(' ')
      spans = head === '' ? [] : [{ kind: 'tool-call', text: head }]
      break
    }
    case 'tool/result':
      spans = toolResultSpans(data)
      break
    case 'todo/write': {
      const head = [text(data.status), text(data.content)].filter((part): part is string => part !== undefined).join(' ')
      spans = head === '' ? [] : [{ kind: 'note', text: head }]
      break
    }
    default:
      // Every other event type is structural (turn/step boundaries, headers,
      // retries, sandbox and permission modes) and carries no user-facing prose.
      return undefined
  }

  if (spans.length === 0) return undefined
  const segments: SearchSegment[] = spans.map(span => ({ kind: span.kind, text: span.text }))
  return { seq: event.seq, eventType: event.type, time: event.time ?? 0, turn, step, segments }
}

/**
 * Project a whole event window, dropping events with no text.
 * @param events - the window's raw events, in ascending seq order.
 * @returns documents in the same order.
 */
export function buildDocuments(events: readonly RawEventLike[]): SearchDocument[] {
  const documents: SearchDocument[] = []
  for (const event of events) {
    const document = documentFromEvent(event)
    if (document !== undefined) documents.push(document)
  }
  return documents
}
