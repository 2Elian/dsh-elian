/**
 * Query evaluation over extracted documents.
 *
 * Semantics mirror the shipped client-local trajectory index: the query is
 * split on whitespace and every term must appear in the same span
 * (case-insensitive substring by default). That is what a reader expects from
 * an in-conversation find box, and it never treats query text as a pattern.
 */

import type { SearchDocument, SearchHit, SearchOptions } from './types.ts'

const DEFAULT_LIMIT = 200
const DEFAULT_CONTEXT = 60

/**
 * Split a raw query into the terms that must all match.
 * @param query - raw user input.
 * @returns non-empty terms in input order.
 */
export function tokenize(query: string): string[] {
  return query.trim().split(/\s+/u).filter(term => term !== '')
}

function occurrenceIndexes(haystack: string, needle: string, wholeWord: boolean): number[] {
  const indexes: number[] = []
  if (needle === '') return indexes
  let from = 0
  for (;;) {
    const at = haystack.indexOf(needle, from)
    if (at < 0) break
    if (!wholeWord || isWordBounded(haystack, at, needle.length)) indexes.push(at)
    from = at + 1
  }
  return indexes
}

function isWordBounded(haystack: string, at: number, length: number): boolean {
  const before = at === 0 ? '' : haystack[at - 1] ?? ''
  const after = haystack[at + length] ?? ''
  return !isWordCharacter(before) && !isWordCharacter(after)
}

function isWordCharacter(value: string): boolean {
  return value !== '' && /[\p{L}\p{N}_]/u.test(value)
}

/**
 * Match one document's spans against the query terms.
 * @param documents - extracted documents, ascending by seq.
 * @param query - raw user input.
 * @param options - matching options.
 * @returns one hit per matched occurrence, in document order.
 */
export function searchDocuments(
  documents: readonly SearchDocument[],
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const terms = tokenize(query)
  if (terms.length === 0) return []
  const caseSensitive = options.caseSensitive ?? false
  const wholeWord = options.wholeWord ?? false
  const limit = options.limit ?? DEFAULT_LIMIT
  const context = options.context ?? DEFAULT_CONTEXT
  const kinds = options.kinds === undefined ? undefined : new Set(options.kinds)
  const lowered = terms.map(term => caseSensitive ? term : term.toLowerCase())
  const hits: SearchHit[] = []

  for (const document of documents) {
    for (const segment of document.segments) {
      if (kinds !== undefined && !kinds.has(segment.kind)) continue
      const haystack = caseSensitive ? segment.text : segment.text.toLowerCase()
      const positions: number[][] = []
      let complete = true
      for (const term of lowered) {
        const found = occurrenceIndexes(haystack, term, wholeWord)
        if (found.length === 0) {
          complete = false
          break
        }
        positions.push(found)
      }
      if (!complete) continue
      const firstTerm = lowered[0] ?? ''
      const anchors = positions[0] ?? []
      for (const [ordinal, anchor] of anchors.entries()) {
        const start = Math.max(0, anchor - context)
        const end = Math.min(segment.text.length, anchor + firstTerm.length + context)
        hits.push({
          seq: document.seq,
          eventType: document.eventType,
          time: document.time,
          turn: document.turn,
          step: document.step,
          kind: segment.kind,
          before: segment.text.slice(start, anchor),
          match: segment.text.slice(anchor, anchor + firstTerm.length),
          after: segment.text.slice(anchor + firstTerm.length, end),
          ordinal: ordinal + 1,
        })
        if (hits.length >= limit) return hits
      }
    }
  }
  return hits
}

/**
 * Count hits per span kind for a result badge row.
 * @param hits - search hits.
 * @returns counts keyed by kind, omitting kinds with no hit.
 */
export function countByKind(hits: readonly SearchHit[]): Partial<Record<string, number>> {
  const counts: Partial<Record<string, number>> = {}
  for (const hit of hits) counts[hit.kind] = (counts[hit.kind] ?? 0) + 1
  return counts
}
