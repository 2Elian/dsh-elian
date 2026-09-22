/**
 * Conversation-header button that toggles the turn outline.
 *
 * It renders in `conversation.session.header.utilities`, the header's
 * right-hand list seat.
 */

/** Props assembled by the slot registration. */
export interface TurnButtonProps {
  useOpen: <T>(selector: (state: { readonly open: boolean }) => T) => T
  toggle: () => void
  t: (key: string) => string
}

/**
 * Render the outline toggle.
 * @param props - open-state hook, toggle action, and the locale function.
 * @returns the header button.
 */
export function TurnButton({ useOpen, toggle, t }: TurnButtonProps): JSX.Element {
  const open = useOpen(state => state.open)
  const label = t('button.title')
  return (
    <button
      type="button"
      className="dsh-slt-button"
      aria-pressed={open}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
        <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="2" y1="8" x2="10" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <line x1="2" y1="12" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}
