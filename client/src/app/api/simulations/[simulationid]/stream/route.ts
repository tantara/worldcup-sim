import type { OrchestratorEvent } from "~/lib/playground-types";
import { requireUser } from "~/server/auth/require-user";
import { createSseResponse } from "~/server/http/sse";
import { runSimulationToCompletion } from "~/server/simulations/run";
import {
  getSimulationEvents,
  getSimulation,
} from "~/server/simulations/store";

function simulationSseResponse(
  producer: (send: (event: OrchestratorEvent) => void) => Promise<void>,
) {
  return createSseResponse<OrchestratorEvent>(producer, (message) => ({
    type: "error",
    message,
  }));
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ simulationid: string }> },
): Promise<Response> {
  const { simulationid } = await params;
  const simulation = await getSimulation(simulationid);
  if (!simulation) {
    return Response.json({ error: "Simulation not found." }, { status: 404 });
  }

  const storedEvents = await getSimulationEvents(simulation.id);
  if (simulation.status === "completed") {
    return simulationSseResponse(async (send) => {
      for (const event of storedEvents) {
        send(event.payload);
      }
    });
  }

  const user = await requireUser("Sign in to run this simulation.");
  if (user instanceof Response) return user;

  if (simulation.userId !== user.id) {
    return Response.json({ error: "Simulation not found." }, { status: 404 });
  }

  if (simulation.status === "running" || simulation.status === "queued") {
    // "queued" simulations are owned by the headless queue consumer — don't
    // start a second run from an interactive viewer.
    return Response.json(
      { error: "This simulation is already running." },
      { status: 409 },
    );
  }

  if (storedEvents.length > 0) {
    return simulationSseResponse(async (send) => {
      for (const event of storedEvents) {
        send(event.payload);
      }
    });
  }

  return simulationSseResponse(async (send) => {
    await runSimulationToCompletion(simulation, send);
  });
}
