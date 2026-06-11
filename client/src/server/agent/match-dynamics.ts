/**
 * Pure match-dynamics helpers: momentum, fatigue, and the tactic→knobs default.
 *
 * These are deterministic functions of the prior state plus the latest minute,
 * with no RNG and no I/O, so they're cheap to unit-test and safe to call from
 * the orchestrator loop. They turn "runs of play" and "tiring legs" into actual
 * state the match agent (and mock `decideMinute`) can condition on, instead of
 * the prose-only `matchPhase()` hint.
 */

import type {
  KnobLevel,
  MinuteOutcome,
  TacticalKnobs,
  Tactic,
} from "~/lib/playground-types";

export interface SideState {
  home: number;
  away: number;
}

/** Momentum is unbounded-ish swing in [-MOMENTUM_CLAMP, +MOMENTUM_CLAMP]. */
export const MOMENTUM_CLAMP = 5;
const MOMENTUM_DECAY = 0.8;

/** Fatigue is stamina in [FATIGUE_FLOOR, 1]; 1 = fresh legs, floor = spent. */
export const FATIGUE_FLOOR = 0.4;
const FATIGUE_FRESH = 1;
const FATIGUE_BASE_DRAIN = 0.006;
const FATIGUE_SUB_REFRESH = 0.04;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Map a knob level to a multiplier centered on 1 (low dampens, high amplifies). */
export function knobFactor(
  level: KnobLevel,
  spread = 0.3,
): number {
  if (level === "high") return 1 + spread;
  if (level === "low") return 1 - spread;
  return 1;
}

/** The default knobs implied by a tactic, used when a manager omits them. */
export function knobsForTactic(tactic: Tactic): TacticalKnobs {
  if (tactic === "attacking") {
    return { pressing: "high", lineHeight: "high", tempo: "high" };
  }
  if (tactic === "defensive") {
    return { pressing: "low", lineHeight: "low", tempo: "low" };
  }
  return { pressing: "medium", lineHeight: "medium", tempo: "medium" };
}

export function freshMomentum(): SideState {
  return { home: 0, away: 0 };
}

export function freshFatigue(): SideState {
  return { home: FATIGUE_FRESH, away: FATIGUE_FRESH };
}

/**
 * Advance momentum by one minute: decay both sides toward zero, then bump for
 * the latest outcome. A goal is a big swing for the scoring side (and a small
 * knock for the opponent); a shot/save/miss is a small swing.
 */
export function updateMomentum(
  prev: SideState,
  outcome: MinuteOutcome,
): SideState {
  const next: SideState = {
    home: prev.home * MOMENTUM_DECAY,
    away: prev.away * MOMENTUM_DECAY,
  };
  const side = outcome.side;
  if (side) {
    const other = side === "home" ? "away" : "home";
    if (outcome.event === "goal") {
      next[side] += 3;
      next[other] -= 1;
    } else if (
      outcome.event === "save" ||
      outcome.event === "miss"
    ) {
      next[side] += 1;
    }
  }
  return {
    home: clamp(next.home, -MOMENTUM_CLAMP, MOMENTUM_CLAMP),
    away: clamp(next.away, -MOMENTUM_CLAMP, MOMENTUM_CLAMP),
  };
}

export interface FatigueStep {
  /** Minutes elapsed since the previous update (>=1). */
  minuteStep: number;
  homeKnobs: TacticalKnobs;
  awayKnobs: TacticalKnobs;
  /** Fresh-legs refresh per side this step (e.g. count of substitutions made). */
  subs?: { home: number; away: number };
}

/** Per-side drain rate for one minute, scaled by how hard the side is working. */
function drainRate(knobs: TacticalKnobs): number {
  // Tempo and pressing are what tire legs; average their factors.
  const work = (knobFactor(knobs.tempo) + knobFactor(knobs.pressing)) / 2;
  return FATIGUE_BASE_DRAIN * work;
}

/**
 * Advance fatigue by `minuteStep` minutes: drain each side by its work rate,
 * then add a small refresh for any substitutions (fresh legs on the pitch).
 */
export function updateFatigue(
  prev: SideState,
  step: FatigueStep,
): SideState {
  const subs = step.subs ?? { home: 0, away: 0 };
  const next = (side: "home" | "away", knobs: TacticalKnobs): number => {
    const drained = prev[side] - drainRate(knobs) * step.minuteStep;
    const refreshed = drained + FATIGUE_SUB_REFRESH * subs[side];
    return clamp(refreshed, FATIGUE_FLOOR, FATIGUE_FRESH);
  };
  return {
    home: next("home", step.homeKnobs),
    away: next("away", step.awayKnobs),
  };
}

/** A side is "on top" when its momentum clears this threshold. */
export const MOMENTUM_HINT_THRESHOLD = 2;
/** Legs are "tiring" below this stamina. */
export const FATIGUE_HINT_THRESHOLD = 0.7;
