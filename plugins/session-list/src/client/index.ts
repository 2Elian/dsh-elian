/**
 * User-turn outline — browser half.
 *
 * Two seats, one feature: a header button opens a panel above the composer that
 * lists every human prompt of the conversation. Picking one pages history in
 * when necessary and lands the transcript on that turn's own row.
 *
 * The outline is folded in the browser from the session's event window, so no
 * host RPC is involved and the panel keeps working on a profile that never
 * mounted the `turnOutline` projection.
 */

import { createOpenRegistry, createTranscriptSource, jumpToAnchor } from '@2elian/dsh-session-delta-search'
import type { ClientContext, ConversationService, TurnItem } from '@2elian/dsh-session-delta-search'
import { en, NS, zh } from './locales.ts'
import { CSS, STYLE_ID } from './styles.ts'
import { TurnButton } from './TurnButton.tsx'
import { TurnPanel } from './TurnPanel.tsx'

/**
 * Client services this plugin needs: the two seat registries and the session
 * registry the transcript is read from.
 *
 * `conversation` is deliberately absent. It exists only inside a session scope,
 * and a service this fiber cannot resolve would leave `apply` unrun — no seats,
 * no buttons. It is reached per session through `ctx.sessions.scope(id)`.
 */
export const inject = ['slots', 'locale', 'sessions']

/** The seat ids, unique per slot and used by the owner as the cell identity. */
const SEAT_ID = 'session-list'

function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_ID) !== null) return () => {}
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

/**
 * Register the toggle button, the outline panel, and their dictionaries.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-list: dictionaries')
  ctx.effect(() => installStyles(), 'session-list: styles')
  // Activation marker: separates "the bundle arrived but rendered nothing" from
  // "the bundle never arrived" while this plugin is being verified.
  console.info('[session-list] active')

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
    order: 21,
    locale: NS,
    inject: (sessionId: string) => ({
      hooks: { open: registry.sourceFor(sessionId) },
      toggle: () => { registry.toggle(sessionId) },
    }),
  }, TurnButton)), 'session-list: header button')

  ctx.effect(() => ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay',
    id: SEAT_ID,
    order: 21,
    locale: NS,
    inject: (sessionId: string) => {
      const transcript = createTranscriptSource(ctx.sessions, sessionId)
      return {
        hooks: { open: registry.sourceFor(sessionId), transcript },
        close: () => { registry.close(sessionId) },
        jump: (item: TurnItem): void => {
          void jumpToAnchor({
            anchorKeys: item.anchorKeys,
            seq: item.seq,
            loadOlder: () => conversationOf(sessionId)?.loadOlder() ?? Promise.resolve(),
          })
        },
      }
    },
  }, TurnPanel)), 'session-list: outline panel')
}
