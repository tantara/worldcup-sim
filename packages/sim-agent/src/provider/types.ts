import type { Message, ToolSpec, Usage } from "../types";

/**
 * A model request. The kernel builds this once per step. Keeping field order and
 * serialization stable is what lets the provider's prefix cache stay warm — see
 * `provider/openai.ts` for how the body is encoded.
 */
export interface ChatRequest {
  /** Full conversation, prefix-first: `[system, ...appendOnlyHistory]`. */
  messages: Message[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Incremental output from a streaming model call.
 *
 * Tool calls arrive as deltas keyed by `index`; the agent reassembles them into
 * whole `ToolCall`s. `usage` arrives once near the end (we request
 * `stream_options.include_usage`).
 */
export type ProviderChunk =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | {
      type: "tool_call_delta";
      index: number;
      id?: string;
      name?: string;
      argumentsDelta?: string;
    }
  | { type: "usage"; usage: Usage }
  | { type: "done"; finishReason: string };

/** Minimal provider contract. Implementations live in this folder. */
export interface Provider {
  readonly name: string;
  readonly model: string;
  stream(req: ChatRequest): AsyncIterable<ProviderChunk>;
}
