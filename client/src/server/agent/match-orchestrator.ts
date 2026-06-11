import "server-only";

import {
  Agent,
  ToolRegistry,
  createOpenAICompatProvider,
  createScriptedProvider,
  type Provider,
  type Usage,
} from "@worldcupsim/sim-agent";
import { env } from "~/env";
import type {
  Lineup,
  MatchResult,
  MinuteOutcome,
  Mode,
  OrchestratorEvent,
  RefereeVerdict,
  Tactic,
  Thread,
} from "~/lib/playground-types";
import { teams as wcTeams } from "@worldcupsim/wc26-data";
import { getTeam, type Player, type Team } from "~/lib/teams";
import {
  decideLineup,
  decideMinute,
  decideReferee,
  hashSeed,
  makeRng,
} from "./dummy";
import { saveResult } from "./results-store";

/**
 * The full ~26-player squad for a team (the client `Team.squad` is only the
 * default XI). Managers pick their starting XI from this. Falls back to the
 * default XI if the squad isn't found.
 */
function fullSquad(team: Team): Player[] {
  const wc = wcTeams.find((t) => t.country === team.name);
  if (!wc) return team.squad;
  return wc.players.map((p, i) => ({
    number: p.number ?? i + 1,
    name: p.name,
    position: p.position,
  }));
}

export interface OrchestratorOptions {
  homeId: string;
  awayId: string;
  mode: Mode;
  /** Cap match length (1–90). Useful to keep live runs short. */
  maxMinutes?: number;
  /**
   * Stable id for the fixture (e.g. the WC26 FIFA match number). Used as the
   * result key and the RNG seed. Defaults to `${homeId}-${awayId}`.
   */
  matchId?: string;
}

const TACTICS: ReadonlySet<string> = new Set([
  "attacking",
  "balanced",
  "defensive",
]);

/**
 * Run one match across FOUR independent agent sessions — two managers, the
 * play-by-play "match" agent, and the referee. Each is its own `Agent` with its
 * own byte-stable system prefix (the Reasonix multi-session pattern), so their
 * prefix caches never interfere. The match and referee sessions are append-only
 * across the whole game, so their cache hit rate climbs as the match proceeds.
 *
 * Yields a single unified event log, tagged by thread, for the UI to fan out.
 */
export async function* runMatch(
  opts: OrchestratorOptions,
): AsyncGenerator<OrchestratorEvent> {
  const home = getTeam(opts.homeId);
  const away = getTeam(opts.awayId);
  const matchId = opts.matchId ?? `${opts.homeId}-${opts.awayId}`;
  const maxMinutes = Math.min(90, Math.max(1, opts.maxMinutes ?? 90));
  const mode = opts.mode;

  if (mode === "live" && !env.DEEPSEEK_API_KEY) {
    yield {
      type: "error",
      message: "DEEPSEEK_API_KEY is not set. Switch to Mock mode to run offline.",
    };
    return;
  }

  const homeSquad = fullSquad(home);
  const awaySquad = fullSquad(away);

  // Shared mock state read by the scripted responders (ignored in live mode).
  // homeXI/awayXI default to the standard XI and are replaced once the managers
  // pick — the play logic draws scorers/keepers from whoever is on the pitch.
  const state = {
    minute: 0,
    score: { home: 0, away: 0 },
    homeTactic: "balanced" as Tactic,
    awayTactic: "balanced" as Tactic,
    redCards: { home: 0, away: 0 },
    homeXI: [...home.squad],
    awayXI: [...away.squad],
  };

  // Deterministic, independent RNG streams per role.
  const seed = hashSeed(`${matchId}:${mode}`);
  const playRng = makeRng(seed);
  const refRng = makeRng(seed ^ 0x9e3779b9);
  const homeRng = makeRng(seed ^ 0x0000abcd);
  const awayRng = makeRng(seed ^ 0xdcba0000);

  // --- agent construction -------------------------------------------------

  const buildProvider = (thread: Thread, responder: () => string): Provider =>
    mode === "mock"
      ? createScriptedProvider(thread, responder)
      : createOpenAICompatProvider({
          apiKey: env.DEEPSEEK_API_KEY ?? "",
          baseURL: env.DEEPSEEK_BASE_URL,
          model: env.DEEPSEEK_MODEL,
          name: thread,
        });

  const newAgent = (
    thread: Thread,
    systemPrompt: string,
    responder: () => string,
    temperature: number,
  ): Agent =>
    new Agent({
      provider: buildProvider(thread, responder),
      registry: new ToolRegistry([]),
      systemPrompt,
      temperature,
    });

  const homeManager = newAgent(
    "home-manager",
    managerSystem(home),
    () => JSON.stringify(decideLineup(homeSquad, homeRng)),
    0.6,
  );
  const awayManager = newAgent(
    "away-manager",
    managerSystem(away),
    () => JSON.stringify(decideLineup(awaySquad, awayRng)),
    0.6,
  );
  const matchAgent = newAgent(
    "match",
    playSystem(home, away),
    () =>
      JSON.stringify(
        decideMinute({
          rng: playRng,
          minute: state.minute,
          home,
          away,
          homeXI: state.homeXI,
          awayXI: state.awayXI,
          homeTactic: state.homeTactic,
          awayTactic: state.awayTactic,
        }),
      ),
    0.9,
  );
  const referee = newAgent(
    "referee",
    refereeSystem(),
    () =>
      JSON.stringify(
        decideReferee({
          rng: refRng,
          minute: state.minute,
          redCards: state.redCards,
        }),
      ),
    0.3,
  );

  // --- cache accounting ---------------------------------------------------

  const cacheTotals = new Map<Thread, { hit: number; prompt: number }>();
  const recordCache = (thread: Thread, usage: Usage): number => {
    const t = cacheTotals.get(thread) ?? { hit: 0, prompt: 0 };
    t.hit += usage.cacheHitTokens;
    t.prompt += usage.promptTokens;
    cacheTotals.set(thread, t);
    return t.prompt > 0 ? t.hit / t.prompt : 0;
  };

  // Drive one agent turn, surfacing deltas + cache stats and returning the text.
  async function* drive(
    agent: Agent,
    thread: Thread,
    prompt: string,
  ): AsyncGenerator<OrchestratorEvent, string> {
    let text = "";
    for await (const ev of agent.run(prompt)) {
      if (ev.type === "text") {
        text += ev.delta;
        yield { type: "agent_delta", thread, delta: ev.delta };
      } else if (ev.type === "usage") {
        const cumulativeHitRate = recordCache(thread, ev.usage);
        yield {
          type: "cache",
          thread,
          hitRate: ev.cacheHitRate,
          promptTokens: ev.usage.promptTokens,
          cumulativeHitRate,
        };
      } else if (ev.type === "error") {
        yield { type: "error", message: ev.message };
      }
    }
    return text;
  }

  // --- step 1: managers pick lineups --------------------------------------

  yield { type: "phase", phase: "lineups" };

  yield { type: "thread_start", thread: "home-manager", label: `${home.name} manager` };
  const homeLineup = parseLineup(
    yield* drive(homeManager, "home-manager", managerPrompt(home, homeSquad)),
    homeSquad,
    homeRng,
  );
  state.homeTactic = homeLineup.tactic;
  state.homeXI = homeLineup.lineup;
  yield { type: "lineup", thread: "home-manager", teamName: home.name, lineup: homeLineup };

  yield { type: "thread_start", thread: "away-manager", label: `${away.name} manager` };
  const awayLineup = parseLineup(
    yield* drive(awayManager, "away-manager", managerPrompt(away, awaySquad)),
    awaySquad,
    awayRng,
  );
  state.awayTactic = awayLineup.tactic;
  state.awayXI = awayLineup.lineup;
  yield { type: "lineup", thread: "away-manager", teamName: away.name, lineup: awayLineup };

  // --- step 2 & 3: minute-by-minute play, referee may stop ----------------

  yield { type: "thread_start", thread: "match", label: `${home.name} vs ${away.name}` };
  yield { type: "thread_start", thread: "referee", label: "Referee" };
  yield { type: "phase", phase: "kickoff" };
  yield { type: "phase", phase: "play" };

  const scorers: MatchResult["scorers"] = [];
  const cards: MatchResult["cards"] = [];
  let abandoned = false;
  let minutesPlayed = maxMinutes;

  for (let minute = 1; minute <= maxMinutes; minute++) {
    state.minute = minute;
    const outcome = parseMinute(
      yield* drive(matchAgent, "match", playPrompt(minute, state.score, home, away)),
    );

    if (outcome.side) {
      if (outcome.event === "goal") {
        state.score[outcome.side]++;
        scorers.push({ side: outcome.side, player: outcome.player ?? "Unknown", minute });
      } else if (outcome.event === "yellow") {
        cards.push({ side: outcome.side, player: outcome.player ?? "Unknown", minute, card: "yellow" });
      } else if (outcome.event === "red") {
        cards.push({ side: outcome.side, player: outcome.player ?? "Unknown", minute, card: "red" });
        state.redCards[outcome.side]++;
      }
    }

    yield { type: "minute", minute, outcome, score: { ...state.score } };

    // Referee weighs in after anything notable, and at the interval.
    const notable =
      outcome.event === "goal" ||
      outcome.event === "yellow" ||
      outcome.event === "red";
    if (notable || minute === 45) {
      const verdict = parseVerdict(
        yield* drive(referee, "referee", refereePrompt(minute, state.score, state.redCards)),
      );
      yield { type: "referee", minute, verdict };
      if (verdict.decision === "stop") {
        abandoned = true;
        minutesPlayed = minute;
        break;
      }
    }
  }

  // --- step 4: final results, stored for following matches ----------------

  const result: MatchResult = {
    matchId,
    homeId: opts.homeId,
    awayId: opts.awayId,
    homeName: home.name,
    awayName: away.name,
    score: { ...state.score },
    scorers,
    cards,
    minutesPlayed,
    abandoned,
    mode,
  };
  saveResult(result);

  yield { type: "phase", phase: abandoned ? "stopped" : "fulltime" };
  yield { type: "result", result };
}

// --- prompts ---------------------------------------------------------------

function managerSystem(team: Team): string {
  return `You are the manager of ${team.name} in a simulated football match. Make realistic selections that fit the squad. Respond with ONLY a JSON object — no prose, no code fences.`;
}

function playSystem(home: Team, away: Team): string {
  return `You are the play-by-play match engine for a simulated football match between ${home.name} and ${away.name}. Each turn you decide the outcome of exactly one minute, weighing team strength and tactics. Respond with ONLY a JSON object — no prose, no code fences.`;
}

function refereeSystem(): string {
  return `You are the referee of a simulated football match. Keep play going unless player safety or repeated dismissals force a stop. Respond with ONLY a JSON object — no prose, no code fences.`;
}

function managerPrompt(team: Team, squad: Player[]): string {
  const roster = squad.map((p) => `${p.name} (${p.position})`).join(", ");
  return `Pick your starting XI for ${team.name} from this ${squad.length}-player squad: ${roster}. Choose a formation, name exactly 11 starters that fit it (1 GK, the rest outfield), a tactic, and your key player. Reply as JSON {"formation","tactic","keyPlayer","lineup"} where tactic is "attacking" | "balanced" | "defensive" and lineup is an array of exactly 11 player names from the squad.`;
}

function playPrompt(
  minute: number,
  score: { home: number; away: number },
  home: Team,
  away: Team,
): string {
  return `Minute ${minute}. Score: ${home.name} ${score.home}-${score.away} ${away.name}. Decide this minute. Reply as JSON {"event","side","player","text"} where event is one of "none" | "goal" | "save" | "miss" | "foul" | "yellow" | "red", and side is "home" | "away" | null.`;
}

function refereePrompt(
  minute: number,
  score: { home: number; away: number },
  reds: { home: number; away: number },
): string {
  return `Minute ${minute}. Score ${score.home}-${score.away}. Red cards — home: ${reds.home}, away: ${reds.away}. Decide. Reply as JSON {"decision","reason"} where decision is "continue" | "stop".`;
}

// --- tolerant JSON parsing (with dummy fallbacks for live mode) -------------

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
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
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

function parseLineup(text: string, squad: Player[], rng: () => number): Lineup {
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

/** "4-3-3"-style summary of an XI's outfield shape. */
function formationOf(xi: Player[]): string {
  const n = (pos: Player["position"]) => xi.filter((p) => p.position === pos).length;
  return `${n("DF")}-${n("MF")}-${n("FW")}`;
}

const MINUTE_EVENTS: ReadonlySet<string> = new Set([
  "none",
  "goal",
  "save",
  "miss",
  "foul",
  "yellow",
  "red",
]);

function parseMinute(text: string): MinuteOutcome {
  const obj = asRecord(extractJSON(text));
  const event = str(obj?.event);
  if (obj && event && MINUTE_EVENTS.has(event)) {
    const side = str(obj.side);
    return {
      event: event as MinuteOutcome["event"],
      side: side === "home" || side === "away" ? side : null,
      player: str(obj.player),
      text: str(obj.text) ?? "",
    };
  }
  return { event: "none", side: null, player: null, text: "" };
}

function parseVerdict(text: string): RefereeVerdict {
  const obj = asRecord(extractJSON(text));
  const decision = str(obj?.decision);
  if (decision === "stop") {
    return { decision: "stop", reason: str(obj?.reason) ?? "Match stopped by the referee." };
  }
  return { decision: "continue", reason: str(obj?.reason) ?? "Play continues." };
}
