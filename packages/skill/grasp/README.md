# @deepseek-ai/dsh-skill-grasp

`@deepseek-ai/dsh-skill-grasp` is a dependency-free TypeScript core for the GraSP paper's orchestration loop: memory-conditioned skill retrieval, typed DAG compilation, node verification, bounded local repair, and confidence-based routing.

The package is intentionally framework-neutral. DSH adapters provide skill definitions, LLM compilation proposals, session events, and the actual tool/sandbox executor. This keeps the algorithm reusable without coupling it to one agent loop or one execution provider.

## Use

```ts
import {
  compileSkillGraph,
  executeSkillGraph,
  retrieveSkills,
  type SkillDefinition,
} from '@deepseek-ai/dsh-skill-grasp'

const retrieval = retrieveSkills(task, skills, memory)
const graph = await compileSkillGraph({
  task,
  candidates: retrieval.selected,
  goalFacts: ['report-ready'],
  // Optional: let a DSH LLM adapter propose invocations and typed edges.
  propose: llmCompiler,
})
const result = await executeSkillGraph({
  graph,
  skills,
  task,
  retrieval,
  repairBudget: { maxHops: 2, maxAttempts: 3 },
})
```

## Paper mapping

| GraSP stage | Package surface | DSH integration point |
| --- | --- | --- |
| Memory-conditioned retrieval | `retrieveSkills()` | `dsh-skill` catalog plus session/trajectory projection |
| DAG compilation | `compileSkillGraph()` | `dsh-llm` structured proposal or deterministic fallback |
| Pre/post verification | `SkillDefinition.verify`, `executeSkillGraph()` | tool executor and sandbox state observer |
| Local repair | `repairSkillGraph()` | skill registry, argument binder, and session event log |
| Confidence routing | `routeByConfidence()` | agent-loop turn router and ReAct fallback |

The paper reports a full LLM implementation and benchmark results; this package is an embeddable core, not a claim of reproducing those results. Its lexical retriever and deterministic compiler are safe baselines. A DSH deployment should replace them with the model, embeddings, durable memory, and sandbox adapters available in the host.

## Design constraints

- All graph mutations are validated for DAG, source reachability, and sink reachability.
- Repair is bounded by hop, node, edge, and attempt budgets supplied by the caller.
- Execution emits a small typed event trace so DSH can persist model-visible and durable lifecycle events.
- No dependency on Cordis, filesystem, process execution, or a particular LLM provider is required.

## Known Limitations and Deferred Work

- The default retriever uses token overlap; production DSH should inject embedding or model scores.
- The compiler's deterministic fallback infers state edges from exact fact strings; a model adapter should supply argument bindings and data edges.
- The current executor expects a caller-owned mutable state set and data map; a future DSH adapter can project sandbox observations into these collections.
- This package does not itself run shell commands or create a sandbox. It only orchestrates typed capabilities around one supplied executor.
