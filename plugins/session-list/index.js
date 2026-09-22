/**
 * Host half of the user-turn outline plugin.
 *
 * The feature is entirely browser-side: the turn outline is folded from the
 * browser's session event window and the scroll landing uses the transcript's
 * own row anchors, both in the client bundle discovered through this package's
 * `dsh.client` declaration. This entry exists so the plugin appears in the host
 * Loader and can be selected as a bundle row.
 *
 * Plain JavaScript on purpose: the Loader imports this file directly, so no
 * type annotation may appear here.
 */

/** Host plugin body — no host-side behavior for this pure-UI plugin. */
export function apply() {}
