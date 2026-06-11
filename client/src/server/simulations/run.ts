import "server-only";

import type { MatchResult, Mode, OrchestratorEvent } from "~/lib/playground-types";
import { runMatch } from "~/server/agent/match-orchestrator";
import { archiveSimulationPayload } from "./archive";
import { buildSimulationArchive, nextSimulationSeq } from "./model";
import {
  appendSimulationEvent,
  completeSimulation,
  failSimulation,
  getSimulationEvents,
  markSimulationStatus,
} from "./store";

/** The fields a stored simulation row needs to be (re)run to completion. */
export interface RunnableSimulation {
  id: string;
  userId: string;
  matchId: number;
  homeId: string;
  awayId: string;
  mode: Mode;
}

/**
 * Drives a simulation from `created`/`queued` through `running` to
 * `completed` (or `failed`): marks it running, streams `runMatch`, persists
 * every event, archives the final payload, and records the result. Shared by
 * the interactive SSE stream route (which passes `onEvent` to forward frames)
 * and the headless queue runner (which omits it).
 */
export async function runSimulationToCompletion(
  simulation: RunnableSimulation,
  onEvent?: (event: OrchestratorEvent) => void,
): Promise<MatchResult | null> {
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
      onEvent?.(event);
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

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await failSimulation(simulation.id, message);
    throw err;
  }
}
