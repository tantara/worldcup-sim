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

function attackers(xi: Player[]): Player[] {
  const a = xi.filter((p) => p.position === "FW" || p.position === "MF");
  return a.length ? a : xi;
}

function defenders(xi: Player[]): Player[] {
  const d = xi.filter((p) => p.position === "DF");
  return d.length ? d : xi;
}

function keeper(xi: Player[]): Player {
  return xi.find((p) => p.position === "GK") ?? xi[0]!;
}

const TACTIC_GOAL_BOOST: Record<Tactic, number> = {
  attacking: 0.05,
  balanced: 0,
  defensive: -0.04,
};

const FORMATIONS = ["4-3-3", "4-2-3-1", "3-5-2", "4-4-2", "5-3-2", "3-4-3"];

/** How many players in each line, derived from a formation string. */
function lineCounts(formation: string): {
  gk: number;
  df: number;
  mf: number;
  fw: number;
} {
  const nums = formation.split("-").map(Number).filter((n) => !Number.isNaN(n));
  const df = nums[0] ?? 4;
  const fw = nums.length > 1 ? (nums[nums.length - 1] ?? 3) : 3;
  const mf = nums.slice(1, -1).reduce((a, b) => a + b, 0) || 10 - df - fw;
  return { gk: 1, df, mf, fw };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/** Pick a starting XI from the full squad that fits the given formation. */
export function selectXI(
  squad: Player[],
  formation: string,
  rng: () => number,
): Player[] {
  const counts = lineCounts(formation);
  const fromPos = (pos: Player["position"], n: number) =>
    shuffle(
      squad.filter((p) => p.position === pos),
      rng,
    ).slice(0, n);

  const xi = [
    ...fromPos("GK", counts.gk),
    ...fromPos("DF", counts.df),
    ...fromPos("MF", counts.mf),
    ...fromPos("FW", counts.fw),
  ];
  // Backfill from anyone left if a position was short, so we always get 11.
  if (xi.length < 11) {
    const chosen = new Set(xi.map((p) => p.name));
    for (const p of squad) {
      if (xi.length >= 11) break;
      if (!chosen.has(p.name)) xi.push(p);
    }
  }
  return xi.slice(0, 11);
}

/** A manager's choice for one team: pick a formation, tactic, and XI. */
export function decideLineup(squad: Player[], rng: () => number): Lineup {
  const tactics: Tactic[] = ["attacking", "balanced", "defensive"];
  const tactic = pick(tactics, rng);
  const formation = pick(FORMATIONS, rng);
  const xi = selectXI(squad, formation, rng);
  const keyPlayer = pick(attackers(xi), rng).name;
  return {
    formation,
    tactic,
    keyPlayer,
    lineup: xi.map((p) => ({
      number: p.number,
      name: p.name,
      position: p.position,
    })),
  };
}

export interface MinuteContext {
  rng: () => number;
  minute: number;
  home: Team;
  away: Team;
  /** The starting XIs the managers picked — scorers/keepers come from these. */
  homeXI: Player[];
  awayXI: Player[];
  homeTactic: Tactic;
  awayTactic: Tactic;
}

/** What happens in one minute. Pure: does not mutate score. */
export function decideMinute(ctx: MinuteContext): MinuteOutcome {
  const { rng, minute, home, away, homeXI, awayXI, homeTactic, awayTactic } =
    ctx;

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
  const teamXI = side === "home" ? homeXI : awayXI;
  const oppXI = side === "home" ? awayXI : homeXI;
  const tactic = side === "home" ? homeTactic : awayTactic;

  // Foul / card branch.
  if (rng() < 0.18) {
    const fouler = pick(teamXI, rng);
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

  const attacker = pick(attackers(teamXI), rng);
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
    const gk = keeper(oppXI);
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
  const blocker = pick(defenders(oppXI), rng);
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
