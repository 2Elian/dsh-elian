/** Atomic state fact used by a GraSP graph. */
export type Fact = string

/** JSON-like arguments supplied to a skill invocation. */
export type SkillArgs = Readonly<Record<string, unknown>>

/** A callable skill contract. Execution is injected by DSH consumers. */
export interface SkillDefinition {
  readonly id: string
  readonly description: string
  readonly preconditions: readonly Fact[]
  readonly effects: readonly Fact[]
  readonly execute: (args: SkillArgs, context: SkillExecutionContext) => Promise<SkillExecutionResult>
  readonly verify?: (result: SkillExecutionResult, context: SkillExecutionContext) => Promise<VerificationResult> | VerificationResult
}

/** A skill that retrieval may select before compilation. */
export interface SkillCandidate {
  readonly skill: SkillDefinition
  readonly score?: number
  readonly source?: 'semantic' | 'memory' | 'hybrid'
}

/** One invocation node in the typed DAG. */
export interface SkillNode {
  readonly id: string
  readonly skillId: string
  readonly args: SkillArgs
  readonly preconditions: readonly Fact[]
  readonly effects: readonly Fact[]
  readonly confidence: number
}

/** Edge semantics from the GraSP paper. */
export type EdgeType = 'state' | 'data' | 'order'

/** A typed dependency between two invocation nodes. */
export interface SkillEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly type: EdgeType
  readonly confidence: number
  readonly binding?: Readonly<{ output: string; input: string }>
}

/** Compiled executable DAG. */
export interface SkillGraph {
  readonly sourceId: string
  readonly sinkId: string
  readonly nodes: readonly SkillNode[]
  readonly edges: readonly SkillEdge[]
  readonly goalFacts: readonly Fact[]
}

/** A memory item used to condition retrieval. */
export interface ExperienceRecord {
  readonly id: string
  readonly task: string
  readonly skills: readonly string[]
  readonly success: boolean
  readonly similarity?: number
}

/** Retrieval configuration. */
export interface RetrievalOptions {
  readonly topK?: number
  readonly memoryWeight?: number
  readonly minScore?: number
}

/** Retrieval output, including the confidence features used by routing. */
export interface RetrievalResult {
  readonly selected: readonly SkillCandidate[]
  readonly skillScores: Readonly<Record<string, number>>
  readonly confidence: number
  readonly features: Readonly<{
    memorySimilarity: number
    distributionAgreement: number
    topSkillMargin: number
    goalCoverage: number
  }>
}

/** Compiler input supplied by a DSH adapter or an LLM-backed proposer. */
export interface CompilationRequest {
  readonly task: string
  readonly candidates: readonly SkillCandidate[]
  readonly goalFacts: readonly Fact[]
  readonly propose?: (request: CompilationRequest) => Promise<CompilationProposal>
}

/** Optional structured proposal from an LLM or planner. */
export interface CompilationProposal {
  readonly invocations: readonly SkillNode[]
  readonly edges: readonly SkillEdge[]
}

/** Runtime state passed to each skill and verifier. */
export interface SkillExecutionContext {
  readonly state: Set<Fact>
  readonly data: Map<string, unknown>
  readonly signal?: AbortSignal
  readonly task: string
}

/** Result returned by a skill implementation. */
export interface SkillExecutionResult {
  readonly ok: boolean
  readonly output?: unknown
  readonly addedFacts?: readonly Fact[]
  readonly removedFacts?: readonly Fact[]
  readonly data?: Readonly<Record<string, unknown>>
  readonly error?: string
}

/** Verification result for a postcondition check. */
export interface VerificationResult {
  readonly ok: boolean
  readonly missingEffects?: readonly Fact[]
  readonly reason?: string
}

/** Typed local repair operators from GraSP. */
export type RepairOperator = 'REBIND' | 'INSERT_PREREQ' | 'SUBSTITUTE' | 'REWIRE' | 'BYPASS'

/** Failure supplied to the local repair engine. */
export interface RepairFailure {
  readonly nodeId: string
  readonly reason: string
  readonly missingFacts: readonly Fact[]
}

/** Bounds that keep local repair local and predictable. */
export interface RepairBudget {
  readonly maxHops?: number
  readonly maxNodes?: number
  readonly maxEdges?: number
  readonly maxAttempts?: number
}

/** Repair result. */
export interface RepairResult {
  readonly operator: RepairOperator
  readonly graph: SkillGraph
  readonly repaired: boolean
  readonly reason?: string
}

/** Execution routing mode. */
export type Route = 'reactive' | 'graph' | 'graph-repair'

/** Confidence thresholds used by the routing policy. */
export interface RoutingPolicy {
  readonly lowThreshold?: number
  readonly highThreshold?: number
}

/** Execution result with a durable event trace suitable for DSH session logging. */
export interface GraphExecutionResult {
  readonly ok: boolean
  readonly route: Route
  readonly completed: readonly string[]
  readonly failedNode?: string
  readonly events: readonly ExecutionEvent[]
  readonly graph: SkillGraph
}

/** Event emitted at each verification and repair boundary. */
export type ExecutionEvent =
  | { readonly type: 'node-start'; readonly nodeId: string; readonly skillId: string }
  | { readonly type: 'node-success'; readonly nodeId: string; readonly effects: readonly Fact[] }
  | { readonly type: 'node-failure'; readonly nodeId: string; readonly reason: string }
  | { readonly type: 'repair'; readonly nodeId: string; readonly operator: RepairOperator; readonly repaired: boolean }
  | { readonly type: 'fallback'; readonly reason: string }

