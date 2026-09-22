/**
 * Host half of the in-session search plugin.
 *
 * The feature is entirely browser-side: the transcript, the query evaluation
 * and the scroll landing all live in the client bundle, which is discovered
 * through this package's `dsh.client` declaration and served from
 * `exports["./client"]`. This entry exists so the plugin appears in the host
 * Loader and can be selected as a bundle row.
 *
 * Plain JavaScript on purpose: the Loader imports this file directly, so no
 * type annotation may appear here.
 */

/** Host plugin body — no host-side behavior for this pure-UI plugin. */
export function apply() {}
