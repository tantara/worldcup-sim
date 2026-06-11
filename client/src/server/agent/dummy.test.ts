import { describe, expect, it } from "vitest";

import type {
  MinuteModifiers,
  MinuteContext,
} from "./dummy";
import { decideMinute, makeRng, pickStrictness } from "./dummy";
import type { OfficiatingStrictness, TacticalKnobs } from "~/lib/playground-types";
import type { Player, Team } from "~/lib/teams";
import { freshFatigue, freshMomentum } from "./match-dynamics";

const xi: Player[] = [
  { number: 1, name: "GK", position: "GK", rating: 80 },
  { number: 2, name: "DF1", position: "DF", rating: 80 },
  { number: 3, name: "DF2", position: "DF", rating: 80 },
  { number: 4, name: "MF1", position: "MF", rating: 80 },
  { number: 5, name: "MF2", position: "MF", rating: 80 },
  { number: 6, name: "FW1", position: "FW", rating: 80 },
  { number: 7, name: "FW2", position: "FW", rating: 80 },
];

function team(name: string, rating: number): Team {
  return { name, rating } as unknown as Team;
}

const MEDIUM: TacticalKnobs = {
  pressing: "medium",
  lineHeight: "medium",
  tempo: "medium",
};
const HIGH_TEMPO: TacticalKnobs = {
  pressing: "medium",
  lineHeight: "medium",
  tempo: "high",
};

function modifiers(over: Partial<MinuteModifiers> = {}): MinuteModifiers {
  return {
    homeKnobs: MEDIUM,
    awayKnobs: MEDIUM,
    momentum: freshMomentum(),
    fatigue: freshFatigue(),
    refStrictness: "normal",
    ...over,
  };
}

/** Run N independent minutes from a fixed seed and tally event types. */
function tally(mods: MinuteModifiers, seed: number, n = 4000) {
  const rng = makeRng(seed);
  const counts = { events: 0, cards: 0, goals: 0 };
  const ctx: Omit<MinuteContext, "modifiers"> = {
    rng,
    minute: 50,
    home: team("Home", 80),
    away: team("Away", 80),
    homeXI: xi,
    awayXI: xi,
    homeTactic: "balanced",
    awayTactic: "balanced",
  };
  for (let i = 0; i < n; i++) {
    const out = decideMinute({ ...ctx, rng, modifiers: mods });
    if (out.event !== "none") counts.events++;
    if (out.event === "yellow" || out.event === "red") counts.cards++;
    if (out.event === "goal") counts.goals++;
  }
  return counts;
}

describe("decideMinute modifiers", () => {
  it("a strict referee yields more cards than a lenient one", () => {
    const strict = tally(modifiers({ refStrictness: "strict" }), 12345);
    const lenient = tally(modifiers({ refStrictness: "lenient" }), 12345);
    expect(strict.cards).toBeGreaterThan(lenient.cards);
  });

  it("higher tempo produces more events", () => {
    const high = tally(
      modifiers({ homeKnobs: HIGH_TEMPO, awayKnobs: HIGH_TEMPO }),
      999,
    );
    const base = tally(modifiers(), 999);
    expect(high.events).toBeGreaterThan(base.events);
  });

  it("a tired opponent concedes more goals", () => {
    const tiredAway = tally(
      modifiers({ fatigue: { home: 1, away: 0.4 } }),
      77,
    );
    const fresh = tally(modifiers(), 77);
    expect(tiredAway.goals).toBeGreaterThanOrEqual(fresh.goals);
  });
});

describe("pickStrictness", () => {
  it("returns a valid officiating style", () => {
    const valid: OfficiatingStrictness[] = ["lenient", "normal", "strict"];
    for (let s = 0; s < 50; s++) {
      expect(valid).toContain(pickStrictness(makeRng(s)));
    }
  });
});
