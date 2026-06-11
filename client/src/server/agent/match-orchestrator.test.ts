import { describe, expect, it } from "vitest";

import { parseManagerUpdate } from "./manager-update";
import type { Player } from "~/lib/teams";

const squad: Player[] = [
  { number: 1, name: "Keeper One", position: "GK" },
  { number: 2, name: "Right Back", position: "DF" },
  { number: 3, name: "Center Back A", position: "DF" },
  { number: 4, name: "Center Back B", position: "DF" },
  { number: 5, name: "Left Back", position: "DF" },
  { number: 6, name: "Holding Mid", position: "MF" },
  { number: 7, name: "Box Mid", position: "MF" },
  { number: 8, name: "Creator", position: "MF" },
  { number: 9, name: "Right Wing", position: "FW" },
  { number: 10, name: "Striker", position: "FW" },
  { number: 11, name: "Left Wing", position: "FW" },
  { number: 12, name: "Bench Forward", position: "FW" },
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
});
