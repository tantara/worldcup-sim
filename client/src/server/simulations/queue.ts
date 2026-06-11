import "server-only";

/** The message body the simulation queue carries. */
export interface SimulationQueueMessage {
  simulationId: string;
}

interface QueueLike {
  send(body: SimulationQueueMessage): Promise<void>;
}

interface CloudflareEnvWithQueue {
  SIM_QUEUE?: QueueLike;
}

/**
 * Resolve the `SIM_QUEUE` producer binding from the Cloudflare runtime, or
 * `null` when it is unavailable (local `next dev`, tests). Mirrors the lookup
 * pattern in `archive.ts`.
 */
async function getSimulationQueue(): Promise<QueueLike | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env: cfEnv } = await getCloudflareContext({ async: true });
    return (cfEnv as CloudflareEnvWithQueue).SIM_QUEUE ?? null;
  } catch {
    return null;
  }
}

/**
 * Enqueue a simulation for the headless queue consumer to run. Returns `true`
 * when the message was sent; `false` when no queue binding is available (so the
 * caller can fall back to running it inline in development).
 */
export async function enqueueSimulation(simulationId: string): Promise<boolean> {
  const queue = await getSimulationQueue();
  if (!queue) return false;
  await queue.send({ simulationId });
  return true;
}
