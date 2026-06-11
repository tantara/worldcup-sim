import {
  matches as wcMatches,
  schedule as wcSchedule,
  type GroupLetter,
  type Match,
  type Round,
} from "@worldcupsim/wc26-data";

import {
  getTeamByCountry,
  GROUP_LETTERS,
  teamsInGroup,
  type Team,
} from "./teams";

/** Group letter → team ids, for standings/grouping by the sim agent. */
export const GROUPS: Record<string, string[]> = Object.fromEntries(
  GROUP_LETTERS.map((g) => [g, teamsInGroup(g).map((t) => t.id)]),
);

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

/** Group-stage matches involving a given country (by exact name). */
export function teamFixtures(country: string): Match[] {
  return wcMatches.filter(
    (m) => m.round === "Group Stage" && (m.home === country || m.away === country),
  );
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

// Match numbers a knockout fixture feeds from, e.g. "Winner Match 74" -> 74.
// Round-of-32 fixtures reference group slots, so they have no match feeders.
function feederNumbers(m: Match): number[] {
  const num = (slot: string) => {
    const hit = /Match (\d+)/.exec(slot);
    return hit ? Number(hit[1]) : null;
  };
  return [num(m.home), num(m.away)].filter((n): n is number => n != null);
}

export type BracketColumn = { round: Round; matches: Match[] };
export type Bracket = { columns: BracketColumn[]; thirdPlace?: Match };

const BRACKET_ROUNDS: Round[] = [
  "Round of 32",
  "Round of 16",
  "Quarter-final",
  "Semi-final",
  "Final",
];

/**
 * Single-elimination tree, column per round (R32 → Final). Each round is
 * ordered so a match sits next to the two earlier matches that feed it, by
 * walking the bracket back from the Final. The third-place play-off is returned
 * separately since it sits outside the tree.
 */
export function bracket(): Bracket {
  const byNum = new Map(MATCHES.map((m) => [m.match, m]));
  const final = MATCHES.find((m) => m.round === "Final");
  const thirdPlace = MATCHES.find((m) => m.round === "Third-place play-off");
  if (!final) return { columns: [], thirdPlace };

  // Depth-first from the Final yields the Round-of-32 leaves in tree order.
  const leafOrder: number[] = [];
  const visit = (n: number) => {
    const m = byNum.get(n);
    if (!m) return;
    const feeders = feederNumbers(m);
    if (feeders.length === 0) leafOrder.push(n);
    else feeders.forEach(visit);
  };
  visit(final.match);

  const columns: BracketColumn[] = [];
  let prev = leafOrder;
  for (const round of BRACKET_ROUNDS) {
    if (round === "Round of 32") {
      columns.push({
        round,
        matches: leafOrder.map((n) => byNum.get(n)!),
      });
      continue;
    }
    const rank = new Map(prev.map((n, i) => [n, i]));
    const ordered = matchesByRound(round)
      .slice()
      .sort(
        (a, b) =>
          Math.min(...feederNumbers(a).map((n) => rank.get(n) ?? 0)) -
          Math.min(...feederNumbers(b).map((n) => rank.get(n) ?? 0)),
      );
    columns.push({ round, matches: ordered });
    prev = ordered.map((m) => m.match);
  }

  return { columns, thirdPlace };
}
