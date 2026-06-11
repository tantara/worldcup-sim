import type { Message, Usage } from "../types";
import { emptyUsage } from "../types";
import type { ChatRequest, Provider, ProviderChunk } from "./types";

/**
 * OpenAI-compatible streaming provider.
 *
 * Defaults target **DeepSeek**, whose Chat Completions endpoint is OpenAI-shaped
 * and — crucially — does *automatic* prefix caching. There is no cache-control
 * knob to set: the provider matches the longest token prefix it has seen before
 * and bills those tokens at a fraction of the price. Our entire job is to make
 * the request prefix byte-identical across turns so those hits land. See
 * `prompt.ts` and `Agent` for how that invariant is maintained.
 *
 * The same class works for any OpenAI-compatible endpoint (MiMo, OpenAI proper,
 * etc.) — point `baseURL`/`model` at it. Cache-usage fields are normalized from
 * whichever convention the endpoint reports.
 *
 * Runtime-agnostic: uses only `fetch`, `ReadableStream`, and `TextDecoder`, so
 * it runs on Node, Cloudflare Workers, Deno, and the browser alike.
 */
export interface OpenAICompatConfig {
  apiKey: string;
  /** Default: `https://api.deepseek.com`. No trailing slash needed. */
  baseURL?: string;
  /** Default: `deepseek-chat`. */
  model?: string;
  /** Optional display name; defaults to `deepseek`. */
  name?: string;
  /**
   * Extra fields merged into the request body (e.g. `reasoning_effort`, or
   * DeepSeek's `{ thinking: { type: "enabled" } }`). Keep these stable across a
   * session — they are part of the cached prefix shape.
   */
  extraBody?: Record<string, unknown>;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

export function createOpenAICompatProvider(
  config: OpenAICompatConfig,
): Provider {
  const baseURL = (config.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = config.model ?? DEFAULT_MODEL;
  const name = config.name ?? "deepseek";

  return {
    name,
    model,
    async *stream(req: ChatRequest): AsyncIterable<ProviderChunk> {
      const body = buildBody(model, req, config.extraBody);
      const res = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: req.signal,
      });

      if (!res.ok || !res.body) {
        const detail = await safeText(res);
        throw new Error(
          `Provider request failed (${res.status} ${res.statusText}): ${detail}`,
        );
      }

      yield* parseSSE(res.body);
    },
  };
}

// --- request encoding ------------------------------------------------------

/**
 * Build the request body. Field and message order are deterministic so the
 * serialized bytes (hence the token prefix) are reproducible across requests
 * and processes — the precondition for prefix-cache hits.
 */
function buildBody(
  model: string,
  req: ChatRequest,
  extraBody?: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages: req.messages.map(toWireMessage),
    stream: true,
    // Ask for a final usage frame so we can report cache hit/miss.
    stream_options: { include_usage: true },
  };
  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
    body.tool_choice = "auto";
  }
  if (typeof req.temperature === "number") body.temperature = req.temperature;
  if (typeof req.maxTokens === "number") body.max_tokens = req.maxTokens;
  // extraBody is spread last but should not contain volatile values.
  return extraBody ? { ...body, ...extraBody } : body;
}

interface WireMessage {
  role: Message["role"];
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
}

function toWireMessage(m: Message): WireMessage {
  // NOTE: reasoning is deliberately dropped — DeepSeek rejects assistant turns
  // that echo `reasoning_content` back into the request.
  if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: "assistant",
      content: m.content === "" ? null : m.content,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: "function",
        function: { name: c.name, arguments: c.arguments },
      })),
    };
  }
  if (m.role === "tool") {
    return {
      role: "tool",
      content: m.content,
      tool_call_id: m.toolCallId,
    };
  }
  return { role: m.role, content: m.content };
}

// --- SSE parsing -----------------------------------------------------------

async function* parseSSE(
  body: ReadableStream<Uint8Array>,
): AsyncIterable<ProviderChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; data is on `data:` lines.
      let nl: number;
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "" ) continue;
        if (data === "[DONE]") return;

        let frame: OpenAIStreamFrame;
        try {
          frame = JSON.parse(data) as OpenAIStreamFrame;
        } catch {
          continue; // ignore malformed keep-alives / partials
        }
        yield* framesFrom(frame);
      }
    }
  } finally {
    reader.releaseLock();
  }
}

interface OpenAIStreamFrame {
  choices?: {
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: RawUsage | null;
}

interface RawUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

function* framesFrom(frame: OpenAIStreamFrame): Iterable<ProviderChunk> {
  const choice = frame.choices?.[0];
  const delta = choice?.delta;
  if (delta?.reasoning_content) {
    yield { type: "reasoning", delta: delta.reasoning_content };
  }
  if (delta?.content) {
    yield { type: "text", delta: delta.content };
  }
  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      yield {
        type: "tool_call_delta",
        index: tc.index,
        id: tc.id,
        name: tc.function?.name,
        argumentsDelta: tc.function?.arguments,
      };
    }
  }
  if (frame.usage) {
    yield { type: "usage", usage: normalizeUsage(frame.usage) };
  }
  if (choice?.finish_reason) {
    yield { type: "done", finishReason: choice.finish_reason };
  }
}

function normalizeUsage(u: RawUsage): Usage {
  const usage = emptyUsage();
  usage.promptTokens = u.prompt_tokens ?? 0;
  usage.completionTokens = u.completion_tokens ?? 0;
  // DeepSeek reports an explicit hit/miss split; OpenAI nests cached_tokens.
  usage.cacheHitTokens =
    u.prompt_cache_hit_tokens ?? u.prompt_tokens_details?.cached_tokens ?? 0;
  usage.cacheMissTokens =
    u.prompt_cache_miss_tokens ??
    Math.max(0, usage.promptTokens - usage.cacheHitTokens);
  usage.reasoningTokens = u.completion_tokens_details?.reasoning_tokens ?? 0;
  return usage;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return "<no body>";
  }
}
