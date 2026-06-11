import type { Message } from "./types";

/**
 * Repair tool-call pairing in a history before replaying it.
 *
 * The OpenAI/DeepSeek contract requires that every assistant `tool_calls` entry
 * is answered by exactly one following `tool` message per call id, and that no
 * stray `tool` message exists without a preceding call. A history persisted
 * mid-flight (e.g. a request aborted between the model's tool call and the
 * tool's result) can violate this and the next request 400s.
 *
 * This pass drops dangling tool calls (no matching result) and orphan tool
 * results (no matching call), preserving order otherwise. It is a no-op for
 * well-formed histories.
 */
export function sanitizeToolPairing(messages: Message[]): Message[] {
  // 1) Collect the set of tool_call ids that actually have a result.
  const answered = new Set<string>();
  for (const m of messages) {
    if (m.role === "tool" && m.toolCallId) answered.add(m.toolCallId);
  }

  // 2) Collect ids that have a corresponding assistant call.
  const called = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls) {
      for (const c of m.toolCalls) called.add(c.id);
    }
  }

  const out: Message[] = [];
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      const kept = m.toolCalls.filter((c) => answered.has(c.id));
      if (kept.length === 0) {
        // No surviving calls. Keep the message only if it has visible text.
        if (m.content.trim() !== "") out.push({ ...m, toolCalls: undefined });
        continue;
      }
      out.push({ ...m, toolCalls: kept });
      continue;
    }
    if (m.role === "tool") {
      if (m.toolCallId && called.has(m.toolCallId)) out.push(m);
      continue; // drop orphan tool results
    }
    out.push(m);
  }
  return out;
}
