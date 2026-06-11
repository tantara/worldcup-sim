import { z } from "zod";
import type { OrchestratorEvent } from "~/lib/playground-types";
import { runLineup, runMatch } from "~/server/agent/match-orchestrator";
import { computeStandings, listResults } from "~/server/agent/results-store";

/**
 * Playground transport.
 *
 * POST `{ homeId, awayId, mode, maxMinutes? }` → SSE stream of OrchestratorEvents
 * as the four agent sessions play out a match.
 *
 * GET → the accumulated results + computed group standings, so completed matches
 * feed the next ones.
 */

const lineupSchema = z.object({
  formation: z.string().min(1),
  tactic: z.enum(["attacking", "balanced", "defensive"]),
  keyPlayer: z.string().min(1),
  reason: z.string().optional(),
  strategy: z.string().optional(),
  substitutions: z.array(
    z.object({
      off: z.string().min(1),
      on: z.string().min(1),
      reason: z.string().min(1),
    }),
  ).optional(),
  lineup: z.array(
    z.object({
      number: z.number().int(),
      name: z.string().min(1),
      position: z.enum(["GK", "DF", "MF", "FW"]),
    }),
  ).min(1),
});

const matchBodySchema = z.object({
  action: z.literal("match").optional(),
  homeId: z.string().min(1),
  awayId: z.string().min(1),
  mode: z.enum(["mock", "live"]).default("mock"),
  gameSpeed: z.enum(["slow", "normal", "fast"]).default("normal"),
  homeLineup: lineupSchema.optional(),
  awayLineup: lineupSchema.optional(),
  managerContext: z.string().optional(),
  managerIntervalMinutes: z.number().int().min(1).max(90).optional(),
  maxMinutes: z.number().int().min(1).max(90).optional(),
  /** Real WC26 fixture id (FIFA match number), when launched from a fixture. */
  matchId: z.string().min(1).optional(),
});

const lineupBodySchema = z.object({
  action: z.literal("lineup"),
  teamId: z.string().min(1),
  side: z.enum(["home", "away"]),
  mode: z.enum(["mock", "live"]).default("mock"),
  matchId: z.string().min(1).optional(),
  managerContext: z.string().optional(),
});

export async function POST(req: Request): Promise<Response> {
  let body:
    | z.infer<typeof matchBodySchema>
    | z.infer<typeof lineupBodySchema>;
  try {
    const raw: unknown = await req.json();
    body =
      typeof raw === "object" &&
      raw !== null &&
      "action" in raw &&
      raw.action === "lineup"
        ? lineupBodySchema.parse(raw)
        : matchBodySchema.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid request body";
    return Response.json({ error: message }, { status: 400 });
  }
  if ("homeId" in body && body.homeId === body.awayId) {
    return Response.json({ error: "Pick two different teams." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: OrchestratorEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        const events = "teamId" in body ? runLineup(body) : runMatch(body);
        for await (const event of events) {
          send(event);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}

export function GET(): Response {
  return Response.json({
    results: listResults(),
    standings: computeStandings(),
  });
}
