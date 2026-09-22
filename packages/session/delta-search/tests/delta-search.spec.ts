import { describe, expect, it } from 'vitest'
import { anchorKeysForEvent, conversationContextKey } from '../src/anchors.ts'
import { buildDocuments, documentFromEvent } from '../src/extract.ts'
import { findAnchorRow, jumpToAnchor } from '../src/jump.ts'
import { searchDocuments } from '../src/search.ts'
import { buildTurnItems, preview } from '../src/turns.ts'
import type { RawEventLike } from '../src/types.ts'

const userMessage = (seq: number, id: string, text: string, sourceKind = 'user'): RawEventLike => ({
  type: 'user/message',
  seq,
  time: 1000 + seq,
  data: { id, role: 'user', content: [{ type: 'text', text }], source: { kind: sourceKind } },
})

const assistantMessage = (seq: number, turn: number, step: number, content: unknown[]): RawEventLike => ({
  type: 'assistant/message',
  seq,
  time: 1000 + seq,
  data: { turn, step, message: { role: 'assistant', content }, stream: [], usage: undefined },
})

describe('event extraction', () => {
  it('reads user prompts, assistant prose and reasoning', () => {
    const user = documentFromEvent(userMessage(0, 'm1', 'refactor the parser'))
    expect(user?.segments).toEqual([{ kind: 'user', text: 'refactor the parser' }])

    const assistant = documentFromEvent(assistantMessage(2, 0, 0, [
      { type: 'reasoning', text: 'The parser is recursive.' },
      { type: 'text', text: 'I will split the lexer out.' },
    ]))
    expect(assistant?.segments).toEqual([
      { kind: 'reasoning', text: 'The parser is recursive.' },
      { kind: 'assistant', text: 'I will split the lexer out.' },
    ])
  })

  it('classifies injected user-role context as context, not as a prompt', () => {
    const injected = documentFromEvent(userMessage(1, 'm2', 'workspace rules', 'context-injection'))
    expect(injected?.segments).toEqual([{ kind: 'context', text: 'workspace rules' }])
  })

  it('reads tool call arguments and tool result bodies, including failure detail', () => {
    const call = documentFromEvent({
      type: 'tool/call',
      seq: 3,
      data: { turn: 0, step: 0, callId: 'c1', name: 'grep', arguments: '{"pattern":"needle"}' },
    })
    expect(call?.segments).toEqual([{ kind: 'tool-call', text: 'grep {"pattern":"needle"}' }])

    const result = documentFromEvent({
      type: 'tool/result',
      seq: 4,
      data: {
        turn: 0,
        step: 0,
        message: { role: 'tool', content: [{ type: 'text', text: 'no matches in src' }] },
        error: { name: 'ToolError', code: 'E_EMPTY' },
      },
    })
    expect(result?.segments).toEqual([
      { kind: 'tool-result', text: 'no matches in src' },
      { kind: 'tool-result', text: 'ToolError E_EMPTY' },
    ])
  })

  it('recovers reasoning from an attempt that committed no message', () => {
    const attempt = documentFromEvent({
      type: 'assistant/attempt',
      seq: 5,
      data: { turn: 0, step: 1, stream: [{ type: 'reasoning-chunks', texts: ['first ', 'second'] }] },
    })
    expect(attempt?.segments).toEqual([{ kind: 'reasoning', text: 'first ' }, { kind: 'reasoning', text: 'second' }])
  })

  it('drops structural events', () => {
    expect(documentFromEvent({ type: 'turn/start', seq: 0, data: { turn: 0 } })).toBeUndefined()
    expect(documentFromEvent({ type: 'step/end', seq: 1, data: { turn: 0, step: 0 } })).toBeUndefined()
    expect(documentFromEvent({ type: 'request/header', seq: 2, data: {} })).toBeUndefined()
  })

  it('projects a window in order', () => {
    const documents = buildDocuments([userMessage(0, 'm1', 'alpha'), { type: 'turn/end', seq: 1, data: {} }])
    expect(documents.map(document => document.seq)).toEqual([0])
  })
})

describe('query evaluation', () => {
  const documents = buildDocuments([
    userMessage(0, 'm1', 'Split the Parser into a lexer.'),
    assistantMessage(1, 0, 0, [
      { type: 'reasoning', text: 'The existing parser handles both jobs.' },
      { type: 'text', text: 'lexer extracted' },
    ]),
    { type: 'tool/call', seq: 2, data: { turn: 0, step: 0, callId: 'c1', name: 'edit', arguments: '{"file":"lexer.ts"}' } },
  ])

  it('matches case-insensitively and covers reasoning', () => {
    const hits = searchDocuments(documents, 'parser')
    expect(hits.map(hit => hit.kind)).toEqual(['user', 'reasoning'])
  })

  it('requires every whitespace-separated term', () => {
    expect(searchDocuments(documents, 'parser lexer')).toHaveLength(1)
    expect(searchDocuments(documents, 'parser missing')).toHaveLength(0)
  })

  it('honours kind filters, whole-word matching and case sensitivity', () => {
    expect(searchDocuments(documents, 'parser', { kinds: ['reasoning'] }).map(hit => hit.seq)).toEqual([1])
    expect(searchDocuments(documents, 'parse', { wholeWord: true })).toHaveLength(0)
    expect(searchDocuments(documents, 'Lexer', { caseSensitive: true })).toHaveLength(0)
  })

  it('caps results', () => {
    const many = buildDocuments(Array.from({ length: 10 }, (_, index) => userMessage(index, `m${index}`, 'needle')))
    expect(searchDocuments(many, 'needle', { limit: 3 })).toHaveLength(3)
  })

  it('splits the snippet around the match', () => {
    const [hit] = searchDocuments([documentFromEvent(userMessage(0, 'm1', 'aaa bbb ccc'))!], 'bbb', { context: 2 })
    expect(hit).toMatchObject({ before: 'a ', match: 'bbb', after: ' c', ordinal: 1 })
  })

  it('counts nothing for a blank query', () => {
    expect(searchDocuments(documents, '   ')).toEqual([])
  })
})

describe('anchor derivation', () => {
  it('reproduces the Conversation Context key', () => {
    expect(conversationContextKey('input-message', 'm1')).toBe('13:input-messagem1')
    expect(conversationContextKey('turn-tail', '3')).toBe('9:turn-tail3')
  })

  it('maps each event to its row keys', () => {
    expect(anchorKeysForEvent(userMessage(0, 'm1', 'hi'))).toEqual(['13:input-messagem1'])
    expect(anchorKeysForEvent(assistantMessage(1, 2, 3, []))).toEqual(['14:assistant-step2:3'])
    expect(anchorKeysForEvent({ type: 'tool/call', seq: 2, data: { callId: 'c9' } }))
      .toEqual(['9:tool-callc9', 'call:c9'])
    expect(anchorKeysForEvent({ type: 'turn/start', seq: 3, data: { turn: 7 } })).toEqual(['9:turn-tail7'])
    expect(anchorKeysForEvent({ type: 'tool/result', seq: 4, data: {} })).toEqual([])
  })
})

describe('turn outline', () => {
  it('takes the prompt from the first human message only', () => {
    const items = buildTurnItems([
      { type: 'turn/start', seq: 0, time: 10, data: { turn: 0 } },
      userMessage(1, 'injected', 'workspace rules', 'context-injection'),
      userMessage(2, 'human', 'do the thing'),
      userMessage(3, 'steering', 'also this'),
      assistantMessage(4, 0, 0, [{ type: 'text', text: 'draft' }]),
      assistantMessage(5, 0, 1, [{ type: 'text', text: 'final answer' }]),
      { type: 'turn/end', seq: 6, data: { turn: 0, reason: 'completed' } },
    ])
    expect(items).toEqual([
      {
        turn: 0,
        seq: 0,
        time: 10,
        prompt: 'do the thing',
        response: 'final answer',
        anchorKeys: ['13:input-messagehuman', '9:turn-tail0'],
      },
    ])
  })

  it('keeps a turn whose events are not loaded yet', () => {
    expect(buildTurnItems([{ type: 'turn/start', seq: 42, time: 1, data: { turn: 1 } }]))
      .toEqual([{ turn: 1, seq: 42, time: 1, prompt: '', response: '', anchorKeys: ['9:turn-tail1'] }])
  })

  it('collapses whitespace for a preview', () => {
    expect(preview('a\n\n  b')).toBe('a b')
    expect(preview('abcdef', 4)).toBe('abc…')
  })
})

/** Minimal stand-in for one transcript row plus its scrollport. */
function fakeRow(key: string, turn: number): Record<string, unknown> {
  const row: Record<string, unknown> = {
    dataset: { chatAnchorKey: key, chatTurn: String(turn) },
    style: {} as Record<string, string>,
    parentElement: null,
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
    getAttribute: () => null,
    removeAttribute: () => {},
    closest: () => null,
    getBoundingClientRect: () => ({ top: 300 }),
  }
  row.scrollTo = () => {}
  return row
}

function fakeTranscript(rows: readonly Record<string, unknown>[]): ParentNode {
  return { querySelectorAll: () => rows } as unknown as ParentNode
}

describe('landing on a hit', () => {
  it('finds the row carrying any candidate key', () => {
    const row = fakeRow('9:tool-callc9', 1)
    const found = findAnchorRow(fakeTranscript([row]), ['9:tool-callc9', 'call:c9'])
    expect(found?.key).toBe('9:tool-callc9')
  })

  it('lands without paging when the row is already mounted', async () => {
    const root = fakeTranscript([fakeRow('13:input-messagem1', 0)])
    const result = await jumpToAnchor({ anchorKeys: ['13:input-messagem1'], seq: 0, root })
    expect(result).toEqual({ landed: true, key: '13:input-messagem1' })
  })

  it('pages history through the target seq before landing', async () => {
    const pages: number[] = []
    let mounted = false
    const rows = [fakeRow('13:input-messagem1', 0)]
    const root = { querySelectorAll: () => (mounted ? rows : []) } as unknown as ParentNode
    const result = await jumpToAnchor({
      anchorKeys: ['13:input-messagem1'],
      seq: 12,
      root,
      loadThrough: (seq) => { pages.push(seq); mounted = true },
    })
    expect(pages).toEqual([12])
    expect(result.landed).toBe(true)
  })

  it('reports an unloaded target instead of throwing', async () => {
    const root = fakeTranscript([])
    const result = await jumpToAnchor({ anchorKeys: ['13:input-messagem1'], seq: 9, root, maxPages: 2, loadOlder: () => {} })
    expect(result).toEqual({ landed: false, reason: 'not-loaded' })
  })

  it('is inert without a document', async () => {
    expect(await jumpToAnchor({ anchorKeys: ['x'], seq: 0, root: undefined })).toEqual({ landed: false, reason: 'no-document' })
    expect(await jumpToAnchor({ anchorKeys: [], seq: 0 })).toEqual({ landed: false, reason: 'no-anchor' })
  })
})
