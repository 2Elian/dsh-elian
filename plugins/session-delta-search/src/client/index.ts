/**
 * In-session keyword search — browser half.
 *
 * Two seats, one feature: a header button opens a panel anchored above the
 * composer. The panel indexes the session's browser-side event window and
 * matches a query against prompts, answers, reasoning, tool calls and tool
 * results. Picking a result pages history in when necessary and lands the
 * transcript on the row `ui-chat` already anchors to that event.
 *
 * Nothing here reaches the host: the harness's Remote capability set is fixed
 * at build time and its FTS search returns no position, so both the index and
 * the landing are browser-local.
 */

import {
  anchorKeysForEvent, createOpenRegistry, createTranscriptSource, jumpToAnchor,
} from '@2elian/dsh-session-delta-search'
import type { ClientContext, ConversationService } from '@2elian/dsh-session-delta-search'
import { en, NS, zh } from './locales.ts'
import { CSS, STYLE_ID } from './styles.ts'
import { SearchButton } from './SearchButton.tsx'
import { SearchPanel } from './SearchPanel.tsx'

/**
 * Client services this plugin needs: the two seat registries and the session
 * registry the transcript is read from.
 *
 * `conversation` is deliberately absent. It exists only inside a session scope,
 * and a service this fiber cannot resolve would leave `apply` unrun — no seats,
 * no buttons. It is reached per session through `ctx.sessions.scope(id)`.
 */
export const inject = ['slots', 'locale', 'sessions']

/** Ceiling on the pages one "load all history" press may pull. */
const MAX_PAGES = 40
/** The seat ids, unique per slot and used by the owner as the cell identity. */
const SEAT_ID = 'session-delta-search'

function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve()
  return new Promise(resolve => { requestAnimationFrame(() => { resolve() }) })
}

/**
 * Register the toggle button, the panel, and their dictionaries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-delta-search: dictionaries')
  ctx.effect(() => installStyles(), 'session-delta-search: styles')
  // Activation marker: separates "the bundle arrived but rendered nothing" from
  // "the bundle never arrived" while this plugin is being verified.
  console.info('[session-delta-search] active')

  const registry = createOpenRegistry()
  /**
   * The scoped conversation verbs. `loadOlder()` throws from a root context by
   * design, so it is resolved against the session's own scope at call time.
   * @param sessionId - the viewed session.
   * @returns the scoped service, or `undefined` when the scope is not retained.
   */
  const conversationOf = (sessionId: string): ConversationService | undefined =>
    ctx.sessions?.scope?.(sessionId)?.get('conversation') as ConversationService | undefined

  ctx.effect(() => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
    name: 'conversation.session.header.utilities',
    id: SEAT_ID,
    order: 20,
    locale: NS,
    inject: (sessionId: string) => ({
      hooks: { open: registry.sourceFor(sessionId) },
      toggle: () => { registry.toggle(sessionId) },
    }),
  }, SearchButton)), 'session-delta-search: header button')

  ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: SEAT_ID,
    order: 20,
    locale: NS,
    inject: (sessionId: string) => {
      const transcript = createTranscriptSource(ctx.sessions, sessionId)
      const loadOlder = (): Promise<unknown> => conversationOf(sessionId)?.loadOlder() ?? Promise.resolve()
      return {
        hooks: { open: registry.sourceFor(sessionId), transcript },
        close: () => { registry.close(sessionId) },
        // Paging is the only way to reach history the window has not loaded;
        // each pull re-renders the panel, so the index grows as it goes.
        loadAll: async (): Promise<void> => {
          for (let page = 0; page < MAX_PAGES; page += 1) {
            if (!transcript.getSnapshot().hasMore) return
            if (conversationOf(sessionId) === undefined) return
            await loadOlder()
            await nextFrame()
          }
        },
        jump: (seq: number): void => {
          const event = transcript.getSnapshot().entries.find(entry => entry.seq === seq)
          void jumpToAnchor({
            anchorKeys: event === undefined ? [] : anchorKeysForEvent(event),
            seq,
            loadOlder,
          })
        },
      }
    },
  }, SearchPanel)), 'session-delta-search: search panel')
}
