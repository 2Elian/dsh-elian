/**
 * The turn outline panel.
 *
 * It renders inside `conversation.input.overlay`, so it floats above the
 * composer and disappears with the conversation it belongs to. Every entry is
 * one human turn of the session; picking one lands the transcript on the row
 * that holds that prompt.
 *
 * The component receives only derived props: the two observables become
 * selector hooks through the registration's `hooks` compartment, the actions
 * are plain callbacks, and `t` comes from the registered locale namespace.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { buildTurnItems, preview } from '@2elian/dsh-session-delta-search'
import type { TranscriptSnapshot, TurnItem } from '@2elian/dsh-session-delta-search'

/** Props assembled by the slot registration. */
export interface TurnPanelProps {
  useOpen: <T>(selector: (state: { readonly open: boolean }) => T) => T
  useTranscript: <T>(selector: (state: TranscriptSnapshot) => T) => T
  close: () => void
  jump: (item: TurnItem) => void
  t: (key: string) => string
}

function matches(item: TurnItem, needle: string): boolean {
  if (needle === '') return true
  return item.prompt.toLowerCase().includes(needle) || item.response.toLowerCase().includes(needle)
}

/**
 * Render the user-turn outline panel.
 * @param props - observables, actions, and the locale function from the registration.
 * @returns the panel, or `null` while it is closed.
 */
export function TurnPanel(props: TurnPanelProps): JSX.Element | null {
  const { useOpen, useTranscript, close, jump, t } = props
  const open = useOpen(state => state.open)
  const transcript = useTranscript(state => state)
  const [filter, setFilter] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)

  const turns = useMemo(() => buildTurnItems(transcript.entries), [transcript.entries])
  const needle = filter.trim().toLowerCase()
  const visible = useMemo(() => turns.filter(item => matches(item, needle)), [turns, needle])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])
  useEffect(() => {
    setActive(0)
  }, [needle, turns.length])
  // Opening lands on the newest turn, which is the one a reader usually wants.
  useEffect(() => {
    if (!open) return
    const list = listRef.current
    if (list === null) return
    const rows = list.querySelectorAll('[data-turn-index]')
    const last = rows[rows.length - 1]
    if (last instanceof HTMLElement && typeof last.scrollIntoView === 'function') {
      last.scrollIntoView({ block: 'nearest' })
    }
  }, [open, visible.length])
  useEffect(() => {
    const list = listRef.current
    if (list === null) return
    const row = list.querySelector(`[data-turn-index="${String(active)}"]`)
    if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest' })
    }
  }, [active, visible])

  if (!open) return null

  const pick = (index: number): void => {
    const item = visible[index]
    if (item === undefined) return
    setActive(index)
    jump(item)
  }

  return (
    <section className="dsh-slt-panel" role="dialog" aria-label={t('panel.label')}>
      <div className="dsh-slt-head">
        <input
          ref={inputRef}
          className="dsh-slt-input"
          type="search"
          value={filter}
          placeholder={t('panel.placeholder')}
          aria-label={t('panel.label')}
          onChange={event => { setFilter(event.target.value) }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              close()
              return
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive(current => Math.min(current + 1, Math.max(0, visible.length - 1)))
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
        <span className="dsh-slt-count">{`${String(visible.length)} ${t('panel.turns')}`}</span>
        <button type="button" className="dsh-slt-action" onClick={close} title={t('panel.close')}>
          {t('panel.close')}
        </button>
      </div>

      {visible.length === 0
        ? (
          <div className="dsh-slt-list">
            <div className="dsh-slt-empty">
              {turns.length === 0 ? t('panel.empty') : t('panel.emptyFilter')}
            </div>
          </div>
        )
        : (
          <ul className="dsh-slt-list" ref={listRef}>
            {visible.map((item, index) => (
              <li
                key={`${String(item.turn)}-${String(item.seq)}`}
                className="dsh-slt-item"
                data-turn-index={index}
                aria-selected={index === active}
                onClick={() => { pick(index) }}
              >
                <span className="dsh-slt-badge">{`#${String(item.turn)}`}</span>
                <span className="dsh-slt-prompt">
                  {item.prompt === ''
                    ? <span className="dsh-slt-empty">{t('panel.pending')}</span>
                    : preview(item.prompt, 400)}
                </span>
                <span className="dsh-slt-meta">
                  {item.response === '' ? t('panel.pending') : `${t('panel.answer')}: ${preview(item.response, 160)}`}
                </span>
              </li>
            ))}
          </ul>
        )}

      <div className="dsh-slt-foot">
        <span>
          {`${String(turns.length)} ${t('panel.turns')} `}
          {transcript.hasMore ? t('panel.more') : t('panel.complete')}
        </span>
      </div>
    </section>
  )
}
