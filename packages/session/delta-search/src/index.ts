/**
 * In-session keyword search over a DeepSeek Harness event window.
 *
 * The harness's FTS search returns `{ sessionId, snippet }` with no position,
 * and its extractor skips reasoning blocks entirely, so neither can put a
 * reader back on the message a hit came from. This package covers the whole
 * delivered transcript — prompts, answers, reasoning, tool calls and tool
 * results — and resolves every hit to the anchor `ui-chat` already puts on the
 * matching row.
 *
 * @module @2elian/dsh-session-delta-search
 */

export type {
  RawEventLike, SearchDocument, SearchHit, SearchOptions, SearchSegment, SegmentKind, TurnItem,
} from './types.ts'
export { buildDocuments, documentFromEvent } from './extract.ts'
export { anchorKeysForEvent, CHAT_CONTEXT_KIND, conversationContextKey } from './anchors.ts'
export type { AnchorEventLike } from './anchors.ts'
export { countByKind, searchDocuments, tokenize } from './search.ts'
export { buildTurnItems, preview } from './turns.ts'
export {
  findAnchorRow, flashRow, jumpToAnchor, landOnRow, revealAncestors, scrollportOf,
} from './jump.ts'
export type { JumpDeps, JumpResult } from './jump.ts'
export { createTranscriptSource } from './transcript.ts'
export type { TranscriptSnapshot, TranscriptSource } from './transcript.ts'
export { createOpenRegistry } from './panel.ts'
export type { OpenRegistry, OpenSource, OpenState } from './panel.ts'
export type {
  ClientContext, ConversationService, LocaleService, SessionBinding, SessionEventSource,
  SessionEventWindowEntry, SessionFace, SessionScopeContext, SessionsService,
  SlotRegistrationOptions, SlotsService,
} from './surface.ts'
