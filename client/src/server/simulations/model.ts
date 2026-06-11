import type { MatchResult, OrchestratorEvent } from "~/lib/simulator-types";

export type SimulationStatus =
  | "created"
  | "queued"
  | "running"
  | "completed"
  | "failed";

export interface SimulationRecord {
  id: string;
  userId: string;
  matchId: number;
  homeId: string;
  awayId: string;
  status: SimulationStatus;
  result?: MatchResult | null;
  archiveKey?: string | null;
}

export interface SimulationEventRecord {
  seq: number;
  payload: OrchestratorEvent;
}

export interface SimulationArchivePayload {
  simulation: SimulationRecord;
  events: OrchestratorEvent[];
  archivedAt: string;
}

export function simulationArchiveKey(simulationId: string): string {
  return `simulations/${simulationId}/result.json`;
}

export function canAccessSimulation(
  simulation: Pick<SimulationRecord, "userId"> | null | undefined,
  userId: string,
): boolean {
  return Boolean(simulation?.userId === userId);
}

export function nextSimulationSeq(events: readonly SimulationEventRecord[]) {
  return events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
}

export function buildSimulationArchive(
  simulation: SimulationRecord,
  events: readonly SimulationEventRecord[],
  archivedAt = new Date().toISOString(),
): SimulationArchivePayload {
  return {
    simulation,
    events: events
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((event) => event.payload),
    archivedAt,
  };
}
