/**
 * Shared types for the multi-agent match playground. Kept in `lib` (no server
 * imports) so the client UI can `import type` from it without bundling server
 * code.
 */

/** The four concurrent "threads", each its own agent session. */
export type Thread = "match" | "home-manager" | "away-manager" | "referee";

export type Mode = "mock" | "live";

export type GameSpeed = "slow" | "normal" | "fast";

export type Tactic = "attacking" | "balanced" | "defensive";

export interface LineupPlayer {
  number: number;
  name: string;
  position: "GK" | "DF" | "MF" | "FW";
}

export interface Lineup {
  formation: string;
  tactic: Tactic;
  keyPlayer: string;
  /** Why the manager chose this shape, tactic, XI, or update. */
  reason?: string;
  /** Short tactical instruction from the manager. */
  strategy?: string;
  /** In-match player changes requested by the manager. */
  substitutions?: {
    off: string;
    on: string;
    reason: string;
  }[];
  /** The chosen starting XI, picked from the full squad by mock or live. */
  lineup: LineupPlayer[];
}

export type MinuteEventType =
  | "none"
  | "goal"
  | "save"
  | "miss"
  | "foul"
  | "yellow"
  | "red";

export interface MinuteOutcome {
  event: MinuteEventType;
  side: "home" | "away" | null;
  player: string | null;
  /** Goal assister, when the minute outcome includes one. */
  assist?: string | null;
  text: string;
}

export interface RefereeVerdict {
  decision: "continue" | "stop";
  reason: string;
}

export interface MatchResult {
  matchId: string;
  homeId: string;
  awayId: string;
  homeName: string;
  awayName: string;
  score: { home: number; away: number };
  scorers: {
    side: "home" | "away";
    player: string;
    minute: number;
    assist?: string | null;
  }[];
  cards: {
    side: "home" | "away";
    player: string;
    minute: number;
    card: "yellow" | "red";
  }[];
  minutesPlayed: number;
  abandoned: boolean;
  mode: Mode;
  assistants?: AssistantSummary[];
}

export interface AssistantSummary {
  thread: Thread;
  label: string;
  turns: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  reasoningTokens: number;
  cumulativeCacheHitRate: number;
  totalLatencyMs: number;
}

export interface StandingRow {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface GroupStanding {
  group: string;
  rows: StandingRow[];
}

/** Shape of the GET /api/playground response. */
export interface StandingsResponse {
  results: MatchResult[];
  standings: GroupStanding[];
}

export interface AgentUsageSummary {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  reasoningTokens: number;
  cacheHitRate: number;
  cumulativeHitRate: number;
  latencyMs: number;
}

/**
 * Events streamed from the orchestrator to the playground UI. One unified log,
 * tagged by `thread` so the UI can route each into the right panel.
 */
export type OrchestratorEvent =
  | {
      type: "phase";
      phase: "lineups" | "kickoff" | "play" | "fulltime" | "stopped";
    }
  | { type: "thread_start"; thread: Thread; label: string }
  | { type: "agent_prompt"; thread: Thread; prompt: string }
  | { type: "agent_delta"; thread: Thread; delta: string }
  | { type: "lineup"; thread: Thread; teamName: string; lineup: Lineup }
  | {
      type: "minute";
      minute: number;
      outcome: MinuteOutcome;
      score: { home: number; away: number };
    }
  | { type: "referee"; minute: number; verdict: RefereeVerdict }
  | {
      type: "cache";
      thread: Thread;
      hitRate: number;
      promptTokens: number;
      cumulativeHitRate: number;
      completionTokens?: number;
      cacheHitTokens?: number;
      cacheMissTokens?: number;
      reasoningTokens?: number;
      latencyMs?: number;
    }
  | { type: "result"; result: MatchResult }
  | { type: "error"; message: string };
