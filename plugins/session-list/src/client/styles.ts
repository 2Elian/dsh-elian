/**
 * Panel styles.
 *
 * Colors come from CSS system colors (`Canvas`, `CanvasText`, `Highlight`)
 * rather than harness tokens: an out-of-repo plugin cannot rely on a token
 * layer existing, and system colors already follow the user's light/dark
 * choice without a second theme source.
 */

export const STYLE_ID = 'dsh-session-list'

export const CSS = `
.dsh-slt-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: .75;
}
.dsh-slt-button:hover, .dsh-slt-button[aria-pressed="true"] { opacity: 1; background: color-mix(in srgb, CanvasText 10%, transparent); }
.dsh-slt-panel {
  position: absolute;
  inset-inline: 0;
  bottom: calc(100% + 8px);
  z-index: 39;
  display: flex;
  flex-direction: column;
  max-height: min(60vh, 520px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
  border-radius: 10px;
  background: Canvas;
  color: CanvasText;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .22);
  font-size: 13px;
  line-height: 1.45;
}
.dsh-slt-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
.dsh-slt-input { flex: 1 1 auto; min-width: 0; padding: 6px 8px; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; background: Field; color: FieldText; font: inherit; }
.dsh-slt-input:focus-visible { outline: 2px solid Highlight; outline-offset: 1px; }
.dsh-slt-count { flex: 0 0 auto; opacity: .7; font-variant-numeric: tabular-nums; }
.dsh-slt-list { flex: 1 1 auto; overflow: auto; margin: 0; padding: 4px; list-style: none; }
.dsh-slt-item { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; padding: 7px 8px; border-radius: 6px; cursor: pointer; }
.dsh-slt-item:hover { background: color-mix(in srgb, CanvasText 7%, transparent); }
.dsh-slt-item[aria-selected="true"] { background: color-mix(in srgb, Highlight 26%, transparent); }
.dsh-slt-badge { grid-row: 1 / span 2; align-self: start; padding: 0 6px; border-radius: 999px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); font-size: 11px; opacity: .8; white-space: nowrap; font-variant-numeric: tabular-nums; }
.dsh-slt-prompt { min-width: 0; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.dsh-slt-empty { color: color-mix(in srgb, CanvasText 55%, transparent); font-style: italic; }
.dsh-slt-meta { font-size: 11px; opacity: .6; overflow-wrap: anywhere; }
.dsh-slt-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent); font-size: 11px; opacity: .8; }
.dsh-slt-action { padding: 3px 8px; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
`
