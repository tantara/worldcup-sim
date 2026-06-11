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
  AssistantSummary,
  GameSpeed,
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
import {
  parseLineup,
  parseManagerUpdate,
  type ManagerPlanContext,
} from "./manager-update";
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
  gameSpeed?: GameSpeed;
  homeLineup?: Lineup;
  awayLineup?: Lineup;
  managerContext?: string;
  /** Ask managers for formation/strategy/player changes every N minutes. */
  managerIntervalMinutes?: number;
  /** Cap match length (1–90). Useful to keep live runs short. */
  maxMinutes?: number;
  /**
   * Stable id for the fixture (e.g. the WC26 FIFA match number). Used as the
   * result key and the RNG seed. Defaults to `${homeId}-${awayId}`.
   */
  matchId?: string;
}

export interface LineupOptions {
  teamId: string;
  side: "home" | "away";
  mode: Mode;
  matchId?: string;
  managerContext?: string;
}

const DEFAULT_MANAGER_INTERVAL_MINUTES = 5;
const DEFAULT_GAME_SPEED: GameSpeed = "normal";
const GAME_SPEED_CONFIG: Record<
  GameSpeed,
  { minuteStep: number; matchReasoning: boolean }
> = {
  slow: { minuteStep: 1, matchReasoning: true },
  normal: { minuteStep: 1, matchReasoning: false },
  fast: { minuteStep: 3, matchReasoning: false },
};

function playMinutes(maxMinutes: number, minuteStep: number): number[] {
  const minutes: number[] = [];
  for (let minute = minuteStep; minute <= maxMinutes; minute += minuteStep) {
    minutes.push(minute);
  }
  if (minutes.at(-1) !== maxMinutes) minutes.push(maxMinutes);
  return minutes;
}

/**
 * Run one match under one main match agent. The main agent owns game flow and
 * delegates to long-lived manager/referee agents when the match state calls for
 * it. Each role is its own append-only `Agent` with a byte-stable system prefix,
 * so DeepSeek can reuse the largest possible KV-cache prefix on every turn.
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
  const gameSpeed = opts.gameSpeed ?? DEFAULT_GAME_SPEED;
  const speedConfig = GAME_SPEED_CONFIG[gameSpeed];
  const managerInterval = Math.min(
    90,
    Math.max(
      1,
      opts.managerIntervalMinutes ?? DEFAULT_MANAGER_INTERVAL_MINUTES,
    ),
  );
  const mode = opts.mode;

  if (mode === "live" && !env.DEEPSEEK_API_KEY) {
    yield {
      type: "error",
      message:
        "DEEPSEEK_API_KEY is not set. Switch to Mock mode to run offline.",
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
    homeFormation: "4-3-3",
    awayFormation: "4-3-3",
    homeKeyPlayer: home.squad[0]?.name ?? home.name,
    awayKeyPlayer: away.squad[0]?.name ?? away.name,
    homeStrategy: "Start balanced and read the match.",
    awayStrategy: "Start balanced and read the match.",
    redCards: { home: 0, away: 0 },
    homeXI: [...home.squad],
    awayXI: [...away.squad],
  };
  let homeLineupKnown = false;
  let awayLineupKnown = false;

  // Deterministic, independent RNG streams per role.
  const seed = hashSeed(`${matchId}:${mode}:${gameSpeed}`);
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
          extraBody:
            thread === "match"
              ? {
                  thinking: {
                    type: speedConfig.matchReasoning ? "enabled" : "disabled",
                  },
                }
              : undefined,
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
    mainAgentSystem(home, away),
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
  const assistantLabels: Record<Thread, string> = {
    match: "Match assistant",
    "home-manager": `${home.name} manager assistant`,
    "away-manager": `${away.name} manager assistant`,
    referee: "Referee assistant",
  };
  const assistantTotals = new Map<Thread, AssistantSummary>();
  const assistantSummary = (thread: Thread): AssistantSummary => {
    const existing = assistantTotals.get(thread);
    if (existing) return existing;
    const created: AssistantSummary = {
      thread,
      label: assistantLabels[thread],
      turns: 0,
      promptTokens: 0,
      completionTokens: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0,
      reasoningTokens: 0,
      cumulativeCacheHitRate: 0,
      totalLatencyMs: 0,
    };
    assistantTotals.set(thread, created);
    return created;
  };
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
    const startedAt = Date.now();
    assistantSummary(thread).turns++;
    yield { type: "agent_prompt", thread, prompt };
    for await (const ev of agent.run(prompt)) {
      if (ev.type === "text") {
        text += ev.delta;
        yield { type: "agent_delta", thread, delta: ev.delta };
      } else if (ev.type === "usage") {
        const cumulativeHitRate = recordCache(thread, ev.usage);
        const summary = assistantSummary(thread);
        summary.promptTokens += ev.usage.promptTokens;
        summary.completionTokens += ev.usage.completionTokens;
        summary.cacheHitTokens += ev.usage.cacheHitTokens;
        summary.cacheMissTokens += ev.usage.cacheMissTokens;
        summary.reasoningTokens += ev.usage.reasoningTokens;
        summary.cumulativeCacheHitRate = cumulativeHitRate;
        summary.totalLatencyMs += Date.now() - startedAt;
        yield {
          type: "cache",
          thread,
          hitRate: ev.cacheHitRate,
          promptTokens: ev.usage.promptTokens,
          cumulativeHitRate,
          completionTokens: ev.usage.completionTokens,
          cacheHitTokens: ev.usage.cacheHitTokens,
          cacheMissTokens: ev.usage.cacheMissTokens,
          reasoningTokens: ev.usage.reasoningTokens,
          latencyMs: Date.now() - startedAt,
        };
      } else if (ev.type === "error") {
        yield { type: "error", message: ev.message };
      }
    }
    return text;
  }

  const applyLineup = (side: "home" | "away", lineup: Lineup) => {
    const xi = lineup.lineup.map((p) => ({
      number: p.number,
      name: p.name,
      position: p.position,
    }));
    if (side === "home") {
      state.homeTactic = lineup.tactic;
      state.homeFormation = lineup.formation;
      state.homeKeyPlayer = lineup.keyPlayer;
      state.homeStrategy = lineup.strategy ?? state.homeStrategy;
      state.homeXI = xi;
      homeLineupKnown = true;
    } else {
      state.awayTactic = lineup.tactic;
      state.awayFormation = lineup.formation;
      state.awayKeyPlayer = lineup.keyPlayer;
      state.awayStrategy = lineup.strategy ?? state.awayStrategy;
      state.awayXI = xi;
      awayLineupKnown = true;
    }
  };

  if (opts.homeLineup) applyLineup("home", opts.homeLineup);
  if (opts.awayLineup) applyLineup("away", opts.awayLineup);

  async function* askManager(
    side: "home" | "away",
    reason: "initial_lineup" | "scheduled_update",
    minute: number,
  ): AsyncGenerator<OrchestratorEvent, Lineup> {
    const isHome = side === "home";
    const thread: Thread = isHome ? "home-manager" : "away-manager";
    const manager = isHome ? homeManager : awayManager;
    const team = isHome ? home : away;
    const opponent = isHome ? away : home;
    const squad = isHome ? homeSquad : awaySquad;
    const opponentSquad = isHome ? awaySquad : homeSquad;
    const rng = isHome ? homeRng : awayRng;
    const opponentState = isHome
      ? {
          formation: state.awayFormation,
          tactic: state.awayTactic,
          keyPlayer: state.awayKeyPlayer,
          strategy: state.awayStrategy,
          lineup: state.awayXI,
          known: awayLineupKnown,
        }
      : {
          formation: state.homeFormation,
          tactic: state.homeTactic,
          keyPlayer: state.homeKeyPlayer,
          strategy: state.homeStrategy,
          lineup: state.homeXI,
          known: homeLineupKnown,
        };
    const current = isHome
      ? {
          formation: state.homeFormation,
          tactic: state.homeTactic,
          keyPlayer: state.homeKeyPlayer,
          strategy: state.homeStrategy,
          lineup: state.homeXI,
        }
      : {
          formation: state.awayFormation,
          tactic: state.awayTactic,
          keyPlayer: state.awayKeyPlayer,
          strategy: state.awayStrategy,
          lineup: state.awayXI,
        };

    const prompt =
      reason === "initial_lineup"
        ? managerLineupPrompt({
            team,
            squad,
            opponent,
            opponentSquad,
            opponentPlan: opponentState.known ? opponentState : undefined,
            context: opts.managerContext,
          })
        : managerAdjustmentPrompt({
            team,
            squad,
            minute,
            score: state.score,
            current,
            opponent,
            opponentSquad,
            opponentPlan: opponentState.known ? opponentState : undefined,
          });
    const response = yield* drive(manager, thread, prompt);
    const lineup =
      reason === "scheduled_update"
        ? parseManagerUpdate(response, squad, rng, current)
        : parseLineup(response, squad, rng);
    const enriched =
      reason === "scheduled_update"
        ? withSubstitutionSummary(current.lineup, lineup)
        : lineup;
    applyLineup(side, enriched);
    return enriched;
  }

  // --- step 1: main agent opens the match and delegates initial lineups ----

  yield { type: "phase", phase: "lineups" };
  yield {
    type: "thread_start",
    thread: "match",
    label: `${home.name} vs ${away.name}`,
  };
  yield* drive(
    matchAgent,
    "match",
    mainOpeningPrompt(home, away, opts.managerContext, managerInterval),
  );

  yield {
    type: "thread_start",
    thread: "home-manager",
    label: `${home.name} manager`,
  };
  const homeLineup =
    opts.homeLineup ?? (yield* askManager("home", "initial_lineup", 0));
  if (!opts.homeLineup) applyLineup("home", homeLineup);
  yield {
    type: "lineup",
    thread: "home-manager",
    teamName: home.name,
    lineup: homeLineup,
  };

  yield {
    type: "thread_start",
    thread: "away-manager",
    label: `${away.name} manager`,
  };
  const awayLineup =
    opts.awayLineup ?? (yield* askManager("away", "initial_lineup", 0));
  if (!opts.awayLineup) applyLineup("away", awayLineup);
  yield {
    type: "lineup",
    thread: "away-manager",
    teamName: away.name,
    lineup: awayLineup,
  };

  // --- step 2 & 3: main agent runs play and delegates at event boundaries ---

  yield { type: "thread_start", thread: "referee", label: "Referee" };
  yield { type: "phase", phase: "kickoff" };
  yield { type: "phase", phase: "play" };

  const scorers: MatchResult["scorers"] = [];
  const cards: MatchResult["cards"] = [];
  let abandoned = false;
  let minutesPlayed = maxMinutes;

  for (const minute of playMinutes(maxMinutes, speedConfig.minuteStep)) {
    state.minute = minute;
    if (minute > 1 && (minute - 1) % managerInterval === 0) {
      const homeUpdate: Lineup = yield* askManager(
        "home",
        "scheduled_update",
        minute,
      );
      yield {
        type: "lineup",
        thread: "home-manager",
        teamName: home.name,
        lineup: homeUpdate,
      };
      const awayUpdate: Lineup = yield* askManager(
        "away",
        "scheduled_update",
        minute,
      );
      yield {
        type: "lineup",
        thread: "away-manager",
        teamName: away.name,
        lineup: awayUpdate,
      };
    }

    const minuteText: string = yield* drive(
      matchAgent,
      "match",
      mainMinutePrompt({
        minute,
        minuteStep: speedConfig.minuteStep,
        score: state.score,
        home,
        away,
        homeFormation: state.homeFormation,
        awayFormation: state.awayFormation,
        homeTactic: state.homeTactic,
        awayTactic: state.awayTactic,
        homeStrategy: state.homeStrategy,
        awayStrategy: state.awayStrategy,
      }),
    );
    const outcome: MinuteOutcome = parseMinute(minuteText);

    if (outcome.side) {
      if (outcome.event === "goal") {
        state.score[outcome.side]++;
        scorers.push({
          side: outcome.side,
          player: outcome.player ?? "Unknown",
          minute,
          assist: outcome.assist ?? null,
        });
      } else if (outcome.event === "yellow") {
        cards.push({
          side: outcome.side,
          player: outcome.player ?? "Unknown",
          minute,
          card: "yellow",
        });
      } else if (outcome.event === "red") {
        cards.push({
          side: outcome.side,
          player: outcome.player ?? "Unknown",
          minute,
          card: "red",
        });
        state.redCards[outcome.side]++;
      }
    }

    yield { type: "minute", minute, outcome, score: { ...state.score } };

    // The main agent delegates referee review after notable match events.
    const notable =
      outcome.event === "goal" ||
      outcome.event === "foul" ||
      outcome.event === "yellow" ||
      outcome.event === "red";
    if (notable) {
      const verdictText: string = yield* drive(
        referee,
        "referee",
        refereePrompt(minute, state.score, state.redCards, outcome),
      );
      const verdict: RefereeVerdict = parseVerdict(verdictText);
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
    assistants: [...assistantTotals.values()].filter(
      (assistant) => assistant.turns > 0,
    ),
  };
  saveResult(result);

  yield { type: "phase", phase: abandoned ? "stopped" : "fulltime" };
  yield { type: "result", result };
}

export async function* runLineup(
  opts: LineupOptions,
): AsyncGenerator<OrchestratorEvent> {
  const team = getTeam(opts.teamId);
  const mode = opts.mode;
  const thread: Thread = opts.side === "home" ? "home-manager" : "away-manager";

  if (mode === "live" && !env.DEEPSEEK_API_KEY) {
    yield {
      type: "error",
      message:
        "DEEPSEEK_API_KEY is not set. Switch to Mock mode to run offline.",
    };
    return;
  }

  const squad = fullSquad(team);
  const seed = hashSeed(
    `${opts.matchId ?? opts.teamId}:${mode}:${thread}:lineup`,
  );
  const rng = makeRng(seed);
  const provider =
    mode === "mock"
      ? createScriptedProvider(thread, () =>
          JSON.stringify(decideLineup(squad, rng)),
        )
      : createOpenAICompatProvider({
          apiKey: env.DEEPSEEK_API_KEY ?? "",
          baseURL: env.DEEPSEEK_BASE_URL,
          model: env.DEEPSEEK_MODEL,
          name: thread,
        });
  const manager = new Agent({
    provider,
    registry: new ToolRegistry([]),
    systemPrompt: managerSystem(team),
    temperature: 0.6,
  });

  let cacheHit = 0;
  let promptTokens = 0;
  let text = "";

  yield { type: "phase", phase: "lineups" };
  yield { type: "thread_start", thread, label: `${team.name} manager` };
  const prompt = managerPrompt(team, squad, opts.managerContext);
  yield { type: "agent_prompt", thread, prompt };

  const startedAt = Date.now();
  for await (const ev of manager.run(prompt)) {
    if (ev.type === "text") {
      text += ev.delta;
      yield { type: "agent_delta", thread, delta: ev.delta };
    } else if (ev.type === "usage") {
      cacheHit += ev.usage.cacheHitTokens;
      promptTokens += ev.usage.promptTokens;
      yield {
        type: "cache",
        thread,
        hitRate: ev.cacheHitRate,
        promptTokens: ev.usage.promptTokens,
        cumulativeHitRate: promptTokens > 0 ? cacheHit / promptTokens : 0,
        completionTokens: ev.usage.completionTokens,
        cacheHitTokens: ev.usage.cacheHitTokens,
        cacheMissTokens: ev.usage.cacheMissTokens,
        reasoningTokens: ev.usage.reasoningTokens,
        latencyMs: Date.now() - startedAt,
      };
    } else if (ev.type === "error") {
      yield { type: "error", message: ev.message };
    }
  }

  const lineup = parseLineup(text, squad, rng);
  yield { type: "lineup", thread, teamName: team.name, lineup };
}

// --- prompts ---------------------------------------------------------------

function managerSystem(team: Team): string {
  return `You are the manager of ${team.name} in a simulated football match. You keep one append-only match thread: first choose the starting XI, then revisit formation, tactical detail, and player changes whenever the main match agent delegates a scheduled update. Make realistic decisions from the squad, score, match context, fatigue proxy, and opponent state. Always include a top-level "reason" explaining why you made the decision. Respond with ONLY a JSON object — no prose, no code fences.`;
}

function mainAgentSystem(home: Team, away: Team): string {
  return `You are the main game-play agent for a simulated football match between ${home.name} and ${away.name}. You are responsible for the whole match flow: open the game, delegate lineup and scheduled tactical updates to manager agents, decide each minute of play, and delegate referee checks after notable events such as goals, fouls, bookings, or red cards. Your conversation is append-only to maximize DeepSeek KV-cache hits. When asked for a minute result, respond with ONLY a JSON object — no prose, no code fences.`;
}

function refereeSystem(): string {
  return `You are the referee of a simulated football match. You are triggered by the main match agent after notable events. Review the specific event, score, and dismissals, then keep play going unless player safety, abandonment rules, or repeated dismissals force a stop. Always include a top-level "reason" explaining why play continues or stops. Respond with ONLY a JSON object — no prose, no code fences.`;
}

function managerPrompt(team: Team, squad: Player[], context?: string): string {
  return managerLineupPrompt({ team, squad, context });
}

function managerLineupPrompt(opts: {
  team: Team,
  squad: Player[],
  opponent?: Team,
  opponentSquad?: Player[],
  opponentPlan?: ManagerPlanContext,
  context?: string,
}): string {
  const roster = formatRoster(opts.squad);
  const opponentContext =
    opts.opponent && opts.opponentSquad
      ? `\n\nOpponent squad information for ${opts.opponent.name}: ${formatRoster(
          opts.opponentSquad,
        )}.${opts.opponentPlan ? `\nKnown opponent lineup and plan: ${formatManagerPlan(opts.opponentPlan)}.` : ""}`
      : "";
  const matchContext = opts.context
    ? `\n\nMatch context to account for when choosing formation, risk level, rotations, and key player:\n${opts.context}`
    : "";
  return `The main match agent delegates the initial lineup decision to you.\n\nPick your starting XI for ${opts.team.name} from this ${opts.squad.length}-player squad: ${roster}.${opponentContext}${matchContext}\n\nChoose a formation, name exactly 11 starters that fit it (1 GK, the rest outfield), a tactic, your key player, one decision reason, and one detailed strategy sentence. Reply as JSON {"reason","formation","tactic","keyPlayer","strategy","lineup"} where reason is the first property and explains why you made the decision, tactic is "attacking" | "balanced" | "defensive", and lineup is an array of exactly 11 player names from the squad.`;
}

function managerAdjustmentPrompt(opts: {
  team: Team;
  opponent: Team;
  squad: Player[];
  opponentSquad: Player[];
  opponentPlan?: ManagerPlanContext;
  minute: number;
  score: { home: number; away: number };
  current: ManagerPlanContext;
}): string {
  const roster = formatRoster(opts.squad);
  const opponentRoster = formatRoster(opts.opponentSquad);
  const currentPlan = formatManagerPlan(opts.current);
  const opponentPlan = opts.opponentPlan
    ? `\nKnown opponent lineup and plan: ${formatManagerPlan(opts.opponentPlan)}.`
    : "";
  return `The main match agent delegates your scheduled in-match manager update.\n\nMinute ${opts.minute}. Score: home ${opts.score.home}-${opts.score.away} away. Opponent: ${opts.opponent.name}.\nCurrent plan and XI: ${currentPlan}.\nAvailable squad: ${roster}.\nOpponent squad information for ${opts.opponent.name}: ${opponentRoster}.${opponentPlan}\n\nReassess formation, tactic, detailed strategy, key player, and player changes. If you would keep everything unchanged, reply with only JSON {"reason":"...","changes":false}; do not repeat formation, tactic, keyPlayer, strategy, substitutions, or lineup. If you change anything, reply as JSON {"reason","changes":true,"formation","tactic","keyPlayer","strategy","substitutions","lineup"} where reason is the first property and explains why you made the update, substitutions is an array of {"off","on","reason"}, and lineup is the current on-pitch XI after changes.`;
}

function formatRoster(players: Player[]): string {
  return players.map((p) => `${p.name} (${p.position})`).join(", ");
}

function formatManagerPlan(plan: ManagerPlanContext): string {
  return `${plan.formation}, ${plan.tactic}, key player ${plan.keyPlayer}, ${plan.strategy}; XI: ${plan.lineup
    .map((p) => `${p.name} (${p.position})`)
    .join(", ")}`;
}

function mainOpeningPrompt(
  home: Team,
  away: Team,
  context: string | undefined,
  managerInterval: number,
): string {
  const matchContext = context ? `\n\nMatch context:\n${context}` : "";
  return `Open the match orchestration for ${home.name} vs ${away.name}. You are responsible for game play and will delegate initial lineup selection and scheduled manager updates every ${managerInterval} minutes. Referee review is delegated only after notable events. Acknowledge the operating plan as JSON {"event":"none","side":null,"player":null,"text":"..."}.${matchContext}`;
}

function mainMinutePrompt(opts: {
  minute: number;
  minuteStep: number;
  score: { home: number; away: number };
  home: Team;
  away: Team;
  homeFormation: string;
  awayFormation: string;
  homeTactic: Tactic;
  awayTactic: Tactic;
  homeStrategy: string;
  awayStrategy: string;
}): string {
  const window =
    opts.minuteStep === 1
      ? `Minute ${opts.minute}`
      : `Minutes ${Math.max(1, opts.minute - opts.minuteStep + 1)}-${opts.minute}`;
  const instruction =
    opts.minuteStep === 1
      ? "Decide exactly this minute of play."
      : "Decide the main visible event for this match window.";
  return `${window}. Score: ${opts.home.name} ${opts.score.home}-${opts.score.away} ${opts.away.name}. Current manager plans — ${opts.home.name}: ${opts.homeFormation}, ${opts.homeTactic}, ${opts.homeStrategy}. ${opts.away.name}: ${opts.awayFormation}, ${opts.awayTactic}, ${opts.awayStrategy}. ${instruction} Reply as JSON {"event","side","player","assist","text"} where event is one of "none" | "goal" | "save" | "miss" | "foul" | "yellow" | "red", side is "home" | "away" | null, and assist is the assisting player name for goals or null.`;
}

function refereePrompt(
  minute: number,
  score: { home: number; away: number },
  reds: { home: number; away: number },
  outcome: MinuteOutcome,
): string {
  return `The main match agent delegates a referee review after this event. Minute ${minute}. Event: ${outcome.event}; side: ${outcome.side ?? "none"}; player: ${outcome.player ?? "none"}; description: ${outcome.text || "none"}. Score ${score.home}-${score.away}. Red cards — home: ${reds.home}, away: ${reds.away}. Decide whether play continues. Reply as JSON {"decision","reason"} where decision is "continue" | "stop" and reason explains why.`;
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
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function withSubstitutionSummary(previousXI: Player[], next: Lineup): Lineup {
  if (next.substitutions && next.substitutions.length > 0) return next;
  const previous = new Set(previousXI.map((p) => p.name));
  const nextNames = new Set(next.lineup.map((p) => p.name));
  const off = previousXI.filter((p) => !nextNames.has(p.name));
  const on = next.lineup.filter((p) => !previous.has(p.name));
  const substitutions = off.slice(0, on.length).map((player, index) => ({
    off: player.name,
    on: on[index]!.name,
    reason: "Scheduled manager adjustment.",
  }));
  return substitutions.length > 0 ? { ...next, substitutions } : next;
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
      assist: str(obj.assist) ?? str(obj.assistant),
      text: str(obj.text) ?? "",
    };
  }
  return { event: "none", side: null, player: null, text: "" };
}

function parseVerdict(text: string): RefereeVerdict {
  const obj = asRecord(extractJSON(text));
  const decision = str(obj?.decision);
  if (decision === "stop") {
    return {
      decision: "stop",
      reason: str(obj?.reason) ?? "Match stopped by the referee.",
    };
  }
  return {
    decision: "continue",
    reason: str(obj?.reason) ?? "Play continues.",
  };
}
