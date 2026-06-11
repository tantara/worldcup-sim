import "server-only";

import type { MatchEvent, MatchEventType, Side } from "~/lib/match-engine";
import type { Team } from "~/lib/teams";
import { DEFAULT_LOCALE, type Locale } from "~/lib/i18n/config";
import { translate, type MessageKey } from "~/lib/i18n/messages";
import type { GameSpeed, MinuteEventType } from "~/lib/simulator-types";
import { runMatch } from "./match-orchestrator";

export type AgentMatchSpeed = GameSpeed;

export type AgentMatchFrame =
  | { type: "event"; event: MatchEvent }
  | { type: "error"; message: string };

/**
 * Live play-by-play for the simple two-team simulator UI.
 *
 * This is a thin adapter over the full multi-agent {@link runMatch} orchestrator
 * (match + manager + referee agents), so both the simulator and this UI share a
 * single simulation engine. We translate the orchestrator's rich event log down
 * to the flat `MatchEvent` stream the UI consumes, synthesizing the kickoff,
 * half-time, and full-time markers the orchestrator doesn't emit itself.
 */
export async function* runAgentMatch(
  home: Team,
  away: Team,
  speed: AgentMatchSpeed,
  signal?: AbortSignal,
  locale: Locale = DEFAULT_LOCALE,
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
    event: {
      id: eventId++,
      minute,
      type,
      side,
      text,
      player,
      score: { ...score },
    },
  });

  yield event(
    0,
    "kickoff",
    translate(locale, "sim.kickoffMarker", {
      home: home.name,
      away: away.name,
    }),
  );

  for await (const ev of runMatch({
    homeId: home.id,
    awayId: away.id,
    mode: "live",
    gameSpeed: speed,
    signal,
    locale,
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
          `${translate(locale, "sim.halfTime")}. ${home.flag} ${score.home} - ${score.away} ${away.flag}`,
        );
      }
      score = ev.score;
      const { event: kind, text, side, player } = ev.outcome;
      if (kind !== "none") {
        yield event(
          ev.minute,
          MINUTE_EVENT_TO_MATCH[kind],
          text || describe(kind, side, home, away, locale),
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
          ? `${translate(locale, "sim.matchStopped")} ${home.flag} ${home.name} ${score.home} - ${score.away} ${away.name} ${away.flag}`
          : `${translate(locale, "sim.fullTimeMarker")} ${home.flag} ${home.name} ${score.home} - ${score.away} ${away.name} ${away.flag}`,
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

const EVENT_FALLBACK_KEY: Record<
  Exclude<MinuteEventType, "none">,
  MessageKey
> = {
  goal: "sim.event.goal",
  save: "sim.event.save",
  miss: "sim.event.miss",
  foul: "sim.event.foul",
  yellow: "sim.event.yellow",
  red: "sim.event.red",
};

/** Fallback commentary if the model returned an event with no text. */
function describe(
  kind: Exclude<MinuteEventType, "none">,
  side: Side | null,
  home: Team,
  away: Team,
  locale: Locale,
): string {
  const team =
    side === "home" ? home.name : side === "away" ? away.name : "a side";
  return `${translate(locale, EVENT_FALLBACK_KEY[kind])} ${team}.`;
}
