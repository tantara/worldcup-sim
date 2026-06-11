import { z } from "zod";

import { errorResponse, requestTranslator } from "~/lib/i18n/request";
import { getMatch, resolveMatch } from "~/lib/tournament";
import { requireUser } from "~/server/auth/require-user";
import { resolveMode } from "~/server/mode";
import { createSimulation } from "~/server/simulations/store";

const createSimulationSchema = z.object({
  matchId: z.number().int().positive(),
  mode: z.enum(["mock", "live"]).default("mock"),
});

export async function POST(req: Request): Promise<Response> {
  const { t } = requestTranslator(req);
  const user = await requireUser(t("api.errors.signInKickoff"));
  if (user instanceof Response) return user;

  let body: z.infer<typeof createSimulationSchema>;
  try {
    body = createSimulationSchema.parse(await req.json());
  } catch {
    return errorResponse(req, "api.errors.invalidRequest", 400);
  }

  const fixture = getMatch(String(body.matchId));
  if (!fixture) {
    return Response.json(
      { error: t("api.errors.matchNotFound") },
      { status: 404 },
    );
  }

  const { home, away, playable } = resolveMatch(fixture);
  if (!playable || !home || !away) {
    return Response.json(
      { error: t("api.errors.notPlayable") },
      { status: 400 },
    );
  }

  const simulation = await createSimulation({
    userId: user.id,
    matchId: fixture.match,
    homeId: home.id,
    awayId: away.id,
    mode: resolveMode(body.mode),
  });
  if (!simulation) {
    return Response.json(
      { error: t("api.errors.createSimulation") },
      { status: 500 },
    );
  }

  return Response.json({
    simulationId: simulation.id,
    url: `/match/${fixture.match}/s/${simulation.id}`,
  });
}
