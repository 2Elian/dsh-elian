/**
 * Search vocabulary for one DeepSeek Harness Session's event window.
 *
 * The input is the browser-side transcript (`SessionEventSource`), whose
 * entries are raw `SessionEvent`s. Nothing here imports a harness package:
 * the extractor reads the log's published JSON shape, which is the durable
 * wire boundary, so a malformed event degrades instead of throwing.
 */

/** What a matched text span came from. Drives both filtering and the result badge. */
export type SegmentKind =
  | 'user'
  | 'assistant'
  | 'reasoning'
  | 'tool-call'
  | 'tool-result'
  | 'context'
  | 'note'

/** One contiguous searchable span of one event. */
export interface SearchSegment {
  readonly kind: SegmentKind
  readonly text: string
}

/** One event reduced to the spans a query may match. */
export interface SearchDocument {
  readonly seq: number
  readonly eventType: string
  readonly time: number
  readonly turn: number | null
  readonly step: number | null
  readonly segments: readonly SearchSegment[]
}

/** How a query is matched. Substring by default, because that is what a user expects from a find box. */
export interface SearchOptions {
  /** Match letter case. Default: case-insensitive. */
  readonly caseSensitive?: boolean
  /** Require each term to sit on word boundaries. Default: false. */
  readonly wholeWord?: boolean
  /** Restrict matches to these span kinds. Omitted searches every kind. */
  readonly kinds?: readonly SegmentKind[]
  /** Maximum hits returned. Default: 200. */
  readonly limit?: number
  /** Characters of context kept on each side of a match. Default: 60. */
  readonly context?: number
}

/** One matched occurrence, carrying everything the caller needs to render and to land on it. */
export interface SearchHit {
  readonly seq: number
  readonly eventType: string
  readonly time: number
  readonly turn: number | null
  readonly step: number | null
  readonly kind: SegmentKind
  /** Text before the match inside the snippet. */
  readonly before: string
  /** The matched text, exactly as it appears in the log. */
  readonly match: string
  /** Text after the match inside the snippet. */
  readonly after: string
  /** 1-based occurrence index inside its own segment. */
  readonly ordinal: number
}

/** One user turn of the session. */
export interface TurnItem {
  readonly turn: number
  /** Seq of `turn/start`; page history back through it to load the whole turn. */
  readonly seq: number
  readonly time: number
  /** Full prompt text when loaded, otherwise the empty string. */
  readonly prompt: string
  /** Final assistant text of the turn when it settled, otherwise the empty string. */
  readonly response: string
  /**
   * Transcript row keys that land on this turn, most specific first: the
   * prompt's own row when it is loaded, otherwise the turn's tail row.
   */
  readonly anchorKeys: readonly string[]
}

/** Minimum shape the extractor reads from one event-window entry. */
export interface RawEventLike {
  readonly type: string
  readonly seq: number
  readonly time?: number
  readonly data?: unknown
}
