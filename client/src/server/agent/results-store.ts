import "server-only";

import type {
  GroupStanding,
  MatchResult,
  StandingRow,
} from "~/lib/playground-types";
import { GROUP_LETTERS, teamsInGroup } from "~/lib/teams";

/**
 * In-memory store of completed matches, so results feed into the next ones.
 *
 * Module-level state: this is a playground, not a database — results live for
 * the lifetime of the server process. The orchestrator writes here on full time;
 * the page reads standings from here.
 */
const results = new Map<string, MatchResult>();

export function saveResult(result: MatchResult): void {
  results.set(result.matchId, result);
}

export function listResults(): MatchResult[] {
  return [...results.values()];
}

export function getResult(matchId: string): MatchResult | undefined {
  return results.get(matchId);
}

/**
 * Compute group standings from stored results. Only groups that have at least
 * one completed (same-group) fixture are returned, so the UI isn't flooded with
 * 12 empty tables.
 */
export function computeStandings(): GroupStanding[] {
  const all = listResults();
  const standings: GroupStanding[] = [];

  for (const group of GROUP_LETTERS) {
    const rows = teamsInGroup(group).map<StandingRow>((team) => ({
      teamId: team.id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    }));
    const byId = new Map(rows.map((r) => [r.teamId, r]));

    let anyPlayed = false;
    for (const r of all) {
      if (r.abandoned) continue;
      const home = byId.get(r.homeId);
      const away = byId.get(r.awayId);
      if (!home || !away) continue; // not a fixture within this group
      anyPlayed = true;
      home.played++;
      away.played++;
      home.goalsFor += r.score.home;
      home.goalsAgainst += r.score.away;
      away.goalsFor += r.score.away;
      away.goalsAgainst += r.score.home;
      if (r.score.home > r.score.away) {
        home.won++;
        home.points += 3;
        away.lost++;
      } else if (r.score.home < r.score.away) {
        away.won++;
        away.points += 3;
        home.lost++;
      } else {
        home.drawn++;
        away.drawn++;
        home.points++;
        away.points++;
      }
    }

    if (!anyPlayed) continue;
    rows.sort(
      (a, b) =>
        b.points - a.points ||
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor,
    );
    standings.push({ group, rows });
  }

  return standings;
}
