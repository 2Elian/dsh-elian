/**
 * Chat-row anchor derivation.
 *
 * `ui-chat` gives every transcript row a stable `data-chat-anchor-key` holding
 * the Conversation Context key, built by `conversationContextKey(kind, id)` as
 * `` `${kind.length}:${kind}${id}` `` (ui-conversation
 * `conversation/conversation.ts:295`). The key is a function of the event's own
 * identity, so a search hit can be resolved to a row without any ui-chat API.
 *
 * The definition-kind strings and id shapes below mirror
 * `ui-chat/src/client/conversation-nodes/*`; each entry names its source so a
 * drift is a one-line fix rather than a mystery.
 */

/** Definition kinds whose Context key prefixes a transcript row. */
export const CHAT_CONTEXT_KIND = {
  /** `conversation-nodes/message.ts` — id is the message id. */
  inputMessage: 'input-message',
  /** `conversation-nodes/assistant.ts` — id is `turn:step`. */
  assistantStep: 'assistant-step',
  /** `conversation-nodes/tool.ts` — id is the tool call id. */
  toolCall: 'tool-call',
  /** `conversation-nodes/turn-tail.ts` — id is the turn number. */
  turnTail: 'turn-tail',
  /** `conversation-nodes/request-prompt.ts` — id is the event seq. */
  systemMessage: 'system-message',
} as const

/**
 * Reproduce ui-conversation's Context key.
 * @param kind - the Definition kind spelling.
 * @param id - the Definition's own id.
 * @returns the value `ui-chat` puts on `data-chat-anchor-key`.
 */
export function conversationContextKey(kind: string, id: string): string {
  return `${kind.length}:${kind}${id}`
}

/** Structural read of an event payload for anchor derivation. */
export interface AnchorEventLike {
  readonly type: string
  readonly seq: number
  readonly data?: unknown
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function numberOf(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Candidate transcript anchor keys for one event, most specific first.
 *
 * More than one candidate is returned because a node can be absent from the
 * loaded window while a coarser row for the same event is present; the lander
 * tries each in order. The tool-call form `call:<id>` is the independently
 * documented `ui-tool` contract for a nested call row.
 * @param event - raw session event.
 * @returns anchor key candidates; empty when the event has no row of its own.
 */
export function anchorKeysForEvent(event: AnchorEventLike): string[] {
  const data = record(event.data)
  switch (event.type) {
    case 'user/message': {
      const id = stringOf(data.id)
      return id === undefined ? [] : [conversationContextKey(CHAT_CONTEXT_KIND.inputMessage, id)]
    }
    case 'assistant/message': {
      const turn = numberOf(data.turn)
      const step = numberOf(data.step)
      return turn === undefined || step === undefined
        ? []
        : [conversationContextKey(CHAT_CONTEXT_KIND.assistantStep, `${String(turn)}:${String(step)}`)]
    }
    case 'tool/call': {
      const callId = stringOf(data.callId)
      return callId === undefined
        ? []
        : [conversationContextKey(CHAT_CONTEXT_KIND.toolCall, callId), `call:${callId}`]
    }
    case 'tool/result': {
      const callId = stringOf(data.callId)
      return callId === undefined
        ? []
        : [conversationContextKey(CHAT_CONTEXT_KIND.toolCall, callId), `call:${callId}`]
    }
    case 'system/message':
      return [conversationContextKey(CHAT_CONTEXT_KIND.systemMessage, String(event.seq))]
    case 'turn/start': {
      const turn = numberOf(data.turn)
      return turn === undefined ? [] : [conversationContextKey(CHAT_CONTEXT_KIND.turnTail, String(turn))]
    }
    default:
      return []
  }
}
