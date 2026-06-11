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
  // Track only future tool results so a result that appears before its assistant
  // call cannot make that later call look valid.
  const futureResults = new Map<string, number>();
  for (const m of messages) {
    if (m.role === "tool" && m.toolCallId) {
      futureResults.set(
        m.toolCallId,
        (futureResults.get(m.toolCallId) ?? 0) + 1,
      );
    }
  }

  const out: Message[] = [];
  const pendingCalls = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0) {
      const kept = m.toolCalls.filter(
        (c) => (futureResults.get(c.id) ?? 0) > 0,
      );
      if (kept.length === 0) {
        // No surviving calls. Keep the message only if it has visible text.
        if (m.content.trim() !== "") out.push({ ...m, toolCalls: undefined });
        continue;
      }
      out.push({ ...m, toolCalls: kept });
      for (const call of kept) pendingCalls.add(call.id);
      continue;
    }
    if (m.role === "tool") {
      if (!m.toolCallId) continue;
      futureResults.set(
        m.toolCallId,
        Math.max(0, (futureResults.get(m.toolCallId) ?? 0) - 1),
      );
      if (!pendingCalls.has(m.toolCallId)) continue;
      pendingCalls.delete(m.toolCallId);
      out.push(m);
      continue;
    }
    out.push(m);
  }
  return out;
}
