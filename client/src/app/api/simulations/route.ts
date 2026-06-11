import { z } from "zod";

import { getMatch, resolveMatch } from "~/lib/tournament";
import { auth } from "~/server/auth";
import { createSimulation } from "~/server/simulations/store";

const createSimulationSchema = z.object({
  matchId: z.number().int().positive(),
  mode: z.enum(["mock", "live"]).default("mock"),
});

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Sign in to kick off a match." }, { status: 401 });
  }

  let body: z.infer<typeof createSimulationSchema>;
  try {
    body = createSimulationSchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }

  const fixture = getMatch(String(body.matchId));
  if (!fixture) {
    return Response.json({ error: "Match not found." }, { status: 404 });
  }

  const { home, away, playable } = resolveMatch(fixture);
  if (!playable || !home || !away) {
    return Response.json(
      { error: "This fixture is not playable yet." },
      { status: 400 },
    );
  }

  const simulation = await createSimulation({
    userId: session.user.id,
    matchId: fixture.match,
    homeId: home.id,
    awayId: away.id,
    mode: body.mode,
  });
  if (!simulation) {
    return Response.json(
      { error: "Simulation could not be created." },
      { status: 500 },
    );
  }

  return Response.json({
    simulationId: simulation.id,
    url: `/match/${fixture.match}/s/${simulation.id}`,
  });
}
