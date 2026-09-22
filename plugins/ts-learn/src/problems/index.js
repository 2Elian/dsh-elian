/**
 * The shipped problem bank, one module per agent-development direction.
 *
 * Every module exports a `problems` array; `catalog.js` concatenates them and
 * gates each entry against `docs/PROBLEM_SCHEMA.md`.
 *
 * @module problems
 */

export { problems as agentLoop } from './agent-loop.js'
export { problems as contextPrompt } from './context-prompt.js'
export { problems as eventStream } from './event-stream.js'
export { problems as llmGateway } from './llm-gateway.js'
export { problems as subagentSkill } from './subagent-skill.js'
export { problems as toolExecution } from './tool-execution.js'
