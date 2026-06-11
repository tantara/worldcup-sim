import type { Message } from "../types";
import type { ChatRequest, Provider, ProviderChunk } from "./types";

/**
 * A responder produces the assistant text for one turn, given the messages the
 * agent would have sent. It stands in for a real model call.
 */
export type ScriptedResponder = (
  messages: Message[],
) => string | Promise<string>;

export interface ScriptedProviderOptions {
  model?: string;
  /** Characters per streamed text chunk (for a realistic incremental feel). */
  chunkSize?: number;
}

/**
 * A `Provider` backed by a plain function instead of a network call.
 *
 * Useful for offline playgrounds and tests: the real `Agent` loop runs
 * unchanged — same streaming, same history handling — but responses come from
 * `respond` rather than an LLM.
 *
 * It also *models* the prefix cache so the KV-cache behavior is visible without
 * a real provider. Because the kernel's history is append-only, each turn's
 * prompt fully contains the previous turn's prompt — so the previous prompt is
 * entirely a cached prefix of the current one. We report exactly that:
 * `cacheHitTokens = previousPromptTokens`. Across a growing session the hit rate
 * climbs toward 1.0, just as it does against DeepSeek.
 */
export function createScriptedProvider(
  name: string,
  respond: ScriptedResponder,
  options: ScriptedProviderOptions = {},
): Provider {
  const model = options.model ?? "scripted";
  const chunkSize = Math.max(1, options.chunkSize ?? 24);
  let lastPromptTokens = 0;

  return {
    name,
    model,
    async *stream(req: ChatRequest): AsyncIterable<ProviderChunk> {
      const text = await respond(req.messages);

      const promptTokens = estimateTokens(req.messages);
      // The prior prompt is a strict prefix of this one (append-only history).
      const cacheHitTokens = Math.min(lastPromptTokens, promptTokens);
      lastPromptTokens = promptTokens;

      for (let i = 0; i < text.length; i += chunkSize) {
        yield { type: "text", delta: text.slice(i, i + chunkSize) };
      }

      yield {
        type: "usage",
        usage: {
          promptTokens,
          completionTokens: estimateTextTokens(text),
          cacheHitTokens,
          cacheMissTokens: Math.max(0, promptTokens - cacheHitTokens),
          reasoningTokens: 0,
        },
      };
      yield { type: "done", finishReason: "stop" };
    },
  };
}

/** Rough token estimate: ~4 chars/token, matching common BPE averages. */
function estimateTokens(messages: Message[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.content.length;
    if (m.toolCalls) {
      for (const c of m.toolCalls) chars += c.name.length + c.arguments.length;
    }
  }
  return Math.ceil(chars / 4);
}

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
