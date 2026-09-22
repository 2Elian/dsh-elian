/**
 * Conversation-header button that toggles the search panel.
 *
 * It renders in `conversation.session.header.utilities`, which is a session
 * scoped list seat in the header's right-hand group.
 */

/** Props assembled by the slot registration. */
export interface SearchButtonProps {
  useOpen: <T>(selector: (state: { readonly open: boolean }) => T) => T
  toggle: () => void
  t: (key: string) => string
}

/**
 * Render the search toggle.
 * @param props - open-state hook, toggle action, and the locale function.
 * @returns the header button.
 */
export function SearchButton({ useOpen, toggle, t }: SearchButtonProps): JSX.Element {
  const open = useOpen(state => state.open)
  const label = t('button.title')
  return (
    <button
      type="button"
      className="dsh-sds-button"
      aria-pressed={open}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="4.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <line x1="10.4" y1="10.4" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}
