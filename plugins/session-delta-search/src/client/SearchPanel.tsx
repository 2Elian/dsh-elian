/**
 * The search panel.
 *
 * It renders inside `conversation.input.overlay`, which sits in the composer
 * card, so the panel floats above the input without taking a column of its own
 * and disappears with the conversation it belongs to.
 *
 * The component receives only derived props: the two observables become
 * selector hooks through the registration's `hooks` compartment, the actions
 * are plain callbacks, and `t` comes from the registered locale namespace. It
 * never sees the Cordis context.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { buildDocuments, countByKind, searchDocuments } from '@2elian/dsh-session-delta-search'
import type { SearchHit, SegmentKind, TranscriptSnapshot } from '@2elian/dsh-session-delta-search'

/** Every span kind the panel can filter on, in filter-row order. */
const KIND_FILTERS: readonly SegmentKind[] = [
  'user', 'assistant', 'reasoning', 'tool-call', 'tool-result', 'context',
]

/** Props assembled by the slot registration. */
export interface SearchPanelProps {
  useOpen: <T>(selector: (state: { readonly open: boolean }) => T) => T
  useTranscript: <T>(selector: (state: TranscriptSnapshot) => T) => T
  close: () => void
  loadAll: () => Promise<void>
  jump: (seq: number) => void
  t: (key: string) => string
}

function toggle<T>(values: readonly T[], value: T): readonly T[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value]
}

/**
 * Render one result row.
 * @param props - the hit, its selection state, the locale function, and the click handler.
 * @returns the row.
 */
function HitRow({ hit, selected, index, t, onPick }: {
  readonly hit: SearchHit
  readonly selected: boolean
  readonly index: number
  readonly t: (key: string) => string
  readonly onPick: () => void
}): JSX.Element {
  return (
    <li
      className="dsh-sds-hit"
      aria-selected={selected}
      data-hit-index={index}
      onClick={onPick}
    >
      <span className="dsh-sds-badge">{t(`kind.${hit.kind}`)}</span>
      <span className="dsh-sds-text">
        {hit.before}
        <mark>{hit.match}</mark>
        {hit.after}
      </span>
      <span className="dsh-sds-meta">
        {hit.turn === null ? '' : `#${String(hit.turn)}`}
        {hit.turn === null ? '' : ' 路 '}
        {`seq ${String(hit.seq)}`}
      </span>
    </li>
  )
}

/**
 * Render the in-session search panel.
 * @param props - observables, actions, and the locale function from the registration.
 * @returns the panel, or `null` while it is closed.
 */
export function SearchPanel(props: SearchPanelProps): JSX.Element | null {
  const { useOpen, useTranscript, close, loadAll, jump, t } = props
  const open = useOpen(state => state.open)
  const transcript = useTranscript(state => state)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [kinds, setKinds] = useState<readonly SegmentKind[]>([])
  const [active, setActive] = useState(0)
  const [loadingAll, setLoadingAll] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const documents = useMemo(() => buildDocuments(transcript.entries), [transcript.entries])
  const hits = useMemo(
    () => searchDocuments(documents, query, {
      caseSensitive,
      wholeWord,
      ...kinds.length === 0 ? {} : { kinds },
    }),
    [documents, query, caseSensitive, wholeWord, kinds],
  )
  const counts = useMemo(() => countByKind(hits), [hits])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  useEffect(() => {
    setActive(0)
  }, [query, caseSensitive, wholeWord, kinds])
  // Keep the selected row visible while arrowing through a long result list.
  useEffect(() => {
    const list = listRef.current
    if (list === null) return
    const row = list.querySelector(`[data-hit-index="${String(active)}"]`)
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [active, hits])

  if (!open) return null

  const pick = (index: number): void => {
    const hit = hits[index]
    if (hit === undefined) return
    setActive(index)
    jump(hit.seq)
  }

  return (
    <section className="dsh-sds-panel" role="dialog" aria-label={t('panel.label')}>
      <div className="dsh-sds-head">
        <input
          ref={inputRef}
          className="dsh-sds-input"
          type="search"
          value={query}
          placeholder={t('panel.placeholder')}
          aria-label={t('panel.label')}
          onChange={event => { setQuery(event.target.value) }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              close()
              return
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive(current => Math.min(current + 1, Math.max(0, hits.length - 1)))
              return
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive(current => Math.max(current - 1, 0))
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              pick(active)
            }
          }}
        />
        <span className="dsh-sds-count">{`${String(hits.length)} ${t('panel.results')}`}</span>
        <button type="button" className="dsh-sds-action" onClick={close} title={t('panel.close')}>
          {t('panel.close')}
        </button>
      </div>

      <div className="dsh-sds-opts">
        <label className="dsh-sds-opt">
          <input type="checkbox" checked={caseSensitive} onChange={event => { setCaseSensitive(event.target.checked) }} />
          {t('panel.caseSensitive')}
        </label>
        <label className="dsh-sds-opt">
          <input type="checkbox" checked={wholeWord} onChange={event => { setWholeWord(event.target.checked) }} />
          {t('panel.wholeWord')}
        </label>
        {KIND_FILTERS.map(kind => (
          <label key={kind} className="dsh-sds-opt">
            <input
              type="checkbox"
              checked={kinds.includes(kind)}
              onChange={() => { setKinds(current => toggle(current, kind)) }}
            />
            {`${t(`kind.${kind}`)}${counts[kind] === undefined ? '' : ` ${String(counts[kind])}`}`}
          </label>
        ))}
      </div>

      {hits.length === 0
        ? (
          <div className="dsh-sds-empty">
            <div>{query.trim() === '' ? t('panel.placeholder') : t('panel.empty')}</div>
            <div>{t('panel.emptyHint')}</div>
          </div>
        )
        : (
          <ul className="dsh-sds-list" ref={listRef}>
            {hits.map((hit, index) => (
              <HitRow
                key={`${String(hit.seq)}-${String(hit.ordinal)}-${String(index)}`}
                hit={hit}
                index={index}
                selected={index === active}
                t={t}
                onPick={() => { pick(index) }}
              />
            ))}
          </ul>
        )}

      <div className="dsh-sds-foot">
        <span>
          {`${t('panel.scope')} ${String(documents.length)} ${t('panel.events')} `}
          {transcript.hasMore ? t('panel.more') : t('panel.complete')}
        </span>
        <button
          type="button"
          className="dsh-sds-action"
          disabled={!transcript.hasMore || loadingAll}
          onClick={() => {
            setLoadingAll(true)
            void loadAll().finally(() => { setLoadingAll(false) })
          }}
        >
          {loadingAll ? t('panel.loading') : t('panel.loadAll')}
        </button>
      </div>
    </section>
  )
}
