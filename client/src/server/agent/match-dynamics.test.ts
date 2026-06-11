import { describe, expect, it } from "vitest";

import type { MinuteOutcome, TacticalKnobs } from "~/lib/simulator-types";
import {
  FATIGUE_FLOOR,
  freshFatigue,
  freshMomentum,
  knobFactor,
  knobsForTactic,
  MOMENTUM_CLAMP,
  updateFatigue,
  updateMomentum,
} from "./match-dynamics";

const HIGH: TacticalKnobs = { pressing: "high", lineHeight: "high", tempo: "high" };
const LOW: TacticalKnobs = { pressing: "low", lineHeight: "low", tempo: "low" };

const goal = (side: "home" | "away"): MinuteOutcome => ({
  event: "goal",
  side,
  player: "Scorer",
  text: "",
});
const quiet: MinuteOutcome = { event: "none", side: null, player: null, text: "" };

describe("knobsForTactic", () => {
  it("maps tactics to orthogonal defaults", () => {
    expect(knobsForTactic("attacking")).toEqual(HIGH);
    expect(knobsForTactic("defensive")).toEqual(LOW);
    expect(knobsForTactic("balanced")).toEqual({
      pressing: "medium",
      lineHeight: "medium",
      tempo: "medium",
    });
  });
});

describe("knobFactor", () => {
  it("centers on 1 and brackets by spread", () => {
    expect(knobFactor("medium")).toBe(1);
    expect(knobFactor("high")).toBeGreaterThan(1);
    expect(knobFactor("low")).toBeLessThan(1);
  });
});

describe("updateMomentum", () => {
  it("decays toward zero on quiet minutes", () => {
    const after = updateMomentum({ home: 5, away: -5 }, quiet);
    expect(Math.abs(after.home)).toBeLessThan(5);
    expect(Math.abs(after.away)).toBeLessThan(5);
  });

  it("swings to the scoring side and knocks the opponent", () => {
    const after = updateMomentum(freshMomentum(), goal("home"));
    expect(after.home).toBeGreaterThan(0);
    expect(after.away).toBeLessThan(0);
  });

  it("clamps to the configured bound", () => {
    let m = freshMomentum();
    for (let i = 0; i < 20; i++) m = updateMomentum(m, goal("home"));
    expect(m.home).toBeLessThanOrEqual(MOMENTUM_CLAMP);
  });
});

describe("updateFatigue", () => {
  it("drains harder for high-tempo, high-press sides", () => {
    const after = updateFatigue(freshFatigue(), {
      minuteStep: 1,
      homeKnobs: HIGH,
      awayKnobs: LOW,
    });
    // Both tire, but the high-work side tires faster.
    expect(after.home).toBeLessThan(after.away);
    expect(after.away).toBeLessThan(1);
  });

  it("never falls below the floor", () => {
    let f = freshFatigue();
    for (let minute = 0; minute < 200; minute++) {
      f = updateFatigue(f, { minuteStep: 1, homeKnobs: HIGH, awayKnobs: HIGH });
    }
    expect(f.home).toBeGreaterThanOrEqual(FATIGUE_FLOOR);
  });

  it("refreshes a little on substitutions", () => {
    const base = updateFatigue(
      { home: 0.6, away: 0.6 },
      { minuteStep: 1, homeKnobs: LOW, awayKnobs: LOW },
    );
    const withSub = updateFatigue(
      { home: 0.6, away: 0.6 },
      { minuteStep: 1, homeKnobs: LOW, awayKnobs: LOW, subs: { home: 2, away: 0 } },
    );
    expect(withSub.home).toBeGreaterThan(base.home);
    expect(withSub.away).toBe(base.away);
  });
});
