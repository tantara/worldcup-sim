import { z } from "zod";

import { getMatch, resolveMatch } from "~/lib/tournament";
import { checkAdminSecret } from "~/server/auth/admin-secret";
import { resolveMode } from "~/server/mode";
import { enqueueSimulation } from "~/server/simulations/queue";
import { runSimulationToCompletion } from "~/server/simulations/run";
import {
  createSimulation,
  markSimulationStatus,
} from "~/server/simulations/store";
import { getUserByEmail } from "~/server/users/store";

const triggerSchema = z.object({
  // Accepts a canonical fixture id ("1-mexico-vs-south-africa") or its number.
  matchId: z.string().min(1),
  // The admin user the generated simulation is attributed to.
  email: z.string().email(),
});

/**
 * Admin-only trigger for headless match simulations. Authenticated by the
 * shared `ADMIN_TRIGGER_SECRET` (not a session) so it can be called from
 * scripts/CI, then double-gated on the target user being an `admin`. Creates a
 * tracked simulation row and enqueues it for the Cloudflare Queue consumer to
 * run; falls back to an inline run when no queue binding exists (dev).
 */
export async function POST(req: Request): Promise<Response> {
  const denied = checkAdminSecret(req);
  if (denied) return denied;

  let body: z.infer<typeof triggerSchema>;
  try {
    body = triggerSchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }

  const user = await getUserByEmail(body.email);
  if (!user) {
    return Response.json({ error: "User not found." }, { status: 404 });
  }
  if (user.role !== "admin") {
    return Response.json(
      { error: "Admin access required." },
      { status: 403 },
    );
  }

  const fixture = getMatch(body.matchId);
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
    userId: user.id,
    matchId: fixture.match,
    homeId: home.id,
    awayId: away.id,
    mode: resolveMode("live"),
  });
  if (!simulation) {
    return Response.json(
      { error: "Simulation could not be created." },
      { status: 500 },
    );
  }

  await markSimulationStatus(simulation.id, "queued");

  const enqueued = await enqueueSimulation(simulation.id);
  if (!enqueued) {
    // No queue binding (local dev): run it inline so the trigger still works
    // end-to-end. In production the Cloudflare Queue consumer handles this.
    await runSimulationToCompletion(simulation);
  }

  return Response.json({
    simulationId: simulation.id,
    status: enqueued ? "queued" : "completed",
    url: `/match/${fixture.match}/s/${simulation.id}`,
  });
}
