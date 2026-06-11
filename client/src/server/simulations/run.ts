import "server-only";

import type {
  GameSpeed,
  MatchResult,
  Mode,
  OrchestratorEvent,
} from "~/lib/simulator-types";
import type { Locale } from "~/lib/i18n/config";
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
  gameSpeed: GameSpeed;
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
  locale?: Locale,
): Promise<MatchResult | null> {
  await markSimulationStatus(simulation.id, "running");

  let seq = nextSimulationSeq([]);
  let result: MatchResult | null = null;
  try {
    for await (const event of runMatch({
      homeId: simulation.homeId,
      awayId: simulation.awayId,
      mode: simulation.mode,
      gameSpeed: simulation.gameSpeed,
      matchId: simulation.id,
      locale,
    })) {
      // Forward everything to a live viewer (deltas drive the typewriter), but
      // don't persist the per-token deltas — the consolidated `agent_content`
      // frame for the turn is stored instead.
      onEvent?.(event);
      if (event.type !== "agent_delta") {
        await appendSimulationEvent(simulation.id, seq++, event);
      }
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
