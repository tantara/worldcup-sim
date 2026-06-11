import { z } from "zod";
import type { AgentMatchFrame } from "~/server/agent/live-match-simulator";
import { runAgentMatch } from "~/server/agent/live-match-simulator";
import { getTeam } from "~/lib/teams";

const bodySchema = z.object({
  homeId: z.string().min(1),
  awayId: z.string().min(1),
  speed: z.enum(["slow", "normal", "fast"]),
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

  const home = getTeam(body.homeId);
  const away = getTeam(body.awayId);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (frame: AgentMatchFrame) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      try {
        for await (const frame of runAgentMatch(
          home,
          away,
          body.speed,
          req.signal,
        )) {
          send(frame);
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
