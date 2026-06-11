import "server-only";

import type { OrchestratorEvent } from "~/lib/simulator-types";

/** A stored simulation event row, as returned by `getSimulationEvents`. */
interface StoredEvent {
  type: string;
  payload: OrchestratorEvent;
  createdAt: Date;
}

// A single inter-event wait is capped so a slow live gap (e.g. LLM latency)
// can't stall the replay for too long.
const MAX_GAP_MS = 3000;

// Minimum wait per event type so even instant runs (mock, or fast token
// streaming) play back one frame at a time instead of dumping at once. The real
// recorded gap is used whenever it is larger, which keeps live replays in sync
// with their original timing.
const FLOOR_MS: Record<string, number> = {
  agent_delta: 8, // per-token typewriter
  minute: 200,
  referee: 200,
  result: 0,
};
const DEFAULT_FLOOR_MS = 45;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Clamp a user-supplied `?speed` multiplier to a sane range (default 1x). */
export function parseReplaySpeed(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(16, Math.max(0.25, value));
}

/**
 * Replay stored events one at a time, pacing each by its recorded `createdAt`
 * gap (the original timeline) with a per-type floor and an overall cap, scaled
 * by `speed`. Stops early if the client disconnects (`signal`).
 */
export async function replayPacedEvents(
  events: readonly StoredEvent[],
  send: (event: OrchestratorEvent) => void,
  signal: AbortSignal,
  speed = 1,
): Promise<void> {
  let previous: Date | null = null;
  for (const event of events) {
    if (signal.aborted) return;

    const floor = FLOOR_MS[event.type] ?? DEFAULT_FLOOR_MS;
    const recordedGap = previous
      ? event.createdAt.getTime() - previous.getTime()
      : 0;
    const delay = Math.min(MAX_GAP_MS, Math.max(floor, recordedGap)) / speed;

    await sleep(delay, signal);
    if (signal.aborted) return;

    send(event.payload);
    previous = event.createdAt;
  }
}
