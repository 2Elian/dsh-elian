# GraSP Core Design and DSH Adaptation Roadmap

English | [中文](core-design.zh.md)

## Summary

GraSP adds a compilation stage between skill retrieval and execution. It converts a focused candidate set into a directed acyclic graph (DAG) with `state`, `data`, and `order` dependencies, executes ready nodes with verification, and repairs failures within a bounded neighborhood. It addresses orchestration pressure rather than a shortage of skills in DSH.

DSH already contains an unintegrated [`@deepseek-ai/dsh-skill-grasp`](../../packages/skill/grasp/README.md) prototype. It provides graph types, lexical retrieval, deterministic compilation, topological execution, five repair operators, and confidence routing, but it is neither a paper reproduction nor an adapter for DSH Markdown skills. This design keeps a framework-neutral core and adds a Cordis runtime service plus a model-facing consumer. The first usable version retrieves instructions through `ctx.skills`, executes nodes through `ctx.subagents`, persists graph state through Session events, and does not modify `agent-loop`.

## Contents

- [Motivation](#motivation)
- [Paper method](#paper-method)
- [DSH current state](#dsh-current-state)
- [Target architecture](#target-architecture)
- [Runtime flow](#runtime-flow)
- [Data and interfaces](#data-and-interfaces)
- [Failure handling](#failure-handling)
- [Adaptation roadmap](#adaptation-roadmap)
- [Acceptance and evaluation](#acceptance-and-evaluation)
- [Risks and decisions](#risks-and-decisions)
- [References](#references)
- [Dev Note](#dev-note)

-----

<a id="motivation"></a>
## Motivation

DSH can discover, load, and present many skills to a model, but its skill catalog primarily answers which instructions are available. The model still chooses, orders, executes, and recovers from those instructions implicitly. A larger flat catalog consumes more prompt context and does not preserve preconditions, data flow, or resource ordering.

GraSP separates retrieval, compilation, and execution. Retrieval selects possible skills, compilation creates a minimal executable plan, and execution determines ready nodes, verifies results, and limits failure propagation. This split fits DSH's plugin architecture: the algorithm does not need to enter the default agent loop, and adapters can compose existing skill, subagent, tool, and Session capabilities.

The expected benefits are less irrelevant skill context, parallel execution of independent nodes, preservation of verified work, and local recovery. The paper reports gains of up to 19 reward points and reductions of up to 41% in environment steps across ALFWorld, ScienceWorld, WebShop, and InterCode. Those numbers motivate the work but are not acceptance targets for this implementation.

<a id="paper-method"></a>
## Paper method

### Four-stage pipeline

1. **Memory-conditioned retrieval.** Fuse a semantic skill distribution with a distribution induced by successful trajectories, select a small candidate set, and compute confidence from memory similarity, distribution agreement, top-candidate margin, and goal coverage.
2. **DAG compilation.** Ask a model to propose invocations and arguments, validate them, and infer typed dependencies from preconditions, effects, data bindings, prior order, and resource conflicts. Hard `state` and `data` edges cannot be removed without evidence; soft `order` edges can be adjusted.
3. **Verified execution and local repair.** Schedule only ready nodes, check preconditions, execute, and run a postcondition verifier. Convert failures into structured events and apply repair operators within hop, node, edge, and attempt budgets.
4. **Confidence routing.** Fall back to ReAct below the low threshold, use the normal graph above the high threshold, and use a more cautious repair policy in between.

### Graph model

A node is one invocation, not a skill definition. It contains a skill identifier, bound arguments, preconditions, effects, verifier, status, confidence, and repair budget. A valid graph is acyclic, connects every node from source to sink, covers the goal, and gives every node valid bindings and a verifier.

`state` edges carry effects into downstream preconditions, `data` edges bind outputs to inputs, and `order` edges encode soft precedence or resource conflicts. A flat sequence is the special case containing only `order` edges.

### Five local repair operators

| Operator | Intended failure | Required preservation |
| --- | --- | --- |
| `REBIND` | Correct skill, incorrect arguments | New arguments pass schema validation |
| `INSERT_PREREQ` | Missing state | Inserted subgraph establishes the missing condition |
| `SUBSTITUTE` | Unavailable or insufficient skill | Replacement preserves downstream interface and effects |
| `REWIRE` | Incorrect dependency or order | Only local edges change and the graph remains a DAG |
| `BYPASS` | Downstream needs are already satisfied | Skipping the node preserves downstream preconditions |

Only after local repair fails may the runtime perform one bounded global recompile and then fall back to ReAct. Verified nodes outside the affected descendant closure remain valid.

-----

<a id="dsh-current-state"></a>
## DSH current state

### Reusable capabilities

| GraSP need | Existing DSH capability | Adaptation use |
| --- | --- | --- |
| Skill catalog | [`ctx.skills`](../../packages/skill/skill/src/index.ts) | Resolve a stable catalog and bodies for the current agent scope and cwd |
| Node execution | [`ctx.subagents`](../../packages/subagent/subagent/src/index.ts) | Start one-shot agents with structured output and cancellation |
| Runtime orchestration | [`ctx.workflowEngine`](../../packages/workflow/workflow/src/index.ts) | Comparison or upper-level consumer, not the owner of graph semantics |
| Tools and sandbox | [`ctx.tools`](../../packages/core/tools/src/index.ts) | Reuse permissions, execution, and result filtering through child agents |
| Live extension | `agent/*`, `tools/*` | Observe requests and tool execution without replacing the loop |
| Durable facts | [`ctx.sessions`](../../packages/core/session/src/index.ts) | Persist graph lifecycle, node evidence, repairs, and terminal state |

### Existing GraSP prototype

`packages/skill/grasp` is currently a TypeScript library with no Cordis dependency. It exports `retrieveSkills()`, `compileSkillGraph()`, `executeSkillGraph()`, `repairSkillGraph()`, `routeByConfidence()`, related types, and basic unit tests. The [architecture diagram](grasp-architecture.html) and [data-flow diagram](grasp-dataflow.html) show the same intended split.

No other package, bundle, or profile references the prototype, so no shipped DSH profile enables it. Its `SkillDefinition` is a callable object with `execute()`, while DSH's `SkillDefinition` contains Markdown instructions. The shared name hides different semantics; an adapter must translate between them rather than cast one into the other.

### Gaps to close before runtime integration

| Area | Current behavior | Required work |
| --- | --- | --- |
| Retrieval | English token overlap; effect count approximates goal coverage | Inject semantic scoring, measure actual goal coverage, and calibrate from history |
| Compilation | Automatically infers only exact-string `state` edges | Validate skills, argument schemas, `data` bindings, goal completeness, and verifiers |
| Routing | `reactive` is mainly a result label and may still execute a graph | Return a real fallback decision before compilation or execution |
| Scheduling | Computes topological order once | Recompute ready nodes after repair so inserted and failed nodes run |
| Budgets | Does not enforce `maxNodes` or `maxEdges`; attempts are global | Validate every patch and count attempts per node |
| Repair | `REBIND` adds a placeholder argument; `REWIRE` can disconnect a graph | Generate typed candidates and fully validate each patch before commit |
| Durability | Events exist only in the returned array | Append defined Session events and support reconstruction after restart |
| Concurrency | Executes nodes serially | Run ready nodes concurrently only when resource ordering permits |

-----

<a id="target-architecture"></a>
## Target architecture

Use three explicit package roles instead of modifying `agent-loop`:

| Package | Role | Responsibility |
| --- | --- | --- |
| `packages/skill/grasp` | Service Definition plus pure types and algorithms | `GraspService`, graph types, validation, event types, and Cordis-free pure functions |
| `packages/skill/grasp-basic` | Service Provider | Read skills and memory, compile with an LLM, schedule subagents, verify, and repair |
| `packages/skill/tool-grasp` | Consumer | Register a model-facing `grasp` tool and map the parent agent, goal, cancellation, and result |

The first implementation may keep the existing `grasp` package as a pure library and use a private adapter service inside `grasp-basic`. Split the formal Service Definition, Provider, and Consumer roles after the interface stabilizes. Do not enable GraSP in a default profile initially; use an explicit overlay until behavior and Session records are stable.

### Why the entry point is a tool

A `grasp` tool is the least invasive integration. The model or user explicitly requests structured orchestration. Low confidence, compile failure, or exhausted repair returns a structured fallback reason and the parent agent continues its existing ReAct loop. This does not intercept `agent/pre-step`, replace the default driver, or compete for ownership of every ordinary tool call.

### Why nodes use subagents

A DSH skill is an instruction, not a function. The adapter loads the selected body with `ctx.skills.get()` and sends the node goal, bound arguments, allowed effects, verification output schema, and skill instructions to `ctx.subagents.start()`. The child inherits DSH tools, sandbox, permission, and workspace behavior and returns structured observations, outputs, and claimed effects. Host verifiers accept observable evidence; a model claim alone never establishes an effect.

Native execution adapters may later bypass subagents for simple tool-backed nodes. That is a performance optimization, not an MVP dependency.

<a id="runtime-flow"></a>
## Runtime flow

1. `tool-grasp` accepts a goal and optional limits and captures the parent agent, cwd, and cancellation signal.
2. `grasp-basic` calls `ctx.skills.snapshot({ cwd, scope: parent })`. It rejects an incomplete catalog instead of compiling from a mixed revision.
3. Retrieval combines the task, observable state, skill summaries, and successful trajectory projection and returns top-M candidates, four confidence features, and final confidence.
4. Low confidence returns `fallback`. Otherwise, the adapter loads candidate bodies and asks the LLM for schema-constrained invocations, arguments, goal facts, and typed edges.
5. Deterministic compilation validates skill identifiers, arguments, endpoints, acyclicity, source/sink reachability, goal coverage, and verifier registration. It may remove soft edges to resolve cycles but rejects invalid hard edges.
6. The executor calculates the ready set. Nodes without resource conflicts may run concurrently; workspace, terminal, or account conflicts require `order` edges.
7. Each node checks preconditions before execution and uses a registered verifier after execution. A verified result appends a success event and freezes outputs.
8. A failure selects a local repair operator, validates patch budgets and graph invariants, and resets only the failed node and affected descendants. The new graph gets a new ready-set calculation.
9. Exhausted local repair permits one global recompile of the residual goal. A further failure returns control to the parent's ReAct path.
10. Successful runs project reusable skill order, key state, and outcome into memory. Failed trajectories support diagnostics but never raise positive priors.

<a id="data-and-interfaces"></a>
## Data and interfaces

### Node runtime protocol

Replace the current `Fact = string` with namespaced predicates so independent providers do not collide. The first version should distinguish at least `workspace.*`, `tool.*`, `artifact.*`, `session.*`, and provider-owned prefixes.

```ts
interface GraspInvocation {
  id: string
  skillName: string
  args: Readonly<Record<string, unknown>>
  preconditions: readonly Predicate[]
  effects: readonly Predicate[]
  verifier: string
  confidence: number
  repairBudget: RepairBudget
}
```

`verifier` names an entry in a verifier registry. Prefer deterministic verifiers. A model-assisted verifier must return structured evidence and confidence and cannot return only prose that says the task completed.

### Durable events

Facts that affect model behavior or recovery must enter the Session log. The minimum event family is `grasp/run-start`, `grasp/compiled`, `grasp/node-start`, `grasp/node-end`, `grasp/repair`, `grasp/replan`, and `grasp/run-end`. Events contain immutable snapshots and stable identifiers, never live `Agent` objects, functions, `Set`, or `Map` values.

A Session projection reconstructs graph revision, verified nodes, invalidated descendants, repair counters, output bindings, and terminal state. Resume re-executes only unverified or invalidated nodes. It must not repeat verified nodes whose side effects remain certain.

### Memory projection

A memory record includes task summary, initial-state summary, skill sequence, edge types, verified outcome, environment identity, and retrieval features. Only verified successful runs contribute positive priors. The lexical baseline may remain when no embedding provider exists, but it must stay replaceable and explicitly identified as a baseline.

<a id="failure-handling"></a>
## Failure handling

Failure events use `precondition`, `execution`, `postcondition`, or `timeout`. Cancellation is not repairable: abort stops new node starts, cancels active children, and ends the run as cancelled. Permission denial also does not permit substitution unless policy explicitly authorizes an alternative.

A repair patch is committed only when the graph remains acyclic, new nodes come from the visible catalog, arguments validate, affected nodes have verifiers, unaffected verified ancestors stay unchanged, and node/edge deltas fit the budget. Nodes with external side effects declare idempotency or compensation; otherwise resume requires human confirmation or ReAct takeover.

<a id="adaptation-roadmap"></a>
## Adaptation roadmap

### Stage 0: correct the pure core

- Return reactive fallback before graph execution.
- Replace the static topological array with a dynamic ready queue and reschedule after repair.
- Enforce hop, node, edge, per-node attempt, and global recompile budgets.
- Test acceptance and rejection for all five repair operators, including inserted-node execution, hard-edge preservation, substitute compatibility, and bypass conditions.
- Validate goal completeness, argument bindings, data edges, and verifier presence.

Stage 0 is complete when deterministic state-machine tests pass without Cordis and injected failures never repeat unaffected verified nodes.

### Stage 1: read-only DSH adaptation

- Add `grasp-basic` to read `ctx.skills.snapshot()` and candidate bodies but only generate, validate, and return a DAG.
- Use structured LLM output for invocations and typed edges and retain compile diagnostics without changing parent Session behavior.
- Expose an overlay-only debug tool such as `grasp_compile` to compare flat selection and DAG results.

This stage validates semantics with low risk and reveals where DSH Markdown skills lack precondition, effect, or parameter declarations.

### Stage 2: bounded execution

- Add `tool-grasp` and the subagent node executor, initially limited to allowlisted skills.
- Restrict initial predicates to verifiable workspace files, command exit codes, test results, and structured deliverables.
- Append complete Session events for UI/SDK replay and interruption diagnosis.
- Default to serial execution and enable concurrency only for tested, isolated nodes.

Stage 2 is complete when one local coding scenario passes retrieval, compilation, execution, one local repair, and Session replay that reconstructs the same terminal state.

### Stage 3: memory and confidence calibration

- Build a trajectory projection from successful Sessions and connect an embedding or replaceable scoring provider.
- Fit or calibrate the four confidence features; expose thresholds as Cordis config rather than source constants.
- Compare ReAct, ReAct plus flat skills, GraSP without repair, and complete GraSP.

### Stage 4: productization

- Add graph and repair UI, cancellation, and node-evidence inspection.
- Add GraSP to a shipped bundle only if evaluation supports it; keep it overlay-only before that decision.
- Stabilize events, TypeScript/Python SDK projections, and Session migrations before enabling it by default.

-----

<a id="acceptance-and-evaluation"></a>
## Acceptance and evaluation

Unit tests cover graph invariants, three edge types, ready-set scheduling, five repairs, budgets, cancellation, and deterministic ordering. Integration tests mount real `ctx.skills` with a fake subagent provider and verify scope/cwd resolution, structured output, verifier failure, and Session event order. Recorded snapshots cover model-visible tool schemas, tool results, and replayable transcripts.

The first evaluation compares four paths under the same model, tools, tasks, and budget: plain ReAct, flat skills, GraSP without repair, and full GraSP. Record success rate, model requests, environment/tool steps, input/output tokens, fallback rate, local-repair success, and repeated side effects.

Start with existing coding and shell scenarios and add three injected failures: a missing prerequisite file, incorrect argument binding, and a successful node whose postcondition verifier rejects. Expand adoption only when full GraSP consistently improves success or steps over flat skills.

<a id="risks-and-decisions"></a>
## Risks and decisions

- **Term collision:** Name paper nodes `GraspInvocation` or `ExecutableSkill` and reserve DSH `SkillDefinition` for Markdown skills.
- **Untrusted effects:** Child `claimedEffects` are candidate evidence; host verifiers decide whether effects hold.
- **Shared workspace:** Parallel branches can conflict on files; compilation must encode resource conflicts as `order` edges.
- **Session compatibility:** New events require type declarations, catalogs, replay projections, and both SDKs in one change; do not write temporary untyped JSON events first.
- **Fallback semantics:** Fallback transfers the residual goal to the parent and never marks the failed node successful or suppresses permission, cancellation, or safety errors.
- **Paper limits:** Interactive benchmark evidence does not establish behavior for long-lived coding side effects, collaboration, or resume; evaluate those independently.

<a id="references"></a>
## References

- [GraSP paper](https://arxiv.org/abs/2604.17870)
- [Existing GraSP core package](../../packages/skill/grasp/README.md)
- [DSH Skill subsystem](../subsystems/skills.md)
- [DSH Subagent subsystem](../subsystems/subagent.md)
- [DSH Workflow subsystem](../subsystems/workflow.md)
- [Agent turn and step lifecycle](../agent-lifecycle.md)
- [Existing architecture diagram](grasp-architecture.html)
- [Existing data-flow diagram](grasp-dataflow.html)

-----

## Dev Note

This document is a pre-implementation design baseline. It does not claim that `grasp-basic`, `tool-grasp`, Session events, or runtime adapters exist. The only executable code is the unintegrated prototype in `packages/skill/grasp`; Target architecture and Adaptation roadmap describe proposed work. The paper provides no official DSH integration, so the package split, subagent execution, and Session protocol are engineering inferences from the current repository.
