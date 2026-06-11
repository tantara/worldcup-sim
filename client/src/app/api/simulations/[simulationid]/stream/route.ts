import type { OrchestratorEvent } from "~/lib/simulator-types";
import { requestTranslator } from "~/lib/i18n/request";
import { requireUser } from "~/server/auth/require-user";
import { createSseResponse } from "~/server/http/sse";
import {
  parseReplaySpeed,
  replayPacedEvents,
} from "~/server/simulations/replay";
import { runSimulationToCompletion } from "~/server/simulations/run";
import { getSimulationEvents, getSimulation } from "~/server/simulations/store";

function simulationSseResponse(
  producer: (send: (event: OrchestratorEvent) => void) => Promise<void>,
) {
  return createSseResponse<OrchestratorEvent>(producer, (message) => ({
    type: "error",
    message,
  }));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ simulationid: string }> },
): Promise<Response> {
  const { locale, t } = requestTranslator(req);
  const { simulationid } = await params;
  const simulation = await getSimulation(simulationid);
  if (!simulation) {
    return Response.json(
      { error: t("api.errors.simulationNotFound") },
      { status: 404 },
    );
  }

  const storedEvents = await getSimulationEvents(simulation.id);

  // Simulations are public: anyone can replay a completed simulation or follow
  // one that already has events, no sign-in required. The replay is paced to
  // the events' recorded timeline (override the rate with `?speed=`).
  if (simulation.status === "completed" || storedEvents.length > 0) {
    const speed = parseReplaySpeed(new URL(req.url).searchParams.get("speed"));
    return simulationSseResponse(async (send) => {
      await replayPacedEvents(storedEvents, send, req.signal, speed);
    });
  }

  // Starting a fresh run spends compute, so it stays gated to the owner.
  const user = await requireUser(t("api.errors.signInKickoff"));
  if (user instanceof Response) return user;

  if (simulation.userId !== user.id) {
    return Response.json(
      { error: t("api.errors.simulationNotFound") },
      { status: 404 },
    );
  }

  if (simulation.status === "running" || simulation.status === "queued") {
    // "queued" simulations are owned by the headless queue consumer — don't
    // start a second run from an interactive viewer.
    return Response.json(
      { error: t("api.errors.alreadyRunning") },
      { status: 409 },
    );
  }

  return simulationSseResponse(async (send) => {
    await runSimulationToCompletion(simulation, send, locale);
  });
}
