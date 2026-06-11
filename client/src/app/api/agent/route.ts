import type { AgentEvent, Message } from "@worldcupsim/sim-agent";
import { z } from "zod";
import { createSimAgent } from "~/server/agent/sim-agent";

/**
 * Streaming chat endpoint for the sim-agent.
 *
 * POST `{ message, history? }` and receive Server-Sent Events: one `data:` frame
 * per `AgentEvent` (reasoning/text deltas, tool calls/results, usage with cache
 * hit rate, and a terminal `done`). A final `{ type: "history" }` frame carries
 * the updated append-only conversation — send it back as `history` on the next
 * request so the provider's prefix cache stays warm across turns.
 */

const bodySchema = z.object({
  message: z.string().min(1, "message is required"),
  // Prior conversation (append-only). Validated structurally by the kernel's
  // sanitizer, so we accept it loosely here.
  history: z.array(z.unknown()).optional(),
});

/** Transport frame: agent events plus the closing history snapshot. */
type Frame = AgentEvent | { type: "history"; messages: readonly Message[] };

export async function POST(req: Request): Promise<Response> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }

  let agent: ReturnType<typeof createSimAgent>;
  try {
    agent = createSimAgent();
  } catch (err) {
    const message = err instanceof Error ? err.message : "agent unavailable";
    return Response.json({ error: message }, { status: 503 });
  }

  if (parsed.history) {
    agent.loadHistory(parsed.history as Message[]);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: Frame) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      try {
        for await (const event of agent.run(parsed.message, {
          signal: req.signal,
        })) {
          send(event);
        }
        send({ type: "history", messages: agent.messages });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
