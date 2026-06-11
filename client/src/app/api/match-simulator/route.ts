import { z } from "zod";
import { SUPPORTED_LOCALES } from "~/lib/i18n/config";
import { errorResponse, requestTranslator } from "~/lib/i18n/request";
import type { AgentMatchFrame } from "~/server/agent/live-match-simulator";
import { runAgentMatch } from "~/server/agent/live-match-simulator";
import { getTeam } from "~/lib/teams";
import { requireUser } from "~/server/auth/require-user";
import { createSseResponse } from "~/server/http/sse";

const bodySchema = z.object({
  homeId: z.string().min(1),
  awayId: z.string().min(1),
  speed: z.enum(["slow", "normal", "fast"]),
  locale: z.enum(SUPPORTED_LOCALES).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const { locale: requestLocale, t } = requestTranslator(req);
  const gate = await requireUser(t("api.errors.signInKickoff"));
  if (gate instanceof Response) return gate;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return errorResponse(req, "api.errors.invalidRequest", 400);
  }

  if (body.homeId === body.awayId) {
    return Response.json(
      { error: t("api.errors.pickDifferentTeams") },
      { status: 400 },
    );
  }

  const home = getTeam(body.homeId);
  const away = getTeam(body.awayId);
  return createSseResponse<AgentMatchFrame>(
    async (send) => {
      for await (const frame of runAgentMatch(
        home,
        away,
        body.speed,
        req.signal,
        body.locale ?? requestLocale,
      )) {
        send(frame);
      }
    },
    (message) => ({ type: "error", message }),
  );
}
