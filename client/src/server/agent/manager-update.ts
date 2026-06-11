import type { Lineup, Tactic } from "../../lib/playground-types";
import type { Player } from "../../lib/teams";
import { decideLineup } from "./dummy";

const TACTICS: ReadonlySet<string> = new Set([
  "attacking",
  "balanced",
  "defensive",
]);

export interface ManagerPlanContext {
  formation: string;
  tactic: Tactic;
  keyPlayer: string;
  strategy: string;
  lineup: Player[];
}

function extractJSON(text: string): unknown {
  const candidates = [text, ...text.split("```")];
  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      // try the next candidate
    }
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Extract a player name from a lineup entry (a bare name or `{ name }`). */
function entryName(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  const rec = asRecord(entry);
  return rec ? str(rec.name) : null;
}

export function parseLineup(
  text: string,
  squad: Player[],
  rng: () => number,
): Lineup {
  const obj = asRecord(extractJSON(text));
  const tactic = str(obj?.tactic);

  if (obj && tactic && TACTICS.has(tactic) && Array.isArray(obj.lineup)) {
    // Resolve the picked names back to real squad players (for number/position).
    const byName = new Map(squad.map((p) => [p.name.toLowerCase(), p]));
    const xi: Player[] = [];
    const seen = new Set<string>();
    for (const entry of obj.lineup) {
      const name = entryName(entry);
      const player = name ? byName.get(name.toLowerCase()) : undefined;
      if (player && !seen.has(player.name)) {
        seen.add(player.name);
        xi.push(player);
      }
    }
    // Accept a roughly-complete XI; otherwise fall back to a generated one.
    if (xi.length >= 7) {
      return {
        formation: str(obj.formation) ?? formationOf(xi),
        tactic: tactic as Tactic,
        keyPlayer: str(obj.keyPlayer) ?? xi[0]?.name ?? squad[0]!.name,
        reason: str(obj.reason) ?? undefined,
        strategy: str(obj.strategy) ?? undefined,
        substitutions: parseSubstitutions(obj.substitutions),
        lineup: xi.map((p) => ({
          number: p.number,
          name: p.name,
          position: p.position,
        })),
      };
    }
  }
  return decideLineup(squad, rng); // live model returned junk — fall back
}

export function parseManagerUpdate(
  text: string,
  squad: Player[],
  rng: () => number,
  current: ManagerPlanContext,
): Lineup {
  const obj = asRecord(extractJSON(text));
  if (obj?.changes === false) {
    return {
      reason: str(obj.reason) ?? "Manager keeps the current plan unchanged.",
      formation: current.formation,
      tactic: current.tactic,
      keyPlayer: current.keyPlayer,
      strategy: current.strategy,
      lineup: current.lineup.map((p) => ({
        number: p.number,
        name: p.name,
        position: p.position,
      })),
    };
  }
  return parseLineup(text, squad, rng);
}

function parseSubstitutions(value: unknown): Lineup["substitutions"] {
  if (!Array.isArray(value)) return undefined;
  const substitutions = value
    .map((entry) => {
      const rec = asRecord(entry);
      const off = str(rec?.off);
      const on = str(rec?.on);
      if (!off || !on) return null;
      return {
        off,
        on,
        reason: str(rec?.reason) ?? "Manager adjustment.",
      };
    })
    .filter((entry): entry is NonNullable<Lineup["substitutions"]>[number] =>
      Boolean(entry),
    );
  return substitutions.length > 0 ? substitutions : undefined;
}

/** "4-3-3"-style summary of an XI's outfield shape. */
function formationOf(xi: Player[]): string {
  const n = (pos: Player["position"]) =>
    xi.filter((p) => p.position === pos).length;
  return `${n("DF")}-${n("MF")}-${n("FW")}`;
}
