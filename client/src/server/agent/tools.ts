import type { Tool } from "@worldcupsim/sim-agent";
import { simulateMatch } from "~/lib/match-engine";
import { getTeam, TEAMS } from "~/lib/teams";

/**
 * World Cup simulation tools exposed to the agent. Each wraps the existing
 * deterministic sim engine in `~/lib`, so the model reasons over *real* results
 * from this app rather than hallucinating outcomes.
 *
 * Tool output is JSON strings — compact, and unambiguous for the model to parse.
 */

/** Read a string argument, tolerating the model sending non-strings. */
function strArg(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const listTeamsTool: Tool = {
  name: "list_teams",
  description:
    "List every national team available in the simulation, with id, name, flag, group tier, and overall rating. Call this first to discover valid team ids.",
  readOnly: true,
  parameters: { type: "object", properties: {}, required: [] },
  async execute() {
    const teams = TEAMS.map((t) => ({
      id: t.id,
      name: t.name,
      flag: t.flag,
      group: t.group,
      groupTier: t.groupTier.label,
      rating: t.rating,
    }));
    return JSON.stringify({ teams });
  },
};

const getTeamTool: Tool = {
  name: "get_team",
  description:
    "Get full detail for one team by id (manager, formation, rating, and the squad). Use list_teams to find ids.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Team id, e.g. 'bra', 'fra', 'arg'." },
    },
    required: ["id"],
  },
  async execute(args) {
    const id = strArg(args.id).toLowerCase();
    const team = getTeam(id); // throws on unknown id -> surfaced to the model
    return JSON.stringify(team);
  },
};

const simulateMatchTool: Tool = {
  name: "simulate_match",
  description:
    "Simulate a full 90-minute match between two teams (by id) and return the final score plus the key events (goals and cards). Ratings drive the outcome; results are stochastic, so the same fixture can differ across calls.",
  parameters: {
    type: "object",
    properties: {
      home_id: { type: "string", description: "Home team id, e.g. 'bra'." },
      away_id: { type: "string", description: "Away team id, e.g. 'fra'." },
    },
    required: ["home_id", "away_id"],
  },
  async execute(args) {
    const homeId = strArg(args.home_id).toLowerCase();
    const awayId = strArg(args.away_id).toLowerCase();
    if (homeId === awayId) {
      throw new Error("home_id and away_id must be different teams.");
    }
    const home = getTeam(homeId);
    const away = getTeam(awayId);
    const { events, finalScore } = simulateMatch(home, away);

    // Return only the decisive events to keep the tool result token-light.
    const keyEvents = events
      .filter((e) => e.type === "goal" || e.type === "yellow" || e.type === "red")
      .map((e) => ({ minute: e.minute, type: e.type, text: e.text }));

    return JSON.stringify({
      home: { id: home.id, name: home.name },
      away: { id: away.id, name: away.name },
      finalScore,
      result:
        finalScore.home === finalScore.away
          ? "draw"
          : finalScore.home > finalScore.away
            ? "home_win"
            : "away_win",
      keyEvents,
    });
  },
};

export const worldCupTools: Tool[] = [
  listTeamsTool,
  getTeamTool,
  simulateMatchTool,
];
