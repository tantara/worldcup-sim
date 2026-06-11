// Custom Cloudflare worker entry. Wraps the OpenNext-generated fetch handler
// and adds a Queue consumer that runs headless match simulations.
//
// The `.open-next/worker.js` import only exists after `opennextjs-cloudflare
// build`, so this file is excluded from `tsc` (see tsconfig "exclude").
// See https://opennext.js.org/cloudflare/howtos/custom-worker
// @ts-nocheck
import { default as handler } from "./.open-next/worker.js";

interface SimulationQueueMessage {
  simulationId: string;
}

export default {
  fetch: handler.fetch,

  // Queue consumer: for each message, ask the Next runtime (via the worker
  // self-reference) to run the simulation to completion. A non-2xx response
  // triggers a retry; success acks the message.
  async queue(batch, env) {
    for (const message of batch.messages) {
      const { simulationId } = message.body as SimulationQueueMessage;
      try {
        const res = await env.WORKER_SELF_REFERENCE.fetch(
          "https://worker.internal/api/internal/run-simulation",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-admin-secret": env.ADMIN_TRIGGER_SECRET ?? "",
            },
            body: JSON.stringify({ simulationId }),
          },
        );
        if (res.ok) {
          message.ack();
        } else {
          message.retry();
        }
      } catch {
        message.retry();
      }
    }
  },
};
