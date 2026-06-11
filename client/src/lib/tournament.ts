export type Match = {
  id: string;
  stage: string;
  matchday: number;
  homeId: string;
  awayId: string;
  kickoff: string;
  venue: string;
};

/** Eight nations split into two groups. */
export const GROUPS: Record<string, string[]> = {
  "Group A": ["bra", "fra", "eng", "ned"],
  "Group B": ["arg", "esp", "ger", "por"],
};

const VENUES = [
  "MetLife Stadium",
  "SoFi Stadium",
  "AT&T Stadium",
  "Mercedes-Benz Stadium",
  "Hard Rock Stadium",
  "Lumen Field",
];

const DATES = ["Jun 14, 2026", "Jun 18, 2026", "Jun 22, 2026"];

// Round-robin pairings (by index) for a group of four, one row per matchday.
const SCHEDULE: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [3, 1],
  ],
  [
    [0, 3],
    [1, 2],
  ],
];

function buildGroup(stage: string, ids: string[]): Match[] {
  const matches: Match[] = [];
  SCHEDULE.forEach((day, dayIdx) => {
    day.forEach((pair, gameIdx) => {
      const homeId = ids[pair[0]]!;
      const awayId = ids[pair[1]]!;
      matches.push({
        id: `${homeId}-${awayId}`,
        stage,
        matchday: dayIdx + 1,
        homeId,
        awayId,
        kickoff: DATES[dayIdx]!,
        venue: VENUES[(dayIdx * 2 + gameIdx) % VENUES.length]!,
      });
    });
  });
  return matches;
}

export const TOURNAMENT: Match[] = Object.entries(GROUPS).flatMap(
  ([stage, ids]) => buildGroup(stage, ids),
);

/** Fixtures grouped by stage, preserving group order. */
export function getSchedule(): { stage: string; matches: Match[] }[] {
  return Object.keys(GROUPS).map((stage) => ({
    stage,
    matches: TOURNAMENT.filter((m) => m.stage === stage),
  }));
}

export function getMatch(id: string): Match | undefined {
  return TOURNAMENT.find((m) => m.id === id);
}
