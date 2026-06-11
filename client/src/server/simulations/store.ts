import "server-only";

import { and, asc, count, desc, eq } from "drizzle-orm";

import type {
  GameSpeed,
  MatchResult,
  Mode,
  OrchestratorEvent,
} from "~/lib/simulator-types";
import { db } from "~/server/db";
import { simulationEvents, simulations } from "~/server/db/schema";
import type { SimulationStatus } from "./model";

export async function createSimulation(input: {
  userId: string;
  matchId: number;
  homeId: string;
  awayId: string;
  mode?: Mode;
  gameSpeed?: GameSpeed;
}) {
  const [simulation] = await db
    .insert(simulations)
    .values({
      userId: input.userId,
      matchId: input.matchId,
      homeId: input.homeId,
      awayId: input.awayId,
      mode: input.mode ?? "mock",
      gameSpeed: input.gameSpeed ?? "normal",
    })
    .returning();

  return simulation;
}

export async function getSimulationForUser(id: string, userId: string) {
  const [simulation] = await db
    .select()
    .from(simulations)
    .where(and(eq(simulations.id, id), eq(simulations.userId, userId)))
    .limit(1);

  return simulation ?? null;
}

export async function getSimulation(id: string) {
  const [simulation] = await db
    .select()
    .from(simulations)
    .where(eq(simulations.id, id))
    .limit(1);

  return simulation ?? null;
}

export async function listCompletedSimulationsForMatch(
  matchId: number,
  limit = 8,
) {
  return db
    .select()
    .from(simulations)
    .where(
      and(eq(simulations.matchId, matchId), eq(simulations.status, "completed")),
    )
    .orderBy(desc(simulations.completedAt), desc(simulations.createdAt))
    .limit(limit);
}

/** Every simulation a user has kicked off, newest first — backs the account page. */
export async function listSimulationsForUser(userId: string, limit = 100) {
  return db
    .select()
    .from(simulations)
    .where(eq(simulations.userId, userId))
    .orderBy(desc(simulations.createdAt))
    .limit(limit);
}

export async function countCompletedSimulationsForMatch(matchId: number) {
  const [row] = await db
    .select({ value: count() })
    .from(simulations)
    .where(
      and(eq(simulations.matchId, matchId), eq(simulations.status, "completed")),
    );
  return row?.value ?? 0;
}

export async function getSimulationEvents(simulationId: string) {
  return db
    .select()
    .from(simulationEvents)
    .where(eq(simulationEvents.simulationId, simulationId))
    .orderBy(asc(simulationEvents.seq));
}

export async function appendSimulationEvent(
  simulationId: string,
  seq: number,
  event: OrchestratorEvent,
) {
  await db.insert(simulationEvents).values({
    simulationId,
    seq,
    type: event.type,
    payload: event,
  });
}

export async function markSimulationStatus(
  simulationId: string,
  status: SimulationStatus,
) {
  await db
    .update(simulations)
    .set({ status })
    .where(eq(simulations.id, simulationId));
}

export async function completeSimulation(input: {
  simulationId: string;
  result: MatchResult;
  archiveKey: string | null;
}) {
  await db
    .update(simulations)
    .set({
      status: "completed",
      scoreHome: input.result.score.home,
      scoreAway: input.result.score.away,
      result: input.result,
      archiveKey: input.archiveKey,
      completedAt: new Date(),
    })
    .where(eq(simulations.id, input.simulationId));
}

export async function failSimulation(simulationId: string, error: string) {
  await db
    .update(simulations)
    .set({ status: "failed", error })
    .where(eq(simulations.id, simulationId));
}
