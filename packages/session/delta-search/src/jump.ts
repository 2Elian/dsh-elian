/**
 * Land the transcript on one event.
 *
 * `ui-chat`'s own `navigateToTurn` is component-local and turn-granular, so a
 * plugin cannot call it. What a plugin *can* rely on is the documented DOM
 * contract: every row carries `data-chat-anchor-key`, and the scrollport is the
 * enclosing `[data-conversation-scroll]` (falling back to the nearest
 * scrollable ancestor). This module performs that lookup, pages history in when
 * the target is not loaded yet, and reveals a row that compact mode folded away
 * behind `hidden="until-found"`.
 *
 * Every DOM read is guarded, so the function is inert — and unit-testable —
 * where no document exists.
 */

/** How to reach one transcript position. */
export interface JumpDeps {
  /** Candidate anchor keys, most specific first (see `anchorKeysForEvent`). */
  readonly anchorKeys: readonly string[]
  /** Seq of the target event; the history-paging cursor when it is not loaded. */
  readonly seq: number
  /** Page history back through `seq` in one call. Preferred when available. */
  readonly loadThrough?: ((seq: number) => Promise<unknown>) | undefined
  /** Page one page of older history. Fallback to `loadThrough`. */
  readonly loadOlder?: (() => Promise<unknown>) | undefined
  /** Maximum history pages pulled before giving up. Default: 20. */
  readonly maxPages?: number
  /** Search root. Defaults to the ambient document. */
  readonly root?: ParentNode | undefined
  /** Highlights the landed row for this long. `0` disables it. Default: 1400. */
  readonly flashMs?: number
}

/** Outcome of one landing attempt. */
export type JumpResult =
  | { readonly landed: true; readonly key: string }
  | { readonly landed: false; readonly reason: 'no-document' | 'no-anchor' | 'not-loaded' }

const ROW_SELECTOR = '[data-chat-anchor-key]'
const SCROLLPORT_SELECTOR = '[data-conversation-scroll]'
const FLASH_OUTLINE = '2px solid var(--dsh-accent, #4c8dff)'
const DEFAULT_MAX_PAGES = 20
const DEFAULT_FLASH_MS = 1400
/** Landing offset below the scrollport edge, matching ui-chat's own jump. */
const LANDING_INSET = 24

function ambientRoot(): ParentNode | undefined {
  return typeof document === 'undefined' ? undefined : document
}

function isElement(node: Element | null): node is HTMLElement {
  return node !== null && typeof (node as HTMLElement).style === 'object'
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Find the mounted row for any candidate anchor key.
 * @param root - search root.
 * @param keys - candidate anchor keys, most specific first.
 * @returns the row and the key that matched, or `undefined`.
 */
export function findAnchorRow(
  root: ParentNode,
  keys: readonly string[],
): { readonly row: HTMLElement; readonly key: string } | undefined {
  const wanted = new Set(keys)
  for (const node of Array.from(root.querySelectorAll(ROW_SELECTOR))) {
    const key = (node as HTMLElement).dataset?.chatAnchorKey
    if (key !== undefined && wanted.has(key) && isElement(node)) return { row: node, key }
  }
  return undefined
}

/**
 * Undo compact-mode folding above a row so its geometry is measurable.
 *
 * Folded rows use `hidden="until-found"`, the same attribute the browser's own
 * find-in-page reveals on `beforematch`.
 * @param row - the target row.
 */
export function revealAncestors(row: HTMLElement): void {
  let node: HTMLElement | null = row
  while (node !== null) {
    if (node.getAttribute?.('hidden') === 'until-found') node.removeAttribute('hidden')
    node = node.parentElement
  }
}

/**
 * Resolve the scrollport that owns a row.
 * @param row - the target row.
 * @returns the scrolling element, or `undefined` when none is scrollable.
 */
export function scrollportOf(row: HTMLElement): HTMLElement | undefined {
  const declared = row.closest?.(SCROLLPORT_SELECTOR)
  if (isElement(declared)) return declared
  let node = row.parentElement
  while (node !== null) {
    const overflow = typeof getComputedStyle === 'function' ? getComputedStyle(node).overflowY : ''
    if (overflow === 'auto' || overflow === 'scroll' || node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return isElement(row.ownerDocument?.documentElement ?? null) ? row.ownerDocument.documentElement : undefined
}

/**
 * Scroll a row into view inside its scrollport and flash it.
 * @param row - the landed row.
 * @param flashMs - highlight duration; `0` disables the highlight.
 */
export function landOnRow(row: HTMLElement, flashMs: number = DEFAULT_FLASH_MS): void {
  const scroller = scrollportOf(row)
  if (scroller !== undefined) {
    const delta = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - LANDING_INSET
    const top = Math.max(0, scroller.scrollTop + delta)
    if (typeof scroller.scrollTo === 'function') {
      scroller.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    } else {
      scroller.scrollTop = top
    }
  } else if (typeof row.scrollIntoView === 'function') {
    row.scrollIntoView({ block: 'center' })
  }
  if (flashMs > 0) flashRow(row, flashMs)
}

/**
 * Outline a row briefly so the reader can see where the jump landed.
 * @param row - the landed row.
 * @param durationMs - how long the outline stays.
 */
export function flashRow(row: HTMLElement, durationMs: number = DEFAULT_FLASH_MS): void {
  const previousOutline = row.style.outline
  const previousOffset = row.style.outlineOffset
  row.style.outline = FLASH_OUTLINE
  row.style.outlineOffset = '2px'
  const clear = (): void => {
    row.style.outline = previousOutline
    row.style.outlineOffset = previousOffset
  }
  if (typeof setTimeout === 'function') setTimeout(clear, durationMs)
  else clear()
}

function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise(resolve => { requestAnimationFrame(() => { resolve() }) })
  }
  return Promise.resolve()
}

async function waitForRow(
  root: ParentNode,
  keys: readonly string[],
  timeoutMs: number,
): Promise<{ readonly row: HTMLElement; readonly key: string } | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = findAnchorRow(root, keys)
    if (found !== undefined) return found
    if (Date.now() >= deadline) return undefined
    await nextFrame()
    await new Promise(resolve => { setTimeout(resolve, 16) })
  }
}

/**
 * Page history until the target row exists, then land on it.
 * @param deps - target anchor keys, paging callbacks, and limits.
 * @returns whether a row was reached.
 */
export async function jumpToAnchor(deps: JumpDeps): Promise<JumpResult> {
  if (deps.anchorKeys.length === 0) return { landed: false, reason: 'no-anchor' }
  const root = deps.root ?? ambientRoot()
  if (root === undefined) return { landed: false, reason: 'no-document' }

  const immediate = findAnchorRow(root, deps.anchorKeys)
  if (immediate !== undefined) {
    revealAncestors(immediate.row)
    landOnRow(immediate.row, deps.flashMs)
    return { landed: true, key: immediate.key }
  }

  if (deps.loadThrough !== undefined) {
    await deps.loadThrough(deps.seq)
    const found = await waitForRow(root, deps.anchorKeys, 400)
    if (found !== undefined) {
      revealAncestors(found.row)
      landOnRow(found.row, deps.flashMs)
      return { landed: true, key: found.key }
    }
  }

  if (deps.loadOlder !== undefined) {
    const maxPages = deps.maxPages ?? DEFAULT_MAX_PAGES
    for (let page = 0; page < maxPages; page += 1) {
      await deps.loadOlder()
      const found = await waitForRow(root, deps.anchorKeys, 400)
      if (found !== undefined) {
        revealAncestors(found.row)
        landOnRow(found.row, deps.flashMs)
        return { landed: true, key: found.key }
      }
    }
  }

  return { landed: false, reason: 'not-loaded' }
}
