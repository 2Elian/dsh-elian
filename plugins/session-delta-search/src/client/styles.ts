/**
 * Panel styles.
 *
 * Colors come from CSS system colors (`Canvas`, `CanvasText`, `Highlight`)
 * rather than harness tokens: an out-of-repo plugin cannot rely on a token
 * layer existing, and system colors already follow the user's light/dark
 * choice without a second theme source.
 */

export const STYLE_ID = 'dsh-session-delta-search'

export const CSS = `
.dsh-sds-button {
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
.dsh-sds-button:hover, .dsh-sds-button[aria-pressed="true"] { opacity: 1; background: color-mix(in srgb, CanvasText 10%, transparent); }
.dsh-sds-panel {
  position: absolute;
  inset-inline: 0;
  bottom: calc(100% + 8px);
  z-index: 40;
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
.dsh-sds-head { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
.dsh-sds-input { flex: 1 1 auto; min-width: 0; padding: 6px 8px; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; background: Field; color: FieldText; font: inherit; }
.dsh-sds-input:focus-visible { outline: 2px solid Highlight; outline-offset: 1px; }
.dsh-sds-count { flex: 0 0 auto; opacity: .7; font-variant-numeric: tabular-nums; }
.dsh-sds-opts { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent); }
.dsh-sds-opt { display: inline-flex; align-items: center; gap: 4px; opacity: .85; cursor: pointer; }
.dsh-sds-opt input { margin: 0; }
.dsh-sds-list { flex: 1 1 auto; overflow: auto; margin: 0; padding: 4px; list-style: none; }
.dsh-sds-hit { display: grid; grid-template-columns: auto 1fr; gap: 4px 8px; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
.dsh-sds-hit:hover { background: color-mix(in srgb, CanvasText 7%, transparent); }
.dsh-sds-hit[aria-selected="true"] { background: color-mix(in srgb, Highlight 26%, transparent); }
.dsh-sds-badge { grid-row: 1 / span 2; align-self: start; padding: 0 6px; border-radius: 999px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); font-size: 11px; opacity: .8; white-space: nowrap; }
.dsh-sds-text { min-width: 0; overflow-wrap: anywhere; }
.dsh-sds-meta { font-size: 11px; opacity: .6; }
.dsh-sds-text mark { background: color-mix(in srgb, Highlight 55%, transparent); color: inherit; border-radius: 2px; }
.dsh-sds-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent); font-size: 11px; opacity: .8; }
.dsh-sds-action { padding: 3px 8px; border: 1px solid color-mix(in srgb, CanvasText 24%, transparent); border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.dsh-sds-action:disabled { opacity: .5; cursor: default; }
.dsh-sds-empty { padding: 16px 12px; text-align: center; opacity: .7; }
`
