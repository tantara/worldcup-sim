/**
 * `@worldcupsim/wc26-data` — processed 2026 FIFA World Cup dataset.
 *
 * Re-exports the squad and schedule JSON as strongly-typed values, plus a few
 * small lookup helpers. Data is bundled as JSON (no build step); consumers
 * import the typed values directly.
 */

import squadsJson from "./data/squads.json";
import scheduleJson from "./data/schedule.json";
import type {
  GroupLetter,
  Match,
  ScheduleFile,
  SquadsFile,
  Team,
  Venue,
} from "./types";

export const squads = squadsJson as SquadsFile;
export const schedule = scheduleJson as ScheduleFile;

/** All 48 teams with managers and full squads. */
export const teams: Team[] = squads.teams;

/** All 104 matches (72 group-stage + 32 knockout), ordered by match number. */
export const matches: Match[] = schedule.matches;

/** The 16 host stadiums. */
export const venues: Venue[] = schedule.venues;

/** Look up a team by country name (exact match). */
export function getTeam(country: string): Team | undefined {
  return teams.find((t) => t.country === country);
}

/** All teams in a given group, in dataset order. */
export function getTeamsByGroup(group: GroupLetter): Team[] {
  return teams.filter((t) => t.group === group);
}

/** Look up a match by its FIFA match number (1–104). */
export function getMatch(matchNumber: number): Match | undefined {
  return matches.find((m) => m.match === matchNumber);
}

/** All matches for a given group, in match-number order. */
export function getMatchesByGroup(group: GroupLetter): Match[] {
  return matches.filter((m) => m.group === group);
}

export type {
  Confederation,
  GroupLetter,
  KnockoutRound,
  Match,
  Player,
  Position,
  Round,
  ScheduleFile,
  SquadsFile,
  Team,
  Venue,
} from "./types";
