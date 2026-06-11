import { describe, expect, it } from "vitest";

import { parseManagerUpdate } from "./manager-update";
import type { TacticalKnobs } from "~/lib/playground-types";
import type { Player } from "~/lib/teams";

const squad: Player[] = [
  { number: 1, name: "Keeper One", position: "GK", rating: 80 },
  { number: 2, name: "Right Back", position: "DF", rating: 80 },
  { number: 3, name: "Center Back A", position: "DF", rating: 80 },
  { number: 4, name: "Center Back B", position: "DF", rating: 80 },
  { number: 5, name: "Left Back", position: "DF", rating: 80 },
  { number: 6, name: "Holding Mid", position: "MF", rating: 80 },
  { number: 7, name: "Box Mid", position: "MF", rating: 80 },
  { number: 8, name: "Creator", position: "MF", rating: 80 },
  { number: 9, name: "Right Wing", position: "FW", rating: 80 },
  { number: 10, name: "Striker", position: "FW", rating: 80 },
  { number: 11, name: "Left Wing", position: "FW", rating: 80 },
  { number: 12, name: "Bench Forward", position: "FW", rating: 80 },
];

const current = {
  formation: "4-3-3",
  tactic: "balanced" as const,
  keyPlayer: "Creator",
  strategy: "Keep the ball and attack the half-spaces.",
  lineup: squad.slice(0, 11),
};

describe("parseManagerUpdate", () => {
  it("expands compact unchanged manager updates from current state", () => {
    const update = parseManagerUpdate(
      '{"reason":"Shape is working, no changes needed.","changes":false}',
      squad,
      () => 0,
      current,
    );

    expect(update).toEqual({
      reason: "Shape is working, no changes needed.",
      formation: current.formation,
      tactic: current.tactic,
      keyPlayer: current.keyPlayer,
      strategy: current.strategy,
      lineup: current.lineup.map((p) => ({
        number: p.number,
        name: p.name,
        position: p.position,
      })),
    });
  });

  it("still accepts full manager updates when something changes", () => {
    const update = parseManagerUpdate(
      JSON.stringify({
        reason: "Need more pace against a tired back line.",
        changes: true,
        formation: "4-2-3-1",
        tactic: "attacking",
        keyPlayer: "Bench Forward",
        strategy: "Stretch the center backs with earlier runs.",
        substitutions: [
          {
            off: "Left Wing",
            on: "Bench Forward",
            reason: "Fresh runner wide left.",
          },
        ],
        lineup: [
          "Keeper One",
          "Right Back",
          "Center Back A",
          "Center Back B",
          "Left Back",
          "Holding Mid",
          "Box Mid",
          "Creator",
          "Right Wing",
          "Striker",
          "Bench Forward",
        ],
      }),
      squad,
      () => 0,
      current,
    );

    expect(update.formation).toBe("4-2-3-1");
    expect(update.tactic).toBe("attacking");
    expect(update.keyPlayer).toBe("Bench Forward");
    expect(update.lineup.map((p) => p.name)).toContain("Bench Forward");
    expect(update.substitutions).toEqual([
      {
        off: "Left Wing",
        on: "Bench Forward",
        reason: "Fresh runner wide left.",
      },
    ]);
  });

  it("carries structured knobs forward on an unchanged update", () => {
    const knobs: TacticalKnobs = {
      pressing: "high",
      lineHeight: "medium",
      tempo: "high",
    };
    const update = parseManagerUpdate(
      '{"reason":"Working well.","changes":false}',
      squad,
      () => 0,
      { ...current, knobs },
    );

    expect(update.knobs).toEqual(knobs);
  });

  it("parses structured knobs from a changed update", () => {
    const update = parseManagerUpdate(
      JSON.stringify({
        reason: "Drop the line and slow it down to protect the lead.",
        changes: true,
        formation: "5-3-2",
        tactic: "defensive",
        keyPlayer: "Creator",
        strategy: "Sit deep and break on the counter.",
        knobs: { pressing: "low", lineHeight: "low", tempo: "low" },
        lineup: current.lineup.map((p) => p.name),
      }),
      squad,
      () => 0,
      current,
    );

    expect(update.knobs).toEqual({
      pressing: "low",
      lineHeight: "low",
      tempo: "low",
    });
  });

  it("omits knobs when none are present (unchanged, no current knobs)", () => {
    const update = parseManagerUpdate(
      '{"reason":"No change.","changes":false}',
      squad,
      () => 0,
      current,
    );

    expect(update).not.toHaveProperty("knobs");
  });
});
