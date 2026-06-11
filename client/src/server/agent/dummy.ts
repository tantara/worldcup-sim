/**
 * Deterministic "dummy" decision logic for mock mode.
 *
 * These are pure functions: given a seeded RNG and the current state they return
 * the structured decision an agent would have produced (lineup / minute outcome
 * / referee verdict). The orchestrator wraps them in a scripted provider so the
 * real Agent loop runs against them with no network and reproducible results.
 */

import type {
  Lineup,
  MinuteOutcome,
  RefereeVerdict,
  Tactic,
} from "~/lib/playground-types";
import type { Player, Team } from "~/lib/teams";

/** mulberry32 — tiny, fast, seedable PRNG. Deterministic per seed. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string, for seeding from a match id. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(arr: T[], rng: () => number): T {
  // Caller guarantees non-empty arrays (squads always have players).
  return arr[Math.floor(rng() * arr.length)]!;
}

function attackers(team: Team): Player[] {
  const a = team.squad.filter((p) => p.position === "FW" || p.position === "MF");
  return a.length ? a : team.squad;
}

function defenders(team: Team): Player[] {
  const d = team.squad.filter((p) => p.position === "DF");
  return d.length ? d : team.squad;
}

function keeper(team: Team): Player {
  return team.squad.find((p) => p.position === "GK") ?? team.squad[0]!;
}

const TACTIC_GOAL_BOOST: Record<Tactic, number> = {
  attacking: 0.05,
  balanced: 0,
  defensive: -0.04,
};

/** A manager's choice for one team. */
export function decideLineup(team: Team, rng: () => number): Lineup {
  // The squads are already 11 strong, so the XI is the squad; the interesting
  // choices are tactic and the player to build around.
  const tactics: Tactic[] = ["attacking", "balanced", "defensive"];
  const tactic = pick(tactics, rng);
  const keyPlayer = pick(attackers(team), rng).name;
  return {
    formation: team.formation,
    tactic,
    keyPlayer,
    lineup: team.squad.map((p) => p.name),
  };
}

export interface MinuteContext {
  rng: () => number;
  minute: number;
  home: Team;
  away: Team;
  homeTactic: Tactic;
  awayTactic: Tactic;
}

/** What happens in one minute. Pure: does not mutate score. */
export function decideMinute(ctx: MinuteContext): MinuteOutcome {
  const { rng, minute, home, away, homeTactic, awayTactic } = ctx;

  // Most minutes are uneventful.
  if (rng() > 0.22) {
    return { event: "none", side: null, player: null, text: "" };
  }

  const homeWeight = home.rating + (homeTactic === "attacking" ? 4 : 0);
  const awayWeight = away.rating + (awayTactic === "attacking" ? 4 : 0);
  const side: "home" | "away" =
    rng() < homeWeight / (homeWeight + awayWeight) ? "home" : "away";
  const team = side === "home" ? home : away;
  const opp = side === "home" ? away : home;
  const tactic = side === "home" ? homeTactic : awayTactic;

  // Foul / card branch.
  if (rng() < 0.18) {
    const fouler = pick(team.squad, rng);
    if (rng() < 0.05) {
      return {
        event: "red",
        side,
        player: fouler.name,
        text: `🟥 Red card! ${fouler.name} (${team.name}) is sent off after a reckless tackle.`,
      };
    }
    if (rng() < 0.25) {
      return {
        event: "yellow",
        side,
        player: fouler.name,
        text: `🟨 Booking for ${fouler.name} (${team.name}).`,
      };
    }
    return {
      event: "foul",
      side,
      player: fouler.name,
      text: `Foul by ${fouler.name} (${team.name}); free kick to ${opp.name}.`,
    };
  }

  const attacker = pick(attackers(team), rng);
  const ratingEdge = (team.rating - opp.rating) / 100;
  const goalProb = 0.26 + ratingEdge + TACTIC_GOAL_BOOST[tactic];
  const roll = rng();

  if (roll < goalProb) {
    return {
      event: "goal",
      side,
      player: attacker.name,
      text: `⚽ GOAL! ${attacker.name} finishes for ${team.name} in the ${minute}'.`,
    };
  }
  if (roll < goalProb + 0.22) {
    const gk = keeper(opp);
    return {
      event: "save",
      side,
      player: attacker.name,
      text: `Big save — ${gk.name} denies ${attacker.name} (${team.name}).`,
    };
  }
  if (roll < goalProb + 0.5) {
    return {
      event: "miss",
      side,
      player: attacker.name,
      text: `${attacker.name} (${team.name}) drags it wide.`,
    };
  }
  const blocker = pick(defenders(opp), rng);
  return {
    event: "miss",
    side,
    player: attacker.name,
    text: `${attacker.name} surges forward but ${blocker.name} (${opp.name}) blocks.`,
  };
}

export interface RefereeContext {
  rng: () => number;
  minute: number;
  redCards: { home: number; away: number };
}

/** The referee's call on whether play should continue. */
export function decideReferee(ctx: RefereeContext): RefereeVerdict {
  const { rng, minute, redCards } = ctx;
  // Abandon if a side is down to a skeleton crew (3+ reds), or a rare incident.
  if (redCards.home >= 3 || redCards.away >= 3) {
    const side = redCards.home >= 3 ? "home" : "away";
    return {
      decision: "stop",
      reason: `Match abandoned in the ${minute}' — too many dismissals for the ${side} side.`,
    };
  }
  if (rng() < 0.004) {
    return {
      decision: "stop",
      reason: `Play suspended in the ${minute}' over a safety concern on the pitch.`,
    };
  }
  return {
    decision: "continue",
    reason: `Checks complete at ${minute}' — play continues.`,
  };
}
