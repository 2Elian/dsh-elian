/**
 * Per-session open/closed state for a plugin panel.
 *
 * A toggle button and the panel it opens are two independent slot entries, so
 * they cannot share React state. They share this observable instead, keyed by
 * session so switching conversations does not carry one session's open panel
 * into another.
 */

/** Whether a panel is showing. */
export interface OpenState {
  readonly open: boolean
}

/** Stable observable handed to both slot entries. */
export interface OpenSource {
  /** @returns the current state, identity-stable between changes. */
  getSnapshot(): OpenState
  /** @param listener - change callback. @returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
}

/** Registry of per-session panel state. */
export interface OpenRegistry {
  /** @param sessionId - the viewed session. @returns its stable observable. */
  sourceFor(sessionId: string): OpenSource
  /** Flip the panel for one session. */
  toggle(sessionId: string): void
  /** Hide the panel for one session. */
  close(sessionId: string): void
}

interface Entry {
  value: OpenState
  readonly listeners: Set<() => void>
  readonly source: OpenSource
}

const CLOSED: OpenState = { open: false }
const OPEN: OpenState = { open: true }

function createEntry(): Entry {
  const entry: Entry = {
    value: CLOSED,
    listeners: new Set(),
    source: {
      getSnapshot: () => entry.value,
      subscribe(listener) {
        entry.listeners.add(listener)
        return () => { entry.listeners.delete(listener) }
      },
    },
  }
  return entry
}

/**
 * Create a panel-state registry for one plugin instance.
 * @returns the registry; state is process-local and dies with the plugin.
 */
export function createOpenRegistry(): OpenRegistry {
  const entries = new Map<string, Entry>()
  const entryFor = (sessionId: string): Entry => {
    const existing = entries.get(sessionId)
    if (existing !== undefined) return existing
    const created = createEntry()
    entries.set(sessionId, created)
    return created
  }
  const set = (sessionId: string, open: boolean): void => {
    const entry = entryFor(sessionId)
    const next = open ? OPEN : CLOSED
    if (entry.value === next) return
    entry.value = next
    for (const listener of [...entry.listeners]) listener()
  }
  return {
    sourceFor: sessionId => entryFor(sessionId).source,
    toggle: sessionId => { set(sessionId, !entryFor(sessionId).value.open) },
    close: sessionId => { set(sessionId, false) },
  }
}
