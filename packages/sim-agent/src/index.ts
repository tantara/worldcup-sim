/**
 * @worldcupsim/sim-agent
 *
 * A small, Reasonix-style LLM agent kernel tuned to maximize the provider's
 * prefix (KV) cache. Provider-neutral and runtime-agnostic (Web `fetch` +
 * streams), with a DeepSeek-first OpenAI-compatible provider built in.
 *
 * See `prompt.ts` and `agent.ts` for the cache-stability invariants.
 */

export { Agent } from "./agent";
export type { AgentOptions } from "./agent";

export { ToolRegistry } from "./tools";

export { createOpenAICompatProvider, sanitizeUserId } from "./provider/openai";
export type { OpenAICompatConfig } from "./provider/openai";
export { createScriptedProvider } from "./provider/scripted";
export type {
  ScriptedResponder,
  ScriptedProviderOptions,
} from "./provider/scripted";
export type {
  ChatRequest,
  Provider,
  ProviderChunk,
} from "./provider/types";

export { composeSystem, composeUserTurn } from "./prompt";
export type { SystemPromptParts, TurnContext } from "./prompt";

export { cacheHitRate, fingerprintPrefix } from "./cache";
export { sanitizeToolPairing } from "./sanitize";

export { addUsage, emptyUsage } from "./types";
export type {
  AgentEvent,
  JSONSchema,
  Message,
  Role,
  Tool,
  ToolCall,
  ToolContext,
  ToolSpec,
  Usage,
} from "./types";
