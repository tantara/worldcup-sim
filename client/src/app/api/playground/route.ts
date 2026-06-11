import { z } from "zod";
import type { OrchestratorEvent } from "~/lib/playground-types";
import { runMatch } from "~/server/agent/match-orchestrator";
import { computeStandings, listResults } from "~/server/agent/results-store";

/**
 * Playground transport.
 *
 * POST `{ homeId, awayId, mode, maxMinutes? }` → SSE stream of OrchestratorEvents
 * as the four agent sessions play out a match.
 *
 * GET → the accumulated results + computed group standings, so completed matches
 * feed the next ones.
 */

const bodySchema = z.object({
  homeId: z.string().min(1),
  awayId: z.string().min(1),
  mode: z.enum(["mock", "live"]).default("mock"),
  maxMinutes: z.number().int().min(1).max(90).optional(),
  /** Real WC26 fixture id (FIFA match number), when launched from a fixture. */
  matchId: z.string().min(1).optional(),
});

export async function POST(req: Request): Promise<Response> {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }
  if (body.homeId === body.awayId) {
    return Response.json({ error: "Pick two different teams." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: OrchestratorEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        for await (const event of runMatch(body)) {
          send(event);
        }
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

export function GET(): Response {
  return Response.json({
    results: listResults(),
    standings: computeStandings(),
  });
}
