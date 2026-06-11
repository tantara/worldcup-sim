/**
 * Core data model shared across the kernel.
 *
 * These types are intentionally provider-neutral. The OpenAI/DeepSeek wire shapes
 * live in `provider/`; everything here is what the agent loop and tools speak.
 */

export type Role = "system" | "user" | "assistant" | "tool";

/** A tool invocation requested by the model. `arguments` is a raw JSON string. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

/**
 * One conversation message.
 *
 * History is **append-only** (see `Agent`). We never edit or reorder past
 * messages, because the provider's prefix cache keys on the exact token prefix
 * of each request — rewriting history invalidates every cached token after the
 * edit point.
 */
export interface Message {
  role: Role;
  content: string;
  /** Set on assistant turns that called tools. */
  toolCalls?: ToolCall[];
  /** Set on `tool` messages: which `ToolCall.id` this answers. */
  toolCallId?: string;
  /**
   * Set on assistant turns: the model's reasoning trace (DeepSeek
   * `reasoning_content`). Kept for display/persistence only — it is **never**
   * sent back to the model, per the DeepSeek reasoning-model contract.
   */
  reasoning?: string;
}

/** A JSON Schema describing a tool's parameters (object schema at the root). */
export interface JSONSchema {
  type: "object";
  properties?: Record<string, unknown>;
  required?: readonly string[];
  [key: string]: unknown;
}

/** Context handed to a tool's `execute`. */
export interface ToolContext {
  signal?: AbortSignal;
}

/** A tool the agent can call. */
export interface Tool {
  name: string;
  description: string;
  parameters: JSONSchema;
  /**
   * Read-only tools do not mutate state. Useful for plan/research modes that
   * should observe but not act. Defaults to `false`.
   */
  readOnly?: boolean;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

/** The wire-facing slice of a tool (no executor). Byte-stable & cacheable. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JSONSchema;
}

/** Token accounting for a single model call. */
export interface Usage {
  promptTokens: number;
  completionTokens: number;
  /**
   * Prompt tokens served from the provider prefix cache. For DeepSeek this is
   * `prompt_cache_hit_tokens`; for OpenAI-style it is
   * `prompt_tokens_details.cached_tokens`. 0 if the provider doesn't report it.
   */
  cacheHitTokens: number;
  /** Prompt tokens that missed the cache (had to be recomputed). */
  cacheMissTokens: number;
  /** Reasoning tokens billed as completion (0 for non-reasoning models). */
  reasoningTokens: number;
}

export const emptyUsage = (): Usage => ({
  promptTokens: 0,
  completionTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  reasoningTokens: 0,
});

/**
 * Streaming events emitted by `Agent.run`. A frontend renders these directly.
 * This is the only surface a transport (SSE route, websocket, TUI) needs.
 */
export type AgentEvent =
  | { type: "step"; step: number }
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; arguments: string }
  | {
      type: "tool_result";
      id: string;
      name: string;
      result: string;
      isError: boolean;
    }
  | { type: "usage"; usage: Usage; cacheHitRate: number }
  | { type: "done"; reason: "stop" | "max_steps"; text: string }
  | { type: "error"; message: string };
