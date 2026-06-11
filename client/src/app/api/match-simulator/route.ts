import { z } from "zod";
import type { AgentMatchFrame } from "~/server/agent/live-match-simulator";
import { runAgentMatch } from "~/server/agent/live-match-simulator";
import { getTeam } from "~/lib/teams";
import { createSseResponse } from "~/server/http/sse";

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
    return Response.json(
      { error: "Pick two different teams." },
      { status: 400 },
    );
  }

  const home = getTeam(body.homeId);
  const away = getTeam(body.awayId);
  return createSseResponse<AgentMatchFrame>(
    async (send) => {
      for await (const frame of runAgentMatch(
        home,
        away,
        body.speed,
        req.signal,
      )) {
        send(frame);
      }
    },
    (message) => ({ type: "error", message }),
  );
}
