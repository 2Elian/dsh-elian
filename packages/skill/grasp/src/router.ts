import type { RetrievalResult, Route, RoutingPolicy } from './types.ts'

/** Select graph, repair-capable graph, or reactive fallback from retrieval confidence. */
export function routeByConfidence(result: RetrievalResult, policy: RoutingPolicy = {}): Route {
  const low = policy.lowThreshold ?? 0.3
  const high = policy.highThreshold ?? 0.7
  if (result.confidence < low) return 'reactive'
  if (result.confidence >= high) return 'graph'
  return 'graph-repair'
}
