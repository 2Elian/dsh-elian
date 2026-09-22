/**
 * Reactive read of a session's browser-side event window.
 *
 * A panel needs the transcript as data, not as DOM: row anchors are enough to
 * *land* on a result, but the text a query matches against has to come from the
 * events. The Conversation assembly already holds a contiguous window in the
 * browser at `ctx.sessions.binding(id).eventSource`, so this adapts that source
 * into the `getSnapshot`/`subscribe` pair a slot `hooks` entry exposes.
 *
 * The snapshot object identity is stable between changes, which the renderer's
 * `useSyncExternalStore` binding requires.
 */

import type { RawEventLike } from './types.ts'
import type { SessionBinding, SessionEventSource, SessionsService } from './surface.ts'

/** The transcript as a panel consumes it. */
export interface TranscriptSnapshot {
  /** Events in ascending seq order. */
  readonly entries: readonly RawEventLike[]
  /** Whether older history is still available to page in. */
  readonly hasMore: boolean
  /** Whether a retained session generation was reachable at all. */
  readonly available: boolean
}

/** Stable observable a slot `hooks` compartment turns into a selector hook. */
export interface TranscriptSource {
  /** @returns the current snapshot, identity-stable between changes. */
  getSnapshot(): TranscriptSnapshot
  /** @param listener - change callback. @returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
}

const UNAVAILABLE: TranscriptSnapshot = { entries: [], hasMore: false, available: false }
/** How often an unresolved session binding is retried while a panel is mounted. */
const BINDING_POLL_MS = 250

/**
 * Adapt the browser's session event source into a stable observable.
 * @param sessions - the client session registry, when the profile provides one.
 * @param sessionId - the session whose transcript is read.
 * @returns the observable; it reports `available: false` until a generation exists.
 */
export function createTranscriptSource(
  sessions: SessionsService | undefined,
  sessionId: string,
): TranscriptSource {
  let cachedWindow: unknown
  let cached: TranscriptSnapshot = UNAVAILABLE

  const readBinding = (): SessionBinding | undefined => sessions?.binding?.(sessionId)

  const snapshot = (): TranscriptSnapshot => {
    const source = readBinding()?.eventSource
    if (source === undefined) {
      if (cachedWindow === undefined) return cached
      cachedWindow = undefined
      cached = UNAVAILABLE
      return cached
    }
    const window = source.getSnapshot()
    if (window === cachedWindow) return cached
    cachedWindow = window
    const entries: RawEventLike[] = []
    for (const entry of window.entries) {
      // A transient live chunk is duplicated by the durable event that settles
      // it, so indexing both would report every streamed token twice.
      if (entry.type !== 'event') continue
      entries.push({
        type: entry.event.type,
        seq: entry.event.seq,
        ...entry.event.time === undefined ? {} : { time: entry.event.time },
        ...entry.event.data === undefined ? {} : { data: entry.event.data },
      })
    }
    cached = { entries, hasMore: window.hasMore, available: true }
    return cached
  }

  return {
    getSnapshot: snapshot,
    subscribe(listener) {
      let attached: SessionEventSource | undefined
      let unsubscribe: (() => void) | undefined
      let poll: ReturnType<typeof setInterval> | undefined

      const attach = (): void => {
        const source = readBinding()?.eventSource
        if (source === attached) return
        unsubscribe?.()
        attached = source
        unsubscribe = source?.subscribe(listener)
        if (source !== undefined && poll !== undefined) {
          clearInterval(poll)
          poll = undefined
        }
        if (source === undefined && poll === undefined) {
          poll = setInterval(() => { attach(); listener() }, BINDING_POLL_MS)
        }
      }

      attach()
      return () => {
        unsubscribe?.()
        if (poll !== undefined) clearInterval(poll)
      }
    },
  }
}
