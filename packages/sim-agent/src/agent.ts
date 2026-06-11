import type { Provider } from "./provider/types";
import { composeSystem, composeUserTurn } from "./prompt";
import type { TurnContext } from "./prompt";
import { cacheHitRate, fingerprintPrefix } from "./cache";
import { sanitizeToolPairing } from "./sanitize";
import type { ToolRegistry } from "./tools";
import type {
  AgentEvent,
  Message,
  ToolCall,
  ToolSpec,
  Usage,
} from "./types";
import { emptyUsage } from "./types";

export interface AgentOptions {
  provider: Provider;
  registry: ToolRegistry;
  /** Durable, byte-stable agent instructions (the cached prefix head). */
  systemPrompt: string;
  /** Durable project memory folded into the prefix once. Optional. */
  memory?: string;
  /** Max model calls per `run` before bailing out. Default 12. */
  maxSteps?: number;
  temperature?: number;
}

/**
 * The agent loop.
 *
 * KV-cache invariants this class upholds:
 *
 *   • The system message and tool specs are built **once** in the constructor
 *     and reused verbatim on every model call (the stable prefix).
 *   • `history` is strictly **append-only** — each step appends the assistant
 *     turn and any tool results; nothing earlier is ever mutated.
 *   • Every request is `[system, ...history]`, so step N's prefix is step N-1's
 *     full request — the maximal cacheable overlap.
 *   • Per-turn volatile context rides the tail of the user message (see
 *     `composeUserTurn`), never the prefix.
 *
 * The result: across a multi-step turn and across successive user turns, almost
 * the entire prompt is served from the provider's prefix cache.
 */
export class Agent {
  private readonly provider: Provider;
  private readonly registry: ToolRegistry;
  private readonly maxSteps: number;
  private readonly temperature: number | undefined;

  /** Frozen cached prefix. */
  private readonly system: Message;
  private readonly toolSpecs: ToolSpec[];
  /** Hash of the stable prefix; assert it never changes mid-session. */
  readonly prefixFingerprint: string;

  /** Append-only conversation after the system prefix. */
  private history: Message[] = [];

  constructor(opts: AgentOptions) {
    this.provider = opts.provider;
    this.registry = opts.registry;
    this.maxSteps = opts.maxSteps ?? 12;
    this.temperature = opts.temperature;
    this.system = composeSystem({ base: opts.systemPrompt, memory: opts.memory });
    this.toolSpecs = this.registry.toSpecs();
    this.prefixFingerprint = fingerprintPrefix(this.system, this.toolSpecs);
  }

  /** Snapshot of the conversation (excluding the system prefix) for persistence. */
  get messages(): readonly Message[] {
    return this.history;
  }

  /**
   * Restore a prior conversation so the next `run` continues it. Replaying the
   * same history verbatim is what lets the prefix cache span separate HTTP
   * requests, not just steps within one request. The history is sanitized so a
   * mid-turn-aborted log doesn't 400 the provider.
   */
  loadHistory(messages: Message[]): void {
    this.history = sanitizeToolPairing(messages);
  }

  /**
   * Run one user turn to completion, streaming events. The generator yields
   * reasoning/text deltas, tool calls and results, per-call usage (with cache
   * hit rate), and a terminal `done`/`error`.
   */
  async *run(
    input: string,
    opts: { ctx?: TurnContext; signal?: AbortSignal } = {},
  ): AsyncGenerator<AgentEvent> {
    this.history.push(composeUserTurn(input, opts.ctx));

    let finalText = "";
    for (let step = 1; step <= this.maxSteps; step++) {
      yield { type: "step", step };

      let text = "";
      let reasoning = "";
      const toolAccum = new Map<number, Partial<ToolCall>>();
      let usage: Usage = emptyUsage();

      try {
        const stream = this.provider.stream({
          messages: [this.system, ...this.history],
          tools: this.toolSpecs,
          temperature: this.temperature,
          signal: opts.signal,
        });
        for await (const chunk of stream) {
          switch (chunk.type) {
            case "text":
              text += chunk.delta;
              yield { type: "text", delta: chunk.delta };
              break;
            case "reasoning":
              reasoning += chunk.delta;
              yield { type: "reasoning", delta: chunk.delta };
              break;
            case "tool_call_delta": {
              const acc = toolAccum.get(chunk.index) ?? { arguments: "" };
              if (chunk.id) acc.id = chunk.id;
              if (chunk.name) acc.name = chunk.name;
              if (chunk.argumentsDelta)
                acc.arguments = (acc.arguments ?? "") + chunk.argumentsDelta;
              toolAccum.set(chunk.index, acc);
              break;
            }
            case "usage":
              usage = chunk.usage;
              break;
            case "done":
              break;
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        yield { type: "error", message };
        return;
      }

      yield { type: "usage", usage, cacheHitRate: cacheHitRate(usage) };

      const toolCalls = collectToolCalls(toolAccum);

      // Record the assistant turn (append-only). content may be empty when the
      // model only called tools.
      const assistant: Message = { role: "assistant", content: text };
      if (reasoning) assistant.reasoning = reasoning;
      if (toolCalls.length > 0) assistant.toolCalls = toolCalls;
      this.history.push(assistant);

      if (toolCalls.length === 0) {
        finalText = text;
        yield { type: "done", reason: "stop", text: finalText };
        return;
      }

      // Execute each requested tool and append its result (paired by id).
      for (const call of toolCalls) {
        yield {
          type: "tool_call",
          id: call.id,
          name: call.name,
          arguments: call.arguments,
        };
        const { result, isError } = await this.registry.execute(
          call.name,
          call.arguments,
          { signal: opts.signal },
        );
        this.history.push({
          role: "tool",
          content: result,
          toolCallId: call.id,
        });
        yield {
          type: "tool_result",
          id: call.id,
          name: call.name,
          result,
          isError,
        };
      }
      // Loop: next step sends [system, ...history] with the tool results appended.
    }

    yield { type: "done", reason: "max_steps", text: finalText };
  }
}

/** Turn accumulated streaming deltas into whole, valid tool calls. */
function collectToolCalls(accum: Map<number, Partial<ToolCall>>): ToolCall[] {
  return [...accum.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, c]) => c)
    .filter((c): c is ToolCall => Boolean(c.id && c.name))
    .map((c) => ({ id: c.id, name: c.name, arguments: c.arguments ?? "" }));
}
