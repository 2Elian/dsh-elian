/**
 * The DeepSeek Harness browser surfaces this library reads.
 *
 * A package outside the harness checkout cannot import harness value modules,
 * and a client bundle resolves only the platform module table through its
 * injected `require`. These declarations restate the small slice needed to read
 * a session transcript in the browser; each names the source that owns it, so a
 * drift is a one-line fix rather than a silent `undefined`.
 */

/** One entry of the browser's contiguous session event window. */
export interface SessionEventWindowEntry {
  /** `transient` carries a client-only live chunk, which the durable log also delivers. */
  readonly type: 'event' | 'transient'
  readonly event: {
    readonly type: string
    readonly seq: number
    readonly time?: number
    readonly data?: unknown
  }
}

/**
 * The reactive transcript the Conversation assembly reads.
 * Source: `@deepseek-ai/dsh-api-session-controller/client` (`contract/events.ts`).
 */
export interface SessionEventSource {
  /** @returns the current window; the object identity is stable between changes. */
  getSnapshot(): { readonly entries: readonly SessionEventWindowEntry[], readonly hasMore: boolean }
  /** @param listener - change callback. @returns the unsubscribe function. */
  subscribe(listener: () => void): () => void
}

/**
 * The outward session face.
 * Source: `@deepseek-ai/dsh-api-session-controller/client` (`contract/session.ts`).
 */
export interface SessionFace {
  /** Page history back through `seq`. */
  loadThrough?(seq: number): Promise<unknown>
  /** Page one more page of older history. */
  loadOlder?(): Promise<unknown>
}

/**
 * One retained session generation.
 * Source: `@deepseek-ai/dsh-api-session-controller/client` (`client/sessions/service.ts`).
 */
export interface SessionBinding {
  readonly session?: SessionFace
  readonly eventSource?: SessionEventSource
}

/**
 * One session-scoped context.
 *
 * Services such as `conversation` exist only inside a session scope — calling
 * one from a root context throws `requires a session scope — address one via
 * ctx.sessions.scope(id).conversation`. A root-mounted plugin therefore reaches
 * them through this handle rather than by declaring them in its `inject` list.
 */
export interface SessionScopeContext {
  /** @param name - service name. @returns the session-scoped service, or `undefined`. */
  get(name: string): unknown
}

/**
 * The client session registry.
 *
 * `binding(id)` borrows an already-retained generation and returns `undefined`
 * when nothing holds one. The Conversation view retains while it is open, which
 * is the only time a transcript-reading panel is mounted.
 * `scope(id)` borrows the session-scoped context the same way.
 * Source: `@deepseek-ai/dsh-api-session-controller/client` (`contract/sessions.ts`).
 */
export interface SessionsService {
  binding?(sessionId: string): SessionBinding | undefined
  scope?(sessionId: string): SessionScopeContext | undefined
}

/**
 * The scoped conversation verbs. Reach it with
 * `ctx.sessions.scope(sessionId)?.get('conversation')`.
 * Source: `@deepseek-ai/dsh-client-ui-conversation` (`client/service.ts`).
 */
export interface ConversationService {
  /** Pull one older history page for the scoped session. */
  loadOlder(): Promise<void>
}

/** The client locale registry. Source: `@deepseek-ai/dsh-client-locale` (`client/index.ts`). */
export interface LocaleService {
  /** @param namespace - namespace key. @param dictionaries - `{ zh, en }`. */
  register(namespace: string, dictionaries: Record<string, unknown>): () => void
  /** @param namespace - namespace key. @returns the bound translate function. */
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
}

/** Registration options a slot entry may carry. Source: `@deepseek-ai/dsh-client-ui-slots`. */
export interface SlotRegistrationOptions {
  readonly name: string
  readonly id?: string
  readonly key?: string
  readonly order?: number
  readonly locale?: string
  readonly inject?: (sessionId: string, actions?: unknown) => Record<string, unknown>
  readonly store?: unknown
}

/** The typed React slot registry. Source: `@deepseek-ai/dsh-client-ui-slots` / `-ui-renderer`. */
export interface SlotsService {
  /**
   * Run a contribution once the named slot is declared.
   * @param key - slot name to wait for.
   * @param callback - runs per declaration lifetime.
   */
  inject(key: string, callback: () => void): void
  /**
   * Register one occupant.
   * @param options - registration identity and derived props.
   * @param component - the renderer.
   * @returns the contribution's disposer.
   */
  register(options: SlotRegistrationOptions, component: unknown): () => void
}

/** Minimal Cordis client context slice a transcript-reading plugin uses. */
export interface ClientContext {
  readonly sessions?: SessionsService
  readonly locale: LocaleService
  readonly slots: SlotsService
  effect(callback: () => void | (() => void), label?: string): unknown
}
