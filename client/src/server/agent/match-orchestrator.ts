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
  OfficiatingStrictness,
  OrchestratorEvent,
  RefereeVerdict,
  Tactic,
  TacticalKnobs,
  Thread,
} from "~/lib/simulator-types";
import { fullSquad, getTeam, type Player, type Team } from "~/lib/teams";
import {
  decideLineup,
  decideMinute,
  decideReferee,
  hashSeed,
  makeRng,
  pickStrictness,
} from "./dummy";
import {
  FATIGUE_HINT_THRESHOLD,
  freshFatigue,
  freshMomentum,
  knobsForTactic,
  MOMENTUM_HINT_THRESHOLD,
  updateFatigue,
  updateMomentum,
  type SideState,
} from "./match-dynamics";
import {
  parseLineup,
  parseManagerUpdate,
  type ManagerPlanContext,
} from "./manager-update";
import { saveResult } from "./results-store";

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
  /**
   * Stable per-session id used as the provider `user_id` base (one key per agent
   * thread → `${sessionId}:${thread}`), pinning each thread to one DeepSeek
   * KVCache partition. Distinct from `matchId` (which also seeds the RNG): real
   * fixtures pass their match id here; the free simulator passes a generated
   * uuid so each session gets its own cache partition. Defaults to `matchId`.
   */
  sessionId?: string;
  /** Aborts in-flight model calls (e.g. when the client disconnects). */
  signal?: AbortSignal;
}

export interface LineupOptions {
  teamId: string;
  side: "home" | "away";
  mode: Mode;
  matchId?: string;
  /** Provider `user_id` base for the manager thread. See {@link OrchestratorOptions.sessionId}. */
  sessionId?: string;
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
  const sessionId = opts.sessionId ?? matchId;
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
    homeKnobs: knobsForTactic("balanced"),
    awayKnobs: knobsForTactic("balanced"),
    redCards: { home: 0, away: 0 },
    homeXI: [...home.squad],
    awayXI: [...away.squad],
    // Forward-fed dynamics (see match-dynamics): running momentum, stamina, and
    // the referee's officiating style.
    momentum: freshMomentum(),
    fatigue: freshFatigue(),
    refStrictness: "normal" as OfficiatingStrictness,
  };
  let homeLineupKnown = false;
  let awayLineupKnown = false;

  // Deterministic, independent RNG streams per role.
  const seed = hashSeed(`${matchId}:${mode}:${gameSpeed}`);
  const playRng = makeRng(seed);
  const refRng = makeRng(seed ^ 0x9e3779b9);
  const homeRng = makeRng(seed ^ 0x0000abcd);
  const awayRng = makeRng(seed ^ 0xdcba0000);

  // Mock mode gets a stable per-match officiating style so "strict ref → more
  // cards" holds across the game; live mode lets the referee agent set it.
  const mockRefStrictness = pickStrictness(makeRng(seed ^ 0x5a5a5a5a));
  if (mode === "mock") state.refStrictness = mockRefStrictness;

  const buildProvider = (thread: Thread, responder: () => string): Provider =>
    mode === "mock"
      ? createScriptedProvider(thread, responder)
      : createOpenAICompatProvider({
          apiKey: env.DEEPSEEK_API_KEY ?? "",
          baseURL: env.DEEPSEEK_BASE_URL,
          model: env.DEEPSEEK_MODEL,
          name: thread,
          // One stable KVCache partition per agent thread for this session.
          userId: `${sessionId}:${thread}`,
          // The match agent may reason (slow mode); managers and the referee
          // only emit JSON, so keep thinking off for them. Leaving it unset lets
          // the model default to thinking, which burns their small token budget
          // on reasoning_content and streams no answer text — surfacing in the
          // UI as a perpetual "Waiting for response...".
          extraBody: {
            thinking: {
              type:
                thread === "match" && speedConfig.matchReasoning
                  ? "enabled"
                  : "disabled",
            },
          },
        });

  const newAgent = (
    thread: Thread,
    systemPrompt: string,
    responder: () => string,
    temperature: number,
    maxTokens: number,
  ): Agent =>
    new Agent({
      provider: buildProvider(thread, responder),
      registry: new ToolRegistry([]),
      systemPrompt,
      temperature,
      maxTokens,
    });

  const homeManager = newAgent(
    "home-manager",
    managerSystem(home, homeSquad, away, awaySquad),
    () => JSON.stringify(decideLineup(homeSquad, homeRng)),
    0.6,
    700,
  );
  const awayManager = newAgent(
    "away-manager",
    managerSystem(away, awaySquad, home, homeSquad),
    () => JSON.stringify(decideLineup(awaySquad, awayRng)),
    0.6,
    700,
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
          modifiers: {
            homeKnobs: state.homeKnobs,
            awayKnobs: state.awayKnobs,
            momentum: state.momentum,
            fatigue: state.fatigue,
            refStrictness: state.refStrictness,
          },
        }),
      ),
    // Event selection wants plausibility over variance; 0.9 over-produced
    // goals and cards. Reasoning (slow mode) needs headroom beyond the JSON.
    0.7,
    speedConfig.matchReasoning ? 2048 : 256,
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
          strictness: mockRefStrictness,
        }),
      ),
    0.3,
    160,
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
    for await (const ev of agent.run(prompt, { signal: opts.signal })) {
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
    // One consolidated content frame per turn — this is what is persisted
    // (the deltas above are live-only).
    yield { type: "agent_content", thread, content: text };
    return text;
  }

  const applyLineup = (side: "home" | "away", lineup: Lineup) => {
    // The lineup only carries name/number/position; recover each player's
    // derived rating from the full squad so the match agent can reason about
    // player quality. Fall back to the team rating for anyone not matched.
    const squad = side === "home" ? homeSquad : awaySquad;
    const fallback = side === "home" ? home.rating : away.rating;
    const ratingOf = (name: string) =>
      squad.find((p) => p.name === name)?.rating ?? fallback;
    const xi: Player[] = lineup.lineup.map((p) => ({
      number: p.number,
      name: p.name,
      position: p.position,
      rating: ratingOf(p.name),
    }));
    // Use the manager's structured knobs when given, else derive them from the
    // chosen tactic so the channel always carries signal.
    const knobs = lineup.knobs ?? knobsForTactic(lineup.tactic);
    if (side === "home") {
      state.homeTactic = lineup.tactic;
      state.homeFormation = lineup.formation;
      state.homeKeyPlayer = lineup.keyPlayer;
      state.homeStrategy = lineup.strategy ?? state.homeStrategy;
      state.homeKnobs = knobs;
      state.homeXI = xi;
      homeLineupKnown = true;
    } else {
      state.awayTactic = lineup.tactic;
      state.awayFormation = lineup.formation;
      state.awayKeyPlayer = lineup.keyPlayer;
      state.awayStrategy = lineup.strategy ?? state.awayStrategy;
      state.awayKnobs = knobs;
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
    const squad = isHome ? homeSquad : awaySquad;
    const rng = isHome ? homeRng : awayRng;
    const opponentState = isHome
      ? {
          formation: state.awayFormation,
          tactic: state.awayTactic,
          keyPlayer: state.awayKeyPlayer,
          strategy: state.awayStrategy,
          knobs: state.awayKnobs,
          lineup: state.awayXI,
          known: awayLineupKnown,
        }
      : {
          formation: state.homeFormation,
          tactic: state.homeTactic,
          keyPlayer: state.homeKeyPlayer,
          strategy: state.homeStrategy,
          knobs: state.homeKnobs,
          lineup: state.homeXI,
          known: homeLineupKnown,
        };
    const current = isHome
      ? {
          formation: state.homeFormation,
          tactic: state.homeTactic,
          keyPlayer: state.homeKeyPlayer,
          strategy: state.homeStrategy,
          knobs: state.homeKnobs,
          lineup: state.homeXI,
        }
      : {
          formation: state.awayFormation,
          tactic: state.awayTactic,
          keyPlayer: state.awayKeyPlayer,
          strategy: state.awayStrategy,
          knobs: state.awayKnobs,
          lineup: state.awayXI,
        };

    const prompt =
      reason === "initial_lineup"
        ? managerLineupPrompt({
            opponentPlan: opponentState.known ? opponentState : undefined,
            context: opts.managerContext,
          })
        : managerAdjustmentPrompt({
            minute,
            score: state.score,
            current,
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
  // Players carrying a booking — the match agent needs these to escalate a
  // second yellow to a red and avoid re-involving a sent-off player.
  const booked = { home: new Set<string>(), away: new Set<string>() };
  // Re-state the on-pitch XIs in the minute prompt only when they change, so
  // the (append-only) match thread stays grounded without paying the tokens
  // every minute. Empty until the first minute prints them.
  let lastLineupSig = "";
  let abandoned = false;
  let minutesPlayed = maxMinutes;
  // Substitutions made since the last fatigue update — fresh legs refresh stamina.
  let pendingSubs = { home: 0, away: 0 };

  for (const minute of playMinutes(maxMinutes, speedConfig.minuteStep)) {
    state.minute = minute;
    const lineupSig = lineupSignature(state.homeXI, state.awayXI);
    const includeLineups = lineupSig !== lastLineupSig;
    lastLineupSig = lineupSig;
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
      pendingSubs.home += homeUpdate.substitutions?.length ?? 0;
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
      pendingSubs.away += awayUpdate.substitutions?.length ?? 0;
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
        homeXI: state.homeXI,
        awayXI: state.awayXI,
        homeKnobs: state.homeKnobs,
        awayKnobs: state.awayKnobs,
        momentum: state.momentum,
        fatigue: state.fatigue,
        refStrictness: state.refStrictness,
        includeLineups,
        bookedHome: [...booked.home],
        bookedAway: [...booked.away],
        redCards: state.redCards,
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
        booked[outcome.side].add(outcome.player ?? "Unknown");
      } else if (outcome.event === "red") {
        cards.push({
          side: outcome.side,
          player: outcome.player ?? "Unknown",
          minute,
          card: "red",
        });
        booked[outcome.side].add(outcome.player ?? "Unknown");
        state.redCards[outcome.side]++;
      }
    }

    yield { type: "minute", minute, outcome, score: { ...state.score } };

    // Advance forward-fed dynamics so the next minute conditions on them:
    // momentum from this outcome, fatigue from minutes elapsed + any subs made.
    state.momentum = updateMomentum(state.momentum, outcome);
    state.fatigue = updateFatigue(state.fatigue, {
      minuteStep: speedConfig.minuteStep,
      homeKnobs: state.homeKnobs,
      awayKnobs: state.awayKnobs,
      subs: pendingSubs,
    });
    pendingSubs = { home: 0, away: 0 };

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
      // Carry the referee's officiating style forward into later minutes.
      if (verdict.strictness) state.refStrictness = verdict.strictness;
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
          // One stable KVCache partition for this manager thread + session.
          userId: `${opts.sessionId ?? opts.matchId ?? opts.teamId}:${thread}`,
          // The manager only emits JSON — disable thinking so the answer streams
          // as text instead of being lost as reasoning_content (see runMatch).
          extraBody: { thinking: { type: "disabled" } },
        });
  const manager = new Agent({
    provider,
    registry: new ToolRegistry([]),
    systemPrompt: managerSystem(team, squad),
    temperature: 0.6,
  });

  let cacheHit = 0;
  let promptTokens = 0;
  let text = "";

  yield { type: "phase", phase: "lineups" };
  yield { type: "thread_start", thread, label: `${team.name} manager` };
  const prompt = managerPrompt(opts.managerContext);
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
  yield { type: "agent_content", thread, content: text };

  const lineup = parseLineup(text, squad, rng);
  yield { type: "lineup", thread, teamName: team.name, lineup };
}

// --- prompts ---------------------------------------------------------------

function managerSystem(
  team: Team,
  squad: Player[],
  opponent?: Team,
  opponentSquad?: Player[],
): string {
  // The rosters and the reply protocol are static for the whole match, so they
  // live here in the cached system prefix (sent once) instead of being repeated
  // in every scheduled-update turn. Each user turn then carries only the
  // volatile match state — minute, score, current plan, opponent's shape.
  const opponentBlock =
    opponent && opponentSquad
      ? `\n\nYou are facing ${opponent.name}. Their ${opponentSquad.length}-player squad: ${formatRoster(opponentSquad)}.`
      : "";
  // Qualification campaigns are fixed for the whole match, so they ride the
  // cached prefix too. Omitted for hosts that auto-qualified (no campaign).
  const formLines: string[] = [];
  if (team.qualification) {
    formLines.push(
      `Your World Cup qualification campaign: ${formatQualification(team.qualification)}.`,
    );
  }
  if (opponent?.qualification) {
    formLines.push(
      `${opponent.name}'s qualification campaign: ${formatQualification(opponent.qualification)}.`,
    );
  }
  const formBlock = formLines.length
    ? `\n\n${formLines.join("\n")}\nWeigh this form as background on relative strength and momentum; recent results count for more than older ones.`
    : "";
  return `You are the manager of ${team.name} in a simulated football match. You keep one append-only match thread: first choose the starting XI, then revisit formation, tactical detail, and player changes whenever the main match agent delegates a scheduled update.

Manage like a real coach:
- Pick your strongest available XI for the chosen formation; players are listed with position and a rating (higher = better). Build around your highest-rated players and put your key player where they influence the most valuable chances.
- Match the opponent's shape and the game state: protect a lead by tightening up, chase a deficit by adding attacking quality, and rotate tired or booked players. A player on a yellow is a sending-off risk and a candidate to be subbed.
- Make changes only when they help. Over-rotation is a mistake.

Your ${squad.length}-player squad (name, position, rating): ${formatRoster(squad)}.${opponentBlock}${formBlock}

Alongside the headline tactic, set three structured knobs so the match agent can read your intent precisely — each is "low" | "medium" | "high":
- "pressing": how high and aggressively you win the ball back (raises chances and fouls, tires legs faster).
- "lineHeight": how high your defensive line sits (higher opens the game for both sides).
- "tempo": overall speed of play (higher means more events and faster fatigue).
Set them to match your tactic and the game state — e.g. chase a deficit with higher pressing/line/tempo, protect a lead by dropping them.

The squads above never change — each user turn gives you only the changing match state, so draw substitutes and the opponent's pool from here. Reply formats:
- Initial lineup: ONLY JSON {"reason","formation","tactic","keyPlayer","strategy","knobs","lineup"} — reason first; tactic is "attacking" | "balanced" | "defensive"; knobs is {"pressing","lineHeight","tempo"}; lineup is exactly 11 names from your squad (1 GK, the rest outfield).
- Scheduled update: if you keep everything unchanged, ONLY JSON {"reason","changes":false}; otherwise {"reason","changes":true,"formation","tactic","keyPlayer","strategy","knobs","substitutions","lineup"} — reason first; substitutions is an array of {"off","on","reason"}; lineup is the on-pitch XI after changes.

Always include a top-level "reason" explaining the decision. Respond with ONLY a JSON object — no prose, no code fences.`;
}

function mainAgentSystem(home: Team, away: Team): string {
  return `You are the main game-play agent for a simulated football match between ${home.name} and ${away.name}. You own the whole match flow: open the game, delegate lineup and scheduled tactical updates to the manager agents, decide each minute of play, and delegate referee checks after notable events (goals, fouls, bookings, red cards).

Calibrate every minute to real football:
- Most minutes are uneventful — emit "none" the large majority of the time. A typical 90-minute match has only ~2–3 goals and a handful of cards; do not manufacture action every minute.
- Likelihood scales with the rating gap between the sides, attacking vs defensive tactics, a one-man advantage after a red card, and a small home-side edge (${home.name} is the home side).
- Only players named in the current on-pitch XI can be involved. Pick scorers and assisters by position and rating: forwards and attacking midfielders score most, defenders occasionally, and the goalkeeper essentially never. Higher-rated players are more often decisive.
- Game state matters: a leading side defends the lead and concedes counters; a chasing side commits more. Goals and cards cluster late and in stoppage time.
- A player already on a yellow who commits another foul earns a second yellow (red). Never involve a player who is not on the pitch.

Each minute prompt also carries forward-fed context — weight it:
- Manager knobs (pressing / lineHeight / tempo, per side): higher pressing means more chances won high and more fouls; a higher opponent line leaves more space to score; higher tempo means more events overall.
- Momentum: the side described as on top is more likely to create the next chance.
- Fatigue: tiring legs late on mean more mistimed tackles (cards) and more goals conceded.
- Officiating: a strict referee turns more fouls into cards; a lenient one lets play flow.

Your conversation is append-only to maximize KV-cache hits. When asked for a minute result, respond with ONLY a JSON object — no prose, no code fences.`;
}

function refereeSystem(): string {
  return `You are the referee of a simulated football match, triggered by the main match agent after notable events. Review the specific event, score, and dismissals, then keep play going unless player safety, abandonment rules (e.g. a team reduced below 7 players), or repeated serious incidents force a stop. Stopping a match is rare — continue in the overwhelming majority of reviews.

Also report how strictly you are officiating as "strictness": "lenient" (let play flow, few cards), "normal", or "strict" (punish fouls firmly, more cards). Be consistent across the match unless the players' conduct clearly pushes you to tighten up or ease off — this signal feeds the match agent's foul and card likelihood.

Always include a top-level "reason" explaining why play continues or stops. Respond with ONLY a JSON object {"decision","reason","strictness"} — no prose, no code fences.`;
}

function managerPrompt(context?: string): string {
  return managerLineupPrompt({ context });
}

// The squad rosters and the JSON reply formats live in `managerSystem` (the
// cached prefix). These per-turn prompts carry only the volatile match state.

function managerLineupPrompt(opts: {
  opponentPlan?: ManagerPlanContext;
  context?: string;
}): string {
  const opponentShape = opts.opponentPlan
    ? `\nOpponent's shape: ${formatManagerPlan(opts.opponentPlan)}.`
    : "";
  const matchContext = opts.context
    ? `\nMatch context to account for when choosing formation, risk level, rotations, and key player:\n${opts.context}`
    : "";
  return `The main match agent delegates the initial lineup decision to you. Pick your starting XI now: choose a formation, exactly 11 starters that fit it, a tactic, your key player, and a one-sentence strategy.${opponentShape}${matchContext}\n\nReply with the initial-lineup JSON.`;
}

function managerAdjustmentPrompt(opts: {
  opponentPlan?: ManagerPlanContext;
  minute: number;
  score: { home: number; away: number };
  current: ManagerPlanContext;
}): string {
  const currentPlan = formatManagerPlan(opts.current);
  const opponentPlan = opts.opponentPlan
    ? `\nOpponent's current shape: ${formatManagerPlan(opts.opponentPlan)}.`
    : "";
  return `The main match agent delegates your scheduled in-match manager update.\n\nMinute ${opts.minute}. Score: home ${opts.score.home}-${opts.score.away} away.\nCurrent plan and XI: ${currentPlan}.${opponentPlan}\n\nReassess formation, tactic, detailed strategy, key player, and player changes, then reply with the scheduled-update JSON. Do not restate anything you are leaving unchanged.`;
}

function formatRoster(players: Player[]): string {
  return players.map((p) => `${p.name} (${p.position}, ${p.rating})`).join(", ");
}

/**
 * Compact, byte-stable summary of a finalist's qualification campaign: the
 * overall record plus the most recent results. Durable for the whole match, so
 * it rides the cached system prefix rather than any per-turn message.
 */
function formatQualification(
  campaign: NonNullable<Team["qualification"]>,
): string {
  const { record, results } = campaign;
  const summary = `${campaign.method} — P${record.played} W${record.wins} D${record.draws} L${record.losses}, GF${record.goalsFor} GA${record.goalsAgainst}`;
  const recent = results
    .slice(-6)
    .map(
      (r) =>
        `${r.result} ${r.goalsFor}-${r.goalsAgainst} vs ${r.opponent} (${r.venue === "home" ? "H" : "A"})`,
    )
    .join("; ");
  return recent ? `${summary}. Recent: ${recent}` : summary;
}

function formatManagerPlan(plan: ManagerPlanContext): string {
  const knobs = plan.knobs
    ? ` (press ${plan.knobs.pressing}, line ${plan.knobs.lineHeight}, tempo ${plan.knobs.tempo})`
    : "";
  return `${plan.formation}, ${plan.tactic}${knobs}, key player ${plan.keyPlayer}, ${plan.strategy}; XI: ${plan.lineup
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

/** Stable fingerprint of who is on the pitch, to detect lineup changes. */
function lineupSignature(homeXI: Player[], awayXI: Player[]): string {
  const names = (xi: Player[]) =>
    xi.map((p) => p.name).sort().join("|");
  return `${names(homeXI)}//${names(awayXI)}`;
}

/** Compact "Name(POS,rating)" list for the on-pitch XI. */
function formatXI(xi: Player[]): string {
  return xi.map((p) => `${p.name}(${p.position},${p.rating})`).join(", ");
}

/** Game-phase hint so the agent weights late-match urgency and stoppage time. */
function matchPhase(minute: number): string {
  if (minute <= 15) return "opening exchanges";
  if (minute < 45) return "first half";
  if (minute <= 60) return "early second half";
  if (minute <= 80) return "second half";
  if (minute <= 90) return "closing stages — urgency rises, late goals and stoppage time likely";
  return "stoppage time";
}

/** Compact "tactic (press/line/tempo)" annotation for a side's manager plan. */
function formatPlanLine(
  name: string,
  formation: string,
  tactic: Tactic,
  knobs: TacticalKnobs,
  strategy: string,
): string {
  return `${name}: ${formation}, ${tactic} (press ${knobs.pressing}/line ${knobs.lineHeight}/tempo ${knobs.tempo}), ${strategy}`;
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
  homeXI: Player[];
  awayXI: Player[];
  homeKnobs: TacticalKnobs;
  awayKnobs: TacticalKnobs;
  momentum: SideState;
  fatigue: SideState;
  refStrictness: OfficiatingStrictness;
  includeLineups: boolean;
  bookedHome: string[];
  bookedAway: string[];
  redCards: { home: number; away: number };
}): string {
  const window =
    opts.minuteStep === 1
      ? `Minute ${opts.minute}`
      : `Minutes ${Math.max(1, opts.minute - opts.minuteStep + 1)}-${opts.minute}`;
  const instruction =
    opts.minuteStep === 1
      ? "Decide exactly this minute of play."
      : "Decide the main visible event for this match window.";
  const lineups = opts.includeLineups
    ? ` On the pitch — ${opts.home.name}: ${formatXI(opts.homeXI)}. ${opts.away.name}: ${formatXI(opts.awayXI)}.`
    : "";
  const booked =
    opts.bookedHome.length || opts.bookedAway.length
      ? ` Booked (a second yellow is a red) — ${opts.home.name}: ${opts.bookedHome.join(", ") || "none"}; ${opts.away.name}: ${opts.bookedAway.join(", ") || "none"}.`
      : "";
  const reds =
    opts.redCards.home || opts.redCards.away
      ? ` Red cards — ${opts.home.name}: ${opts.redCards.home}, ${opts.away.name}: ${opts.redCards.away} (a side a man down concedes more).`
      : "";
  // Forward-fed dynamics on the volatile tail (never the cached prefix).
  const momentumDiff = opts.momentum.home - opts.momentum.away;
  const momentumHint =
    momentumDiff >= MOMENTUM_HINT_THRESHOLD
      ? ` Momentum: ${opts.home.name} on top over the last few minutes.`
      : momentumDiff <= -MOMENTUM_HINT_THRESHOLD
        ? ` Momentum: ${opts.away.name} on top over the last few minutes.`
        : "";
  const tired = [
    opts.fatigue.home < FATIGUE_HINT_THRESHOLD ? opts.home.name : null,
    opts.fatigue.away < FATIGUE_HINT_THRESHOLD ? opts.away.name : null,
  ].filter((n): n is string => Boolean(n));
  const fatigueHint = tired.length
    ? ` Fatigue: ${tired.join(" and ")} tiring — late-game card and goal risk up.`
    : "";
  const officiating =
    opts.refStrictness !== "normal"
      ? ` Officiating: ${opts.refStrictness} referee — ${
          opts.refStrictness === "strict"
            ? "fouls punished firmly, card risk up"
            : "play allowed to flow, fewer cards"
        }.`
      : "";
  return `${window} — ${matchPhase(opts.minute)}. Score: ${opts.home.name} ${opts.score.home}-${opts.score.away} ${opts.away.name}. Current manager plans — ${formatPlanLine(opts.home.name, opts.homeFormation, opts.homeTactic, opts.homeKnobs, opts.homeStrategy)}. ${formatPlanLine(opts.away.name, opts.awayFormation, opts.awayTactic, opts.awayKnobs, opts.awayStrategy)}.${lineups}${booked}${reds}${momentumHint}${fatigueHint}${officiating} ${instruction} Most minutes are uneventful — prefer "none" unless this minute genuinely warrants an event, and only involve players currently on the pitch. Reply as JSON {"event","side","player","assist","text"} where event is one of "none" | "goal" | "save" | "miss" | "foul" | "yellow" | "red", side is "home" | "away" | null, and assist is the assisting player name for goals or null.`;
}

function refereePrompt(
  minute: number,
  score: { home: number; away: number },
  reds: { home: number; away: number },
  outcome: MinuteOutcome,
): string {
  return `The main match agent delegates a referee review after this event. Minute ${minute}. Event: ${outcome.event}; side: ${outcome.side ?? "none"}; player: ${outcome.player ?? "none"}; description: ${outcome.text || "none"}. Score ${score.home}-${score.away}. Red cards — home: ${reds.home}, away: ${reds.away}. Decide whether play continues and report your officiating strictness. Reply as JSON {"decision","reason","strictness"} where decision is "continue" | "stop", strictness is "lenient" | "normal" | "strict", and reason explains why.`;
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

const STRICTNESS_VALUES: ReadonlySet<string> = new Set([
  "lenient",
  "normal",
  "strict",
]);

function parseStrictness(value: unknown): OfficiatingStrictness | undefined {
  const s = str(value);
  return s && STRICTNESS_VALUES.has(s) ? (s as OfficiatingStrictness) : undefined;
}

function parseVerdict(text: string): RefereeVerdict {
  const obj = asRecord(extractJSON(text));
  const decision = str(obj?.decision);
  const strictness = parseStrictness(obj?.strictness);
  if (decision === "stop") {
    return {
      decision: "stop",
      reason: str(obj?.reason) ?? "Match stopped by the referee.",
      ...(strictness ? { strictness } : {}),
    };
  }
  return {
    decision: "continue",
    reason: str(obj?.reason) ?? "Play continues.",
    ...(strictness ? { strictness } : {}),
  };
}
