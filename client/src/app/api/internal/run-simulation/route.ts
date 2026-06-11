import { z } from "zod";

import { checkAdminSecret } from "~/server/auth/admin-secret";
import { runSimulationToCompletion } from "~/server/simulations/run";
import { getSimulation } from "~/server/simulations/store";

const runSchema = z.object({
  simulationId: z.string().min(1),
});

/**
 * Server-to-server endpoint invoked by the Cloudflare Queue consumer (via the
 * worker self-reference) to run a queued simulation to completion inside the
 * Next runtime, where the DB / R2 / env bindings are available. Authenticated
 * by the shared `ADMIN_TRIGGER_SECRET`. Idempotent: already running/completed
 * simulations are acked without re-running.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = checkAdminSecret(req);
  if (denied) return denied;

  let body: z.infer<typeof runSchema>;
  try {
    body = runSchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }

  const simulation = await getSimulation(body.simulationId);
  if (!simulation) {
    return Response.json({ error: "Simulation not found." }, { status: 404 });
  }

  // Idempotency guard for queue redelivery: don't kick off a second run.
  if (simulation.status === "completed" || simulation.status === "running") {
    return Response.json({ ok: true, status: simulation.status });
  }

  try {
    const result = await runSimulationToCompletion(simulation);
    return Response.json({
      ok: true,
      status: result ? "completed" : "failed",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
