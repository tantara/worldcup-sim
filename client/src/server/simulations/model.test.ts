import { describe, expect, it } from "vitest";

import type { OrchestratorEvent } from "~/lib/playground-types";
import {
  buildSimulationArchive,
  canAccessSimulation,
  nextSimulationSeq,
  simulationArchiveKey,
  type SimulationRecord,
} from "./model";

const simulation: SimulationRecord = {
  id: "sim_123",
  userId: "user_1",
  matchId: 1,
  homeId: "canada",
  awayId: "mexico",
  status: "completed",
};

const phaseEvent: OrchestratorEvent = {
  type: "phase",
  phase: "kickoff",
};

const minuteEvent: OrchestratorEvent = {
  type: "minute",
  minute: 1,
  score: { home: 1, away: 0 },
  outcome: {
    event: "goal",
    side: "home",
    player: "Forward",
    assist: "Winger",
    text: "Canada scores early.",
  },
};

describe("simulation persistence model", () => {
  it("uses stable object archive keys", () => {
    expect(simulationArchiveKey("sim_123")).toBe(
      "simulations/sim_123/result.json",
    );
  });

  it("checks simulation ownership", () => {
    expect(canAccessSimulation(simulation, "user_1")).toBe(true);
    expect(canAccessSimulation(simulation, "user_2")).toBe(false);
    expect(canAccessSimulation(null, "user_1")).toBe(false);
  });

  it("allocates the next event sequence", () => {
    expect(nextSimulationSeq([])).toBe(1);
    expect(
      nextSimulationSeq([
        { seq: 2, payload: minuteEvent },
        { seq: 1, payload: phaseEvent },
      ]),
    ).toBe(3);
  });

  it("builds archives in replay order", () => {
    expect(
      buildSimulationArchive(
        simulation,
        [
          { seq: 2, payload: minuteEvent },
          { seq: 1, payload: phaseEvent },
        ],
        "2026-06-11T00:00:00.000Z",
      ),
    ).toEqual({
      simulation,
      events: [phaseEvent, minuteEvent],
      archivedAt: "2026-06-11T00:00:00.000Z",
    });
  });
});
