import type { MatchResult, OrchestratorEvent } from "~/lib/playground-types";
import { auth } from "~/server/auth";
import { runMatch } from "~/server/agent/match-orchestrator";
import { createSseResponse } from "~/server/http/sse";
import { archiveSimulationPayload } from "~/server/simulations/archive";
import {
  buildSimulationArchive,
  nextSimulationSeq,
} from "~/server/simulations/model";
import {
  appendSimulationEvent,
  completeSimulation,
  failSimulation,
  getSimulationEvents,
  getSimulation,
  markSimulationStatus,
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

  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { error: "Sign in to run this simulation." },
      { status: 401 },
    );
  }

  if (simulation.userId !== session.user.id) {
    return Response.json({ error: "Simulation not found." }, { status: 404 });
  }

  if (simulation.status === "running") {
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
    await markSimulationStatus(simulation.id, "running");

    let seq = nextSimulationSeq([]);
    let result: MatchResult | null = null;
    try {
      for await (const event of runMatch({
        homeId: simulation.homeId,
        awayId: simulation.awayId,
        mode: simulation.mode,
        matchId: simulation.id,
      })) {
        await appendSimulationEvent(simulation.id, seq++, event);
        send(event);
        if (event.type === "result") {
          result = event.result;
        }
      }

      if (result) {
        const events = await getSimulationEvents(simulation.id);
        const archivePayload = buildSimulationArchive(
          {
            id: simulation.id,
            userId: simulation.userId,
            matchId: simulation.matchId,
            homeId: simulation.homeId,
            awayId: simulation.awayId,
            status: "completed",
            result,
          },
          events,
        );
        const archiveKey = await archiveSimulationPayload(
          simulation.id,
          archivePayload,
        );
        await completeSimulation({
          simulationId: simulation.id,
          result,
          archiveKey,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await failSimulation(simulation.id, message);
      throw err;
    }
  });
}
