import "server-only";

import {
  Agent,
  ToolRegistry,
  createOpenAICompatProvider,
} from "@worldcupsim/sim-agent";
import { z } from "zod";
import { env } from "~/env";
import type { MatchEvent, MatchEventType, Side } from "~/lib/match-engine";
import type { Player, Team } from "~/lib/teams";

export type AgentMatchSpeed = "slow" | "normal" | "fast";

export type AgentMatchFrame =
  | { type: "event"; event: MatchEvent }
  | { type: "error"; message: string };

const SPEED_CONFIG: Record<
  AgentMatchSpeed,
  { reasoningEnabled: boolean; minuteStep: number }
> = {
  slow: { reasoningEnabled: true, minuteStep: 1 },
  normal: { reasoningEnabled: false, minuteStep: 1 },
  fast: { reasoningEnabled: false, minuteStep: 3 },
};

const decisionSchema = z.object({
  event: z.enum([
    "info",
    "chance",
    "save",
    "miss",
    "goal",
    "foul",
    "yellow",
    "red",
  ]),
  side: z.enum(["home", "away"]).nullable(),
  player: z.string().nullable().optional(),
  text: z.string().min(1),
});

export async function* runAgentMatch(
  home: Team,
  away: Team,
  speed: AgentMatchSpeed,
  signal?: AbortSignal,
): AsyncGenerator<AgentMatchFrame> {
  if (!env.DEEPSEEK_API_KEY) {
    yield {
      type: "error",
      message:
        "DEEPSEEK_API_KEY is not set. Add it to .env to run match-agent playback.",
    };
    return;
  }

  const config = SPEED_CONFIG[speed];
  const agent = createMatchAgent(home, away, config.reasoningEnabled);
  const score = { home: 0, away: 0 };
  let eventId = 0;

  const add = (
    minute: number,
    type: MatchEventType,
    text: string,
    side?: Side,
  ): MatchEvent => ({
    id: eventId++,
    minute,
    type,
    side,
    text,
    score: { ...score },
  });

  yield {
    type: "event",
    event: add(
      0,
      "kickoff",
      `Kick off! ${home.name} vs ${away.name} is under way.`,
    ),
  };

  for (
    let minute = config.minuteStep;
    minute <= 90;
    minute += config.minuteStep
  ) {
    if (minute === 45) {
      yield {
        type: "event",
        event: add(
          45,
          "halftime",
          `Half time. ${home.flag} ${score.home} - ${score.away} ${away.flag}`,
        ),
      };
      continue;
    }

    const decision = await runMinute(agent, {
      home,
      away,
      minute,
      score,
      minuteStep: config.minuteStep,
      signal,
    });

    if (decision.event === "goal" && decision.side) {
      score[decision.side]++;
    }

    yield {
      type: "event",
      event: add(
        minute,
        decision.event,
        decision.text,
        decision.side ?? undefined,
      ),
    };
  }

  yield {
    type: "event",
    event: add(
      90,
      "fulltime",
      `Full time! ${home.flag} ${home.name} ${score.home} - ${score.away} ${away.name} ${away.flag}`,
    ),
  };
}

function createMatchAgent(
  home: Team,
  away: Team,
  reasoningEnabled: boolean,
): Agent {
  const provider = createOpenAICompatProvider({
    apiKey: env.DEEPSEEK_API_KEY ?? "",
    baseURL: env.DEEPSEEK_BASE_URL,
    model: env.DEEPSEEK_MODEL,
    name: "match-agent",
    extraBody: {
      thinking: { type: reasoningEnabled ? "enabled" : "disabled" },
    },
  });

  return new Agent({
    provider,
    registry: new ToolRegistry([]),
    systemPrompt: matchSystemPrompt(home, away),
    temperature: 0.8,
  });
}

async function runMinute(
  agent: Agent,
  opts: {
    home: Team;
    away: Team;
    minute: number;
    score: { home: number; away: number };
    minuteStep: number;
    signal?: AbortSignal;
  },
): Promise<z.infer<typeof decisionSchema>> {
  let text = "";

  for await (const ev of agent.run(minutePrompt(opts), {
    signal: opts.signal,
  })) {
    if (ev.type === "text") {
      text += ev.delta;
    } else if (ev.type === "error") {
      throw new Error(ev.message);
    }
  }

  return parseDecision(text, opts);
}

function parseDecision(
  raw: string,
  opts: {
    home: Team;
    away: Team;
    minute: number;
    score: { home: number; away: number };
  },
): z.infer<typeof decisionSchema> {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    const json = raw.slice(start, end + 1);
    try {
      const parsed = decisionSchema.safeParse(JSON.parse(json));
      if (parsed.success) return parsed.data;
    } catch {
      // Fall through to a neutral minute if the model produced malformed JSON.
    }
  }

  return {
    event: "info",
    side: null,
    player: null,
    text: `${opts.minute}' The match settles into shape at ${opts.home.name} ${opts.score.home} - ${opts.score.away} ${opts.away.name}.`,
  };
}

function matchSystemPrompt(home: Team, away: Team): string {
  return `You are the match agent for a simulated football match between ${home.name} and ${away.name}. You decide the visible match event for each requested minute or minute window. Keep the match plausible from team ratings, formations, score state, and squad context. Respond with ONLY JSON and no code fences.`;
}

function minutePrompt(opts: {
  home: Team;
  away: Team;
  minute: number;
  score: { home: number; away: number };
  minuteStep: number;
}): string {
  const window =
    opts.minuteStep === 1
      ? `minute ${opts.minute}`
      : `minutes ${opts.minute - opts.minuteStep + 1}-${opts.minute}`;
  return `Decide the main visible event for ${window}.

Score before this event: ${opts.home.name} ${opts.score.home}-${opts.score.away} ${opts.away.name}.

Home: ${teamContext(opts.home)}
Away: ${teamContext(opts.away)}

Return JSON {"event","side","player","text"} where event is one of "info" | "chance" | "save" | "miss" | "goal" | "foul" | "yellow" | "red", side is "home" | "away" | null, player is a player name or null, and text is a concise broadcast line including the minute and current teams.`;
}

function teamContext(team: Team): string {
  return `${team.flag} ${team.name}, ${team.groupTier.label} in Group ${
    team.group
  }, rating ${team.rating}, formation ${
    team.formation
  }, manager ${team.manager}, squad ${team.squad.map(playerLabel).join(", ")}`;
}

function playerLabel(player: Player): string {
  return `${player.name} (${player.position})`;
}
