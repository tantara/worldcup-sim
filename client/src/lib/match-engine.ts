import type { Player, Team } from "./teams";

export type Side = "home" | "away";

export type MatchEventType =
  | "kickoff"
  | "info"
  | "chance"
  | "save"
  | "miss"
  | "goal"
  | "foul"
  | "yellow"
  | "red"
  | "halftime"
  | "fulltime";

export type MatchEvent = {
  id: number;
  minute: number;
  type: MatchEventType;
  side?: Side;
  text: string;
  /** Player involved in the event (e.g. the goal scorer). */
  player?: string;
  /** Running score after this event. */
  score: { home: number; away: number };
};

export type MatchResult = {
  events: MatchEvent[];
  finalScore: { home: number; away: number };
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function attackers(team: Team): Player[] {
  const fwd = team.squad.filter(
    (p) => p.position === "FW" || p.position === "MF",
  );
  return fwd.length ? fwd : team.squad;
}

function defenders(team: Team): Player[] {
  const def = team.squad.filter((p) => p.position === "DF");
  return def.length ? def : team.squad;
}

function keeper(team: Team): Player {
  return team.squad.find((p) => p.position === "GK") ?? team.squad[0]!;
}

/**
 * Simulate a full 90-minute match between two teams.
 * Returns an ordered list of events that the UI can play back over time.
 */
export function simulateMatch(home: Team, away: Team): MatchResult {
  const events: MatchEvent[] = [];
  const score = { home: 0, away: 0 };
  let eventId = 0;

  const add = (
    minute: number,
    type: MatchEventType,
    text: string,
    side?: Side,
    player?: string,
  ) => {
    events.push({
      id: eventId++,
      minute,
      type,
      side,
      text,
      player,
      score: { ...score },
    });
  };

  add(0, "kickoff", `Kick off! ${home.name} vs ${away.name} is under way.`);

  const teamFor = (side: Side) => (side === "home" ? home : away);
  const oppFor = (side: Side) => (side === "home" ? away : home);

  // Strength ratio decides how likely each side is to be the one attacking.
  const homeWeight = home.rating;
  const awayWeight = away.rating;

  for (let minute = 1; minute <= 90; minute++) {
    if (minute === 45) {
      add(
        45,
        "halftime",
        `Half time. ${home.flag} ${score.home} - ${score.away} ${away.flag}`,
      );
      continue;
    }

    // ~22% chance of a notable passage of play each minute.
    if (Math.random() > 0.22) continue;

    const side: Side =
      Math.random() < homeWeight / (homeWeight + awayWeight) ? "home" : "away";
    const team = teamFor(side);
    const opp = oppFor(side);

    // Occasional foul / card instead of an attack.
    if (Math.random() < 0.18) {
      const fouler = pick(team.squad);
      if (Math.random() < 0.2) {
        add(
          minute,
          "yellow",
          `🟨 Yellow card. ${fouler.name} (${team.name}) is booked for a late challenge.`,
          side,
        );
      } else {
        add(
          minute,
          "foul",
          `Foul by ${fouler.name} (${team.name}). Free kick to ${opp.name}.`,
          side,
        );
      }
      continue;
    }

    // An attacking chance. Quality scales with the rating gap.
    const attacker = pick(attackers(team));
    const ratingEdge = (team.rating - opp.rating) / 100;
    const goalProb = 0.26 + ratingEdge;

    const roll = Math.random();
    if (roll < goalProb) {
      if (side === "home") score.home++;
      else score.away++;
      add(
        minute,
        "goal",
        `⚽ GOAL! ${attacker.name} scores for ${team.name}! ${home.flag} ${score.home} - ${score.away} ${away.flag}`,
        side,
        attacker.name,
      );
    } else if (roll < goalProb + 0.22) {
      const gk = keeper(opp);
      add(
        minute,
        "save",
        `Great save! ${gk.name} denies ${attacker.name} of ${team.name}.`,
        side,
      );
    } else if (roll < goalProb + 0.5) {
      add(
        minute,
        "miss",
        `${attacker.name} (${team.name}) drags the shot wide of the post.`,
        side,
      );
    } else {
      const blocker = pick(defenders(opp));
      add(
        minute,
        "chance",
        `${attacker.name} surges forward but ${blocker.name} (${opp.name}) blocks well.`,
        side,
      );
    }
  }

  add(
    90,
    "fulltime",
    `Full time! ${home.flag} ${home.name} ${score.home} - ${score.away} ${away.name} ${away.flag}`,
  );

  return { events, finalScore: { ...score } };
}
