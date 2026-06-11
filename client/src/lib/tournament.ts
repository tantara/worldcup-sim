import {
  matches as wcMatches,
  schedule as wcSchedule,
  type GroupLetter,
  type Match,
  type Round,
} from "@worldcupsim/wc26-data";

import { getTeamByCountry, GROUP_LETTERS, type Team } from "./teams";

export type { Match, Round } from "@worldcupsim/wc26-data";

export const TOURNAMENT_NAME = wcSchedule.tournament;
export const TOURNAMENT_DATES = wcSchedule.dates;
export const HOSTS = wcSchedule.hosts;
export const VENUES = wcSchedule.venues;
export const MATCHES = wcMatches;

/** Stable URL id for a match (its FIFA match number). */
export function matchId(m: Match): string {
  return String(m.match);
}

export function getMatch(id: string): Match | undefined {
  const num = Number(id);
  return Number.isInteger(num)
    ? wcMatches.find((m) => m.match === num)
    : undefined;
}

/** Group-stage matches only have real nations as participants. */
export function isGroupStage(m: Match): boolean {
  return m.round === "Group Stage";
}

export type ResolvedMatch = {
  match: Match;
  home?: Team;
  away?: Team;
  /** True when both sides are real teams (i.e. the match is playable). */
  playable: boolean;
};

export function resolveMatch(m: Match): ResolvedMatch {
  const home = getTeamByCountry(m.home);
  const away = getTeamByCountry(m.away);
  return { match: m, home, away, playable: Boolean(home && away) };
}

export const KNOCKOUT_ROUNDS: Round[] = [
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Third-place play-off",
  "Final",
];

/** All group-stage matches for one group, in match order. */
export function matchesByGroup(group: GroupLetter): Match[] {
  return wcMatches.filter((m) => m.group === group);
}

/** Matches for one knockout round, in match order. */
export function matchesByRound(round: Round): Match[] {
  return wcMatches.filter((m) => m.round === round);
}

/** Group-stage fixtures grouped by group letter (A–L). */
export function groupStageSchedule(): { group: GroupLetter; matches: Match[] }[] {
  return GROUP_LETTERS.map((group) => ({
    group,
    matches: matchesByGroup(group),
  }));
}

/** Knockout fixtures grouped by round, in tournament order. */
export function knockoutSchedule(): { round: Round; matches: Match[] }[] {
  return KNOCKOUT_ROUNDS.map((round) => ({
    round,
    matches: matchesByRound(round),
  }));
}
