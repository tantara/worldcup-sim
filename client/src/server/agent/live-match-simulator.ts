import "server-only";

import type { MatchEvent, MatchEventType, Side } from "~/lib/match-engine";
import type { Team } from "~/lib/teams";
import type { GameSpeed, MinuteEventType } from "~/lib/playground-types";
import { runMatch } from "./match-orchestrator";

export type AgentMatchSpeed = GameSpeed;

export type AgentMatchFrame =
  | { type: "event"; event: MatchEvent }
  | { type: "error"; message: string };

/**
 * Live play-by-play for the simple two-team simulator UI.
 *
 * This is a thin adapter over the full multi-agent {@link runMatch} orchestrator
 * (match + manager + referee agents), so both the playground and this UI share a
 * single simulation engine. We translate the orchestrator's rich event log down
 * to the flat `MatchEvent` stream the UI consumes, synthesizing the kickoff,
 * half-time, and full-time markers the orchestrator doesn't emit itself.
 */
export async function* runAgentMatch(
  home: Team,
  away: Team,
  speed: AgentMatchSpeed,
  signal?: AbortSignal,
): AsyncGenerator<AgentMatchFrame> {
  let eventId = 0;
  let score = { home: 0, away: 0 };
  let halftimeShown = false;

  const event = (
    minute: number,
    type: MatchEventType,
    text: string,
    side?: Side,
    player?: string,
  ): AgentMatchFrame => ({
    type: "event",
    event: { id: eventId++, minute, type, side, text, player, score: { ...score } },
  });

  yield event(0, "kickoff", `Kick off! ${home.name} vs ${away.name} is under way.`);

  for await (const ev of runMatch({
    homeId: home.id,
    awayId: away.id,
    mode: "live",
    gameSpeed: speed,
    signal,
  })) {
    if (ev.type === "error") {
      yield { type: "error", message: ev.message };
      return;
    }

    if (ev.type === "minute") {
      if (!halftimeShown && ev.minute >= 45) {
        halftimeShown = true;
        yield event(
          45,
          "halftime",
          `Half time. ${home.flag} ${score.home} - ${score.away} ${away.flag}`,
        );
      }
      score = ev.score;
      const { event: kind, text, side, player } = ev.outcome;
      if (kind !== "none") {
        yield event(
          ev.minute,
          MINUTE_EVENT_TO_MATCH[kind],
          text || describe(kind, side, home, away),
          side ?? undefined,
          player ?? undefined,
        );
      }
    }

    if (ev.type === "result") {
      score = ev.result.score;
      yield event(
        ev.result.minutesPlayed,
        "fulltime",
        ev.result.abandoned
          ? `Match stopped. ${home.flag} ${home.name} ${score.home} - ${score.away} ${away.name} ${away.flag}`
          : `Full time! ${home.flag} ${home.name} ${score.home} - ${score.away} ${away.name} ${away.flag}`,
      );
    }
  }
}

const MINUTE_EVENT_TO_MATCH: Record<
  Exclude<MinuteEventType, "none">,
  MatchEventType
> = {
  goal: "goal",
  save: "save",
  miss: "miss",
  foul: "foul",
  yellow: "yellow",
  red: "red",
};

const EVENT_FALLBACK: Record<Exclude<MinuteEventType, "none">, string> = {
  goal: "Goal for",
  save: "Save denies",
  miss: "Chance goes close for",
  foul: "Foul by",
  yellow: "Yellow card for",
  red: "Red card for",
};

/** Fallback commentary if the model returned an event with no text. */
function describe(
  kind: Exclude<MinuteEventType, "none">,
  side: Side | null,
  home: Team,
  away: Team,
): string {
  const team = side === "home" ? home.name : side === "away" ? away.name : "a side";
  return `${EVENT_FALLBACK[kind]} ${team}.`;
}
