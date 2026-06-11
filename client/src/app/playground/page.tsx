"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GroupLetter } from "@worldcupsim/wc26-data";
import {
  Bot,
  CalendarDays,
  CircleDot,
  CircleStop,
  Clock,
  Flag,
  FlaskConical,
  Gauge,
  Goal,
  Hand,
  MapPin,
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Trophy,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ScrollArea } from "~/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import type {
  AgentUsageSummary,
  AssistantSummary,
  GroupStanding,
  Lineup,
  MatchResult,
  MinuteOutcome,
  Mode,
  OrchestratorEvent,
  RefereeVerdict,
  StandingsResponse,
  Thread,
} from "~/lib/playground-types";
import {
  getTeam,
  GROUP_LETTERS,
  teamsInGroup,
  type Player,
  type Team,
} from "~/lib/teams";
import { type Match, matchesByGroup, resolveMatch } from "~/lib/tournament";

// The playground is driven by the real WC26 group-stage schedule.
const DEFAULT_GROUP: GroupLetter = GROUP_LETTERS[0] ?? "A";
const DEFAULT_MATCH = matchesByGroup(DEFAULT_GROUP)[0]?.match ?? 1;

// --- live match state -------------------------------------------------------

interface MinuteRow {
  minute: number;
  outcome: MinuteOutcome;
  score: { home: number; away: number };
}

interface ThreadStat {
  lastHitRate: number;
  cumulativeHitRate: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  reasoningTokens: number;
  latencyMs: number;
}

interface AgentTurn {
  prompt: string;
  response: string;
  usage: AgentUsageSummary | null;
}

interface PlayerLineupEvents {
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  subbedOn: boolean;
  subbedOff: boolean;
}

interface MatchState {
  phase: string;
  score: { home: number; away: number };
  homeLineup: Lineup | null;
  awayLineup: Lineup | null;
  minutes: MinuteRow[];
  referee: { minute: number; verdict: RefereeVerdict }[];
  result: MatchResult | null;
  error: string | null;
  cache: Record<Thread, ThreadStat>;
  agentLogs: Record<Thread, AgentTurn[]>;
}

const ZERO_STAT: ThreadStat = {
  lastHitRate: 0,
  cumulativeHitRate: 0,
  promptTokens: 0,
  completionTokens: 0,
  cacheHitTokens: 0,
  cacheMissTokens: 0,
  reasoningTokens: 0,
  latencyMs: 0,
};

function initialState(): MatchState {
  return {
    phase: "idle",
    score: { home: 0, away: 0 },
    homeLineup: null,
    awayLineup: null,
    minutes: [],
    referee: [],
    result: null,
    error: null,
    cache: {
      match: { ...ZERO_STAT },
      "home-manager": { ...ZERO_STAT },
      "away-manager": { ...ZERO_STAT },
      referee: { ...ZERO_STAT },
    },
    agentLogs: {
      match: [],
      "home-manager": [],
      "away-manager": [],
      referee: [],
    },
  };
}

function aggregateUsage(cache: Record<Thread, ThreadStat>): ThreadStat {
  const stats = Object.values(cache);
  const promptTokens = stats.reduce((sum, stat) => sum + stat.promptTokens, 0);
  const cacheHitTokens = stats.reduce(
    (sum, stat) => sum + stat.cacheHitTokens,
    0,
  );
  return {
    lastHitRate: 0,
    cumulativeHitRate: promptTokens > 0 ? cacheHitTokens / promptTokens : 0,
    promptTokens,
    completionTokens: stats.reduce(
      (sum, stat) => sum + stat.completionTokens,
      0,
    ),
    cacheHitTokens,
    cacheMissTokens: stats.reduce((sum, stat) => sum + stat.cacheMissTokens, 0),
    reasoningTokens: stats.reduce((sum, stat) => sum + stat.reasoningTokens, 0),
    latencyMs: stats.reduce((sum, stat) => sum + stat.latencyMs, 0),
  };
}

function appendToLastTurn(
  turns: AgentTurn[],
  update: (turn: AgentTurn) => AgentTurn,
): AgentTurn[] {
  if (turns.length === 0) return turns;
  return turns.map((turn, index) =>
    index === turns.length - 1 ? update(turn) : turn,
  );
}

function reduce(state: MatchState, event: OrchestratorEvent): MatchState {
  switch (event.type) {
    case "phase":
      return { ...state, phase: event.phase };
    case "lineup":
      return event.thread === "home-manager"
        ? { ...state, homeLineup: event.lineup }
        : { ...state, awayLineup: event.lineup };
    case "agent_prompt":
      return {
        ...state,
        agentLogs: {
          ...state.agentLogs,
          [event.thread]: [
            ...state.agentLogs[event.thread],
            { prompt: event.prompt, response: "", usage: null },
          ],
        },
      };
    case "agent_delta":
      return {
        ...state,
        agentLogs: {
          ...state.agentLogs,
          [event.thread]: appendToLastTurn(
            state.agentLogs[event.thread],
            (turn) => ({
              ...turn,
              response: turn.response + event.delta,
            }),
          ),
        },
      };
    case "minute":
      return {
        ...state,
        score: event.score,
        minutes: [
          ...state.minutes,
          { minute: event.minute, outcome: event.outcome, score: event.score },
        ],
      };
    case "referee":
      return {
        ...state,
        referee: [
          ...state.referee,
          { minute: event.minute, verdict: event.verdict },
        ],
      };
    case "cache":
      return {
        ...state,
        cache: {
          ...state.cache,
          [event.thread]: {
            lastHitRate: event.hitRate,
            cumulativeHitRate: event.cumulativeHitRate,
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens ?? 0,
            cacheHitTokens: event.cacheHitTokens ?? 0,
            cacheMissTokens: event.cacheMissTokens ?? 0,
            reasoningTokens: event.reasoningTokens ?? 0,
            latencyMs: event.latencyMs ?? 0,
          },
        },
        agentLogs: {
          ...state.agentLogs,
          [event.thread]: appendToLastTurn(
            state.agentLogs[event.thread],
            (turn) => ({
              ...turn,
              usage: {
                promptTokens: event.promptTokens,
                completionTokens: event.completionTokens ?? 0,
                cacheHitTokens: event.cacheHitTokens ?? 0,
                cacheMissTokens: event.cacheMissTokens ?? 0,
                reasoningTokens: event.reasoningTokens ?? 0,
                cacheHitRate: event.hitRate,
                cumulativeHitRate: event.cumulativeHitRate,
                latencyMs: event.latencyMs ?? 0,
              },
            }),
          ),
        },
      };
    case "result":
      return { ...state, result: event.result };
    case "error":
      return { ...state, error: event.message };
    default:
      return state;
  }
}

// --- page -------------------------------------------------------------------

export default function PlaygroundPage() {
  const [group, setGroup] = useState<GroupLetter>(DEFAULT_GROUP);
  const [matchNumber, setMatchNumber] = useState<number>(DEFAULT_MATCH);
  const [mode, setMode] = useState<Mode>("mock");
  const [maxMinutes, setMaxMinutes] = useState(90);
  const [running, setRunning] = useState(false);
  const [activeCenterThread, setActiveCenterThread] = useState<
    "match" | "referee" | null
  >(null);
  const [lineupLoading, setLineupLoading] = useState<"home" | "away" | null>(
    null,
  );
  const [state, setState] = useState<MatchState>(initialState);
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The selected real fixture and its resolved teams.
  const fixtures = matchesByGroup(group);
  const fixture = fixtures.find((m) => m.match === matchNumber) ?? fixtures[0];
  const resolved = fixture ? resolveMatch(fixture) : null;
  const home = resolved?.home;
  const away = resolved?.away;
  const playable = Boolean(resolved?.playable && home && away);
  const managerContext =
    fixture && home && away
      ? buildManagerContext(fixture, home, away, standings)
      : "";

  const onGroup = (g: GroupLetter) => {
    setGroup(g);
    const first = matchesByGroup(g)[0];
    if (first) setMatchNumber(first.match);
    setState(initialState());
  };

  const onMatch = (n: number) => {
    setMatchNumber(n);
    setState(initialState());
  };

  const loadStandings = useCallback(async () => {
    try {
      const res = await fetch("/api/playground");
      if (res.ok) {
        const raw: unknown = await res.json();
        setStandings(raw as StandingsResponse);
      }
    } catch {
      // best-effort
    }
  }, []);

  useEffect(() => {
    void loadStandings();
  }, [loadStandings]);

  const readEventStream = useCallback(async (res: Response) => {
    if (!res.ok || !res.body) {
      const detail = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(detail?.error ?? `Request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        const event = JSON.parse(line.slice(5).trim()) as OrchestratorEvent;
        setState((s) => reduce(s, event));
      }
    }
  }, []);

  const setManagerLineup = useCallback(
    async (side: "home" | "away") => {
      const team = side === "home" ? home : away;
      if (!team || running || lineupLoading) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLineupLoading(side);
      setState((s) => ({ ...s, error: null }));

      try {
        const res = await fetch("/api/playground", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "lineup",
            teamId: team.id,
            side,
            mode,
            matchId: `${matchNumber}:${team.id}:${side}`,
            managerContext,
          }),
          signal: controller.signal,
        });
        await readEventStream(res);
      } catch (err) {
        if (!controller.signal.aborted) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      } finally {
        setLineupLoading(null);
      }
    },
    [
      away,
      home,
      lineupLoading,
      managerContext,
      matchNumber,
      mode,
      readEventStream,
      running,
    ],
  );

  const kickoff = useCallback(async () => {
    if (!home || !away || !playable || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const homeLineup = state.homeLineup ?? undefined;
    const awayLineup = state.awayLineup ?? undefined;
    const agentLogs = state.agentLogs;
    setState({ ...initialState(), agentLogs });
    setRunning(true);

    try {
      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          homeId: home.id,
          awayId: away.id,
          mode,
          maxMinutes,
          homeLineup,
          awayLineup,
          matchId: String(matchNumber),
          managerContext,
        }),
        signal: controller.signal,
      });
      await readEventStream(res);
    } catch (err) {
      if (!controller.signal.aborted) {
        setState((s) => ({
          ...s,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    } finally {
      setRunning(false);
      void loadStandings();
    }
  }, [
    home,
    away,
    playable,
    running,
    state.homeLineup,
    state.awayLineup,
    state.agentLogs,
    managerContext,
    mode,
    maxMinutes,
    matchNumber,
    readEventStream,
    loadStandings,
  ]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the commentary feed pinned to the latest line.
  useEffect(() => {
    const vp = scrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    vp?.scrollTo({ top: vp.scrollHeight, behavior: "smooth" });
  }, [state.minutes.length, state.referee.length]);

  const finished = state.phase === "fulltime" || state.phase === "stopped";
  const abandoned = state.result?.abandoned ?? state.phase === "stopped";
  const clock = state.minutes.at(-1)?.minute ?? 0;
  const started = state.minutes.length > 0 || state.phase !== "idle";
  const totalUsage = aggregateUsage(state.cache);

  // Group-stage fixtures always resolve to real teams; this guards the rare
  // edge (and narrows the types for the panels below).
  if (!fixture || !home || !away) {
    return (
      <main className="flex-1">
        <div className="text-muted-foreground mx-auto max-w-2xl px-4 py-20 text-center text-sm">
          No playable fixture selected.
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="flex w-full flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="bg-primary/15 text-primary ring-primary/30 flex size-9 items-center justify-center rounded-xl ring-1">
                <FlaskConical className="size-5" />
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight">
                Agent <span className="text-primary">Playground</span>
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <UsageSummary stat={totalUsage} />
              <ModeControl mode={mode} onMode={setMode} disabled={running} />
            </div>
          </div>
          <p className="text-muted-foreground max-w-2xl text-sm">
            The main sim-agent owns game play, delegates manager updates every
            five minutes by default, and calls the referee after notable events.
            Each role keeps an append-only cache-stable thread.
          </p>
        </header>

        {state.error && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-4 py-3 text-sm">
            {state.error}
          </div>
        )}

        {/* three columns: home manager · match · away manager */}
        <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)]">
          <ManagerPanel
            team={home}
            side="home"
            lineup={state.homeLineup}
            stat={state.cache["home-manager"]}
            minutes={state.minutes}
            agentTurns={state.agentLogs["home-manager"]}
            running={running}
            settingLineup={lineupLoading === "home"}
            onSetLineup={() => void setManagerLineup("home")}
          />

          <Card className="order-first overflow-hidden pt-0 lg:order-none">
            <Scoreboard
              home={home}
              away={away}
              score={state.score}
              clock={clock}
              playing={running && !finished}
              finished={finished}
              abandoned={abandoned}
            />

            <CardContent className="flex flex-col gap-4">
              <Controls
                group={group}
                onGroup={onGroup}
                matchNumber={matchNumber}
                fixtures={fixtures}
                onMatch={onMatch}
                maxMinutes={maxMinutes}
                onMaxMinutes={setMaxMinutes}
                running={running}
                matchStat={state.cache.match}
                refStat={state.cache.referee}
                activeThread={activeCenterThread}
                onThread={setActiveCenterThread}
              />

              <FixtureMeta match={fixture} />

              <Commentary
                scrollRef={scrollRef}
                minutes={state.minutes}
                referee={state.referee}
                finished={finished}
                abandoned={abandoned}
                home={home}
                away={away}
                running={running}
                started={started}
                canKick={playable}
                onKickoff={() => void kickoff()}
              />

              {activeCenterThread && (
                <ThreadDetail
                  thread={activeCenterThread}
                  stat={state.cache[activeCenterThread]}
                  turns={state.agentLogs[activeCenterThread]}
                  onClose={() => setActiveCenterThread(null)}
                />
              )}
            </CardContent>
          </Card>

          <ManagerPanel
            team={away}
            side="away"
            lineup={state.awayLineup}
            stat={state.cache["away-manager"]}
            minutes={state.minutes}
            agentTurns={state.agentLogs["away-manager"]}
            running={running}
            settingLineup={lineupLoading === "away"}
            onSetLineup={() => void setManagerLineup("away")}
          />
        </div>

        {state.result && <ResultCard result={state.result} />}

        {standings && standings.results.length > 0 && (
          <StandingsView
            standings={standings.standings}
            resultCount={standings.results.length}
          />
        )}
      </div>
    </main>
  );
}

// --- center: scoreboard + controls + commentary -----------------------------

function Scoreboard({
  home,
  away,
  score,
  clock,
  playing,
  finished,
  abandoned,
}: {
  home: Team;
  away: Team;
  score: { home: number; away: number };
  clock: number;
  playing: boolean;
  finished: boolean;
  abandoned: boolean;
}) {
  return (
    <CardHeader className="pitch-stripes border-b py-4 sm:py-5 [.border-b]:pb-4 sm:[.border-b]:pb-5">
      <div className="flex items-center justify-between gap-2">
        <TeamBadge team={home} />
        <div className="flex flex-col items-center px-2">
          <div className="text-3xl font-extrabold tracking-tight tabular-nums drop-shadow sm:text-5xl">
            {score.home}
            <span className="mx-2 text-white/40">:</span>
            {score.away}
          </div>
          <ClockPill
            clock={clock}
            playing={playing}
            finished={finished}
            abandoned={abandoned}
          />
        </div>
        <TeamBadge team={away} />
      </div>
    </CardHeader>
  );
}

function TeamBadge({ team }: { team: Team }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <span className="text-3xl drop-shadow-md sm:text-4xl">{team.flag}</span>
      <span className="max-w-full truncate text-xs font-semibold text-white sm:text-sm">
        {team.name}
      </span>
    </div>
  );
}

function ClockPill({
  clock,
  playing,
  finished,
  abandoned,
}: {
  clock: number;
  playing: boolean;
  finished: boolean;
  abandoned: boolean;
}) {
  const label = abandoned
    ? "ABANDONED"
    : finished
      ? "FULL TIME"
      : clock > 0
        ? `${clock}'`
        : "—";
  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white">
      {playing && (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
      )}
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

function Controls({
  group,
  onGroup,
  matchNumber,
  fixtures,
  onMatch,
  maxMinutes,
  onMaxMinutes,
  running,
  matchStat,
  refStat,
  activeThread,
  onThread,
}: {
  group: GroupLetter;
  onGroup: (g: GroupLetter) => void;
  matchNumber: number;
  fixtures: Match[];
  onMatch: (n: number) => void;
  maxMinutes: number;
  onMaxMinutes: (n: number) => void;
  running: boolean;
  matchStat: ThreadStat;
  refStat: ThreadStat;
  activeThread: "match" | "referee" | null;
  onThread: (thread: "match" | "referee") => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
        <Field label="Group" className="min-w-0">
          <Select
            value={group}
            disabled={running}
            onValueChange={(v) => {
              if (v) onGroup(v);
            }}
          >
            <SelectTrigger className="w-full sm:w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_LETTERS.map((g) => (
                <SelectItem key={g} value={g}>
                  Group {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Fixture"
          className="col-span-2 min-w-0 sm:min-w-64 sm:flex-1"
        >
          <Select
            value={String(matchNumber)}
            disabled={running}
            onValueChange={(v) => {
              if (v) onMatch(Number(v));
            }}
          >
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fixtures.map((m) => (
                <SelectItem key={m.match} value={String(m.match)}>
                  {fixtureLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Minutes" className="min-w-0">
          <input
            type="number"
            min={1}
            max={90}
            value={maxMinutes}
            disabled={running}
            onChange={(e) =>
              onMaxMinutes(
                Math.min(90, Math.max(1, Number(e.target.value) || 1)),
              )
            }
            className="bg-background h-9 w-full rounded-md border px-2 text-sm sm:w-16"
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Threads:</span>
        <CacheBadge
          label="match"
          stat={matchStat}
          active={activeThread === "match"}
          onClick={() => onThread("match")}
        />
        <CacheBadge
          label="referee"
          stat={refStat}
          active={activeThread === "referee"}
          onClick={() => onThread("referee")}
        />
      </div>
    </div>
  );
}

/** "🇲🇽 Mexico vs South Africa 🇿🇦" for a fixture dropdown row. */
function fixtureLabel(m: Match): string {
  const { home, away } = resolveMatch(m);
  const h = home ? `${home.flag} ${home.name}` : m.home;
  const a = away ? `${away.name} ${away.flag}` : m.away;
  return `${h} vs ${a}`;
}

function FixtureMeta({ match }: { match: Match }) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
      <Badge variant="secondary">
        {match.group ? `Group ${match.group}` : match.round}
      </Badge>
      <Badge variant="outline">Match {match.match}</Badge>
      <span className="flex items-center gap-1">
        <CalendarDays className="size-3.5" />
        {match.date}
      </span>
      {match.kickoff_local && (
        <span className="flex items-center gap-1">
          <Clock className="size-3.5" />
          {match.kickoff_local}
        </span>
      )}
      <span className="flex items-center gap-1">
        <MapPin className="size-3.5" />
        {match.venue}, {match.city}
      </span>
    </div>
  );
}

// --- commentary feed (match minutes + referee, woven together) --------------

type FeedItem =
  | {
      kind: "marker";
      minute: number;
      text: string;
      icon: React.ReactNode;
      emphasis: string;
    }
  | { kind: "minute"; minute: number; outcome: MinuteOutcome }
  | { kind: "referee"; minute: number; verdict: RefereeVerdict };

function buildFeed(
  minutes: MinuteRow[],
  referee: { minute: number; verdict: RefereeVerdict }[],
  finished: boolean,
  abandoned: boolean,
  home: Team,
  away: Team,
): FeedItem[] {
  const items: FeedItem[] = [];
  items.push({
    kind: "marker",
    minute: 0,
    text: `Kick off — ${home.flag} ${home.name} vs ${away.name} ${away.flag}`,
    icon: <Flag className="text-muted-foreground size-4" />,
    emphasis: "bg-muted/60 font-medium",
  });
  for (const m of minutes) {
    if (m.outcome.event !== "none") {
      items.push({ kind: "minute", minute: m.minute, outcome: m.outcome });
    }
  }
  for (const r of referee) {
    items.push({ kind: "referee", minute: r.minute, verdict: r.verdict });
  }
  // Minute events before referee checks at the same minute.
  const rank = (i: FeedItem) => (i.kind === "referee" ? 1 : 0);
  items.sort((a, b) => a.minute - b.minute || rank(a) - rank(b));
  if (finished) {
    items.push({
      kind: "marker",
      minute: 91,
      text: abandoned ? "Match abandoned by the referee." : "Full time.",
      icon: abandoned ? (
        <CircleStop className="text-destructive size-4" />
      ) : (
        <Trophy className="text-primary size-4" />
      ),
      emphasis: "bg-muted/60 font-medium",
    });
  }
  return items;
}

const EVENT_ICON: Record<MinuteOutcome["event"], React.ReactNode> = {
  none: <CircleDot className="text-muted-foreground size-4" />,
  goal: <Goal className="text-primary size-4" />,
  save: <Hand className="size-4 text-sky-400" />,
  miss: <CircleDot className="text-muted-foreground size-4" />,
  foul: <TriangleAlert className="size-4 text-amber-400" />,
  yellow: <span className="block h-3.5 w-2.5 rounded-[2px] bg-yellow-400" />,
  red: <ShieldX className="size-4 text-red-500" />,
};

function Commentary({
  scrollRef,
  minutes,
  referee,
  finished,
  abandoned,
  home,
  away,
  running,
  started,
  canKick,
  onKickoff,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  minutes: MinuteRow[];
  referee: { minute: number; verdict: RefereeVerdict }[];
  finished: boolean;
  abandoned: boolean;
  home: Team;
  away: Team;
  running: boolean;
  started: boolean;
  canKick: boolean;
  onKickoff: () => void;
}) {
  const items = buildFeed(minutes, referee, finished, abandoned, home, away);
  const empty = minutes.length === 0 && referee.length === 0;

  return (
    <ScrollArea
      ref={scrollRef}
      className="bg-background/40 h-[22rem] rounded-xl border sm:h-[26rem]"
    >
      <div className="flex flex-col gap-1.5 p-3">
        {empty ? (
          <div className="flex flex-col items-center justify-center gap-5 py-20 text-center sm:py-28">
            <p className="text-muted-foreground text-sm">
              Pick a fixture and hit{" "}
              <span className="text-foreground font-semibold">Kick Off</span>{" "}
              to watch the agents play.
            </p>
            <Button
              size="lg"
              onClick={onKickoff}
              disabled={running || !canKick}
              className="h-12 min-w-48 px-8 text-base font-semibold"
            >
              {started ? (
                <RotateCcw className="size-5" />
              ) : (
                <Play className="size-5" />
              )}
              {running ? "Playing…" : started ? "Replay" : "Kick Off"}
            </Button>
          </div>
        ) : (
          items.map((item, i) => <FeedLine key={i} item={item} />)
        )}
      </div>
    </ScrollArea>
  );
}

function FeedLine({ item }: { item: FeedItem }) {
  let icon: React.ReactNode;
  let text: string;
  let emphasis: string;

  if (item.kind === "marker") {
    icon = item.icon;
    text = item.text;
    emphasis = item.emphasis;
  } else if (item.kind === "referee") {
    const stop = item.verdict.decision === "stop";
    icon = stop ? (
      <CircleStop className="text-destructive size-4" />
    ) : (
      <ShieldCheck className="size-4 text-emerald-500" />
    );
    text = `Referee — ${item.verdict.reason}`;
    emphasis = stop
      ? "bg-destructive/10 ring-1 ring-destructive/30"
      : "text-muted-foreground hover:bg-muted/40";
  } else {
    icon = EVENT_ICON[item.outcome.event];
    text = item.outcome.text;
    emphasis =
      item.outcome.event === "goal"
        ? "bg-primary/15 ring-1 ring-primary/30 font-semibold"
        : "hover:bg-muted/40";
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${emphasis}`}
    >
      <span className="text-muted-foreground w-7 shrink-0 pt-0.5 text-right text-xs font-medium tabular-nums">
        {item.minute > 90 ? "" : `${item.minute}'`}
      </span>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="leading-snug">{text}</span>
    </div>
  );
}

// --- side columns: manager panels -------------------------------------------

function ManagerPanel({
  team,
  side,
  lineup,
  stat,
  minutes,
  agentTurns,
  running,
  settingLineup,
  onSetLineup,
}: {
  team: Team;
  side: "home" | "away";
  lineup: Lineup | null;
  stat: ThreadStat;
  minutes: MinuteRow[];
  agentTurns: AgentTurn[];
  running: boolean;
  settingLineup: boolean;
  onSetLineup: () => void;
}) {
  const positions: Player["position"][] = ["GK", "DF", "MF", "FW"];
  // The manager is "picking" only while a run is in flight and no XI is in yet.
  const picking = (running || settingLineup) && !lineup;
  const sideEvents = minutes.filter((m) => m.outcome.side === side);
  const shots = sideEvents.filter(
    (m) =>
      m.outcome.event === "goal" ||
      m.outcome.event === "save" ||
      m.outcome.event === "miss",
  ).length;
  const onTarget = sideEvents.filter(
    (m) => m.outcome.event === "goal" || m.outcome.event === "save",
  ).length;
  const playerEvents = summarizeLineupEvents(sideEvents, lineup);

  return (
    <Card className="overflow-hidden pt-0">
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: team.colors.primary }}
      />
      <CardHeader className="pt-5">
        <div className="flex flex-wrap items-start gap-3">
          <span className="text-4xl drop-shadow sm:text-5xl">{team.flag}</span>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-xl">{team.name}</CardTitle>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {team.manager}
            </p>
          </div>
          <CacheBadge label="mgr" stat={stat} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <TeamMeta label="FIFA Rank" value={`#${team.fifaRanking}`} />
          <TeamMeta label="Group" value={`Group ${team.group}`} />
          <TeamMeta label="Confed" value={shortConfederation(team.confederation)} />
          <TeamMeta label="Rating" value={team.rating} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {lineup ? (
            <>
              <Badge variant="secondary">{lineup.formation}</Badge>
              <Badge variant="outline" className="capitalize">
                {lineup.tactic}
              </Badge>
            </>
          ) : picking ? (
            <Badge variant="outline" className="text-muted-foreground">
              selecting formation…
            </Badge>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Shots" value={shots} />
          <Stat label="On Target" value={onTarget} />
        </div>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="lineup">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-muted-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              Starting XI
              {lineup && (
                <span className="text-primary font-medium normal-case">
                  ★ {lineup.keyPlayer}
                </span>
              )}
            </h3>
            <TabsList className="grid h-8 grid-cols-2">
              <TabsTrigger value="lineup" className="px-3 text-xs">
                Lineup
              </TabsTrigger>
              <TabsTrigger value="agent" className="px-3 text-xs">
                Agent
              </TabsTrigger>
            </TabsList>
          </div>
          <Separator className="my-3" />

          <TabsContent value="lineup" className="m-0">
              {!lineup ? (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Button
                    variant="outline"
                    onClick={onSetLineup}
                    disabled={picking}
                    className="font-semibold"
                  >
                    <Users className="size-4" />
                    {picking ? "Setting lineup…" : "Set linetup"}
                  </Button>
                  <p className="text-muted-foreground max-w-56 text-sm">
                    Set the lineup to let the manager choose formation,
                    strategy, and the starting XI.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <ul className="flex flex-col gap-0.5">
                    {positions.flatMap((pos) =>
                      lineup.lineup
                        .filter((p) => p.position === pos)
                        .map((p) => {
                          const isKey = lineup.keyPlayer === p.name;
                          const events = playerEvents.get(p.name);
                          return (
                            <li
                              key={`${team.id}-${pos}-${p.number}-${p.name}`}
                              className={`flex items-center gap-3 rounded-md px-1.5 py-1 text-sm ${
                                isKey ? "bg-primary/10" : "hover:bg-muted/50"
                              }`}
                            >
                              <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums">
                                {p.number}
                              </span>
                              <span className="flex-1 truncate">{p.name}</span>
                              {events && <PlayerEventChips events={events} />}
                              <span className="text-muted-foreground text-xs font-medium">
                                {p.position}
                              </span>
                            </li>
                          );
                        }),
                    )}
                  </ul>

                  {(lineup.reason ??
                    lineup.strategy ??
                    (lineup.substitutions && lineup.substitutions.length > 0
                      ? "substitutions"
                      : "")) && (
                    <div className="bg-muted/40 rounded-lg p-3 text-xs">
                      {lineup.reason && (
                        <p className="text-foreground leading-relaxed">
                          {lineup.reason}
                        </p>
                      )}
                      {lineup.strategy && (
                        <p className="text-muted-foreground mt-1 leading-relaxed">
                          {lineup.strategy}
                        </p>
                      )}
                      {lineup.substitutions &&
                        lineup.substitutions.length > 0 && (
                          <ul className="mt-2 flex flex-col gap-1">
                            {lineup.substitutions.map((sub) => (
                              <li
                                key={`${sub.off}-${sub.on}`}
                                className="leading-relaxed"
                              >
                                <span className="font-semibold text-emerald-600">
                                  IN {sub.on}
                                </span>{" "}
                                <span className="text-muted-foreground">
                                  for
                                </span>{" "}
                                <span className="font-medium text-red-600">
                                  OUT {sub.off}
                                </span>
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {sub.reason}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                    </div>
                  )}
                </div>
              )}
          </TabsContent>

          <TabsContent value="agent" className="m-0">
            <AgentThread turns={agentTurns} />
          </TabsContent>
          {stat.promptTokens > 0 && (
            <div className="text-muted-foreground mt-3 border-t pt-2 text-[11px] leading-snug">
              prompt {stat.promptTokens} · completion {stat.completionTokens} ·
              cache {Math.round(stat.cumulativeHitRate * 100)}% · latency{" "}
              {formatLatency(stat.latencyMs)}
            </div>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

function summarizeLineupEvents(
  minutes: MinuteRow[],
  lineup: Lineup | null,
): Map<string, PlayerLineupEvents> {
  const byPlayer = new Map<string, PlayerLineupEvents>();
  const ensure = (name: string) => {
    const existing = byPlayer.get(name);
    if (existing) return existing;
    const created: PlayerLineupEvents = {
      goals: 0,
      assists: 0,
      yellow: 0,
      red: 0,
      subbedOn: false,
      subbedOff: false,
    };
    byPlayer.set(name, created);
    return created;
  };

  for (const minute of minutes) {
    const { outcome } = minute;
    if (outcome.event === "goal" && outcome.player) {
      ensure(outcome.player).goals++;
    }
    if (outcome.event === "goal" && outcome.assist) {
      ensure(outcome.assist).assists++;
    }
    if (outcome.event === "yellow" && outcome.player) {
      ensure(outcome.player).yellow++;
    }
    if (outcome.event === "red" && outcome.player) {
      ensure(outcome.player).red++;
    }
  }

  for (const sub of lineup?.substitutions ?? []) {
    ensure(sub.on).subbedOn = true;
    ensure(sub.off).subbedOff = true;
  }

  return byPlayer;
}

function PlayerEventChips({ events }: { events: PlayerLineupEvents }) {
  const chips = [
    events.goals > 0 ? { label: `G${events.goals}`, tone: "primary" } : null,
    events.assists > 0 ? { label: `A${events.assists}`, tone: "sky" } : null,
    events.yellow > 0 ? { label: `YC${events.yellow}`, tone: "yellow" } : null,
    events.red > 0 ? { label: `RC${events.red}`, tone: "red" } : null,
    events.subbedOn ? { label: "IN", tone: "green" } : null,
    events.subbedOff ? { label: "OUT", tone: "red" } : null,
  ].filter((chip): chip is { label: string; tone: string } => Boolean(chip));

  if (chips.length === 0) return null;

  const toneClass = (tone: string) => {
    switch (tone) {
      case "primary":
        return "bg-primary/15 text-primary";
      case "sky":
        return "bg-sky-500/15 text-sky-600";
      case "yellow":
        return "bg-yellow-400/20 text-yellow-700";
      case "green":
        return "bg-emerald-500/15 text-emerald-600";
      case "red":
        return "bg-red-500/15 text-red-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <span className="flex max-w-[44%] flex-wrap justify-end gap-1">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={`rounded px-1.5 py-0.5 text-[10px] font-bold leading-none tabular-nums ${toneClass(
            chip.tone,
          )}`}
        >
          {chip.label}
        </span>
      ))}
    </span>
  );
}

function TeamMeta({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="bg-muted/50 rounded-lg px-2.5 py-2">
      <div className="text-muted-foreground text-[11px] font-medium">
        {label}
      </div>
      <div className="truncate text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}

function shortConfederation(confederation: Team["confederation"]): string {
  return confederation === "CONCACAF" ? "NCA" : confederation;
}

function AgentThread({
  turns,
}: {
  turns: AgentTurn[];
}) {
  if (turns.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed px-3 py-8 text-center text-sm">
        Set the lineup to see the manager&apos;s sim-agent thread.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[24rem]">
      <div className="flex flex-col gap-4">
        {turns.map((turn, index) => (
          <div key={index} className="flex flex-col gap-3">
            <div className="flex justify-end gap-2">
              <div className="flex max-w-[88%] flex-col items-end gap-1">
                <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
                  Manager
                  <UserRound className="size-3" />
                </div>
                <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap shadow-sm">
                  {turn.prompt}
                </div>
              </div>
            </div>

            <div className="flex justify-start gap-2">
              <div className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-full">
                <Bot className="size-4" />
              </div>
              <div className="flex max-w-[88%] flex-col gap-1">
                <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
                  SimAgent
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                  {turn.response || "Waiting for response..."}
                </div>
                {turn.usage && (
                  <p className="text-muted-foreground pl-1 pt-1 text-[11px] leading-snug">
                    prompt {turn.usage.promptTokens} · completion{" "}
                    {turn.usage.completionTokens} · cache hit{" "}
                    {turn.usage.cacheHitTokens} · cache miss{" "}
                    {turn.usage.cacheMissTokens} · reasoning{" "}
                    {turn.usage.reasoningTokens} · latency{" "}
                    {formatLatency(turn.usage.latencyMs)}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function ThreadDetail({
  thread,
  stat,
  turns,
  onClose,
}: {
  thread: "match" | "referee";
  stat: ThreadStat;
  turns: AgentTurn[];
  onClose: () => void;
}) {
  const title = thread === "match" ? "Match Agent" : "Referee Agent";
  return (
    <div className="rounded-xl border p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-muted-foreground text-xs">
            prompt {stat.promptTokens} · completion {stat.completionTokens} ·
            cache {Math.round(stat.cumulativeHitRate * 100)}% · latency{" "}
            {formatLatency(stat.latencyMs)}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      <AgentThread turns={turns} />
    </div>
  );
}

// --- shared bits ------------------------------------------------------------

function buildManagerContext(
  match: Match,
  home: Team,
  away: Team,
  standings: StandingsResponse | null,
): string {
  const group = match.group ?? "unknown";
  const groupTeams = match.group ? teamsInGroup(match.group) : [home, away];
  const groupTeamIds = new Set(groupTeams.map((team) => team.id));
  const groupStanding = standings?.standings.find((s) => s.group === group);
  const rows =
    groupStanding?.rows ??
    groupTeams.map((team) => ({
      teamId: team.id,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
    }));
  const played = standings
    ? standings.results.filter(
        (result) =>
          !result.abandoned &&
          groupTeamIds.has(result.homeId) &&
          groupTeamIds.has(result.awayId),
      ).length
    : 0;
  const table = [
    "Team | P | W | D | L | GD | Pts",
    ...rows.map((row) => {
      const team = getTeam(row.teamId);
      const gd = row.goalsFor - row.goalsAgainst;
      return `${team.flag} ${team.name} | ${row.played} | ${row.won} | ${row.drawn} | ${row.lost} | ${gd} | ${row.points}`;
    }),
  ].join("\n");
  const teamInfo = [
    "Teams:",
    describeManagerContextTeam("Home", home),
    describeManagerContextTeam("Away", away),
  ].join("\n");

  return [
    `Group: ${group}`,
    `Match: ${match.match} (${match.round})`,
    `Fixture: ${home.flag} ${home.name} vs ${away.name} ${away.flag}`,
    `Date: ${match.date}`,
    `Time: ${match.kickoff_local ?? "TBD"}`,
    `Stadium: ${match.venue}, ${match.city}`,
    teamInfo,
    `Standings (${played} ${played === 1 ? "match" : "matches"} played):`,
    table,
  ].join("\n");
}

function describeManagerContextTeam(label: string, team: Team): string {
  return `${label}: ${team.flag} ${team.name} | FIFA Rank #${team.fifaRanking} | Group ${team.group} | ${team.confederation} | Rating ${team.rating} | Manager ${team.manager} | Base formation ${team.formation}`;
}

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function UsageBadge({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <Badge variant="secondary" className="font-mono text-[11px]">
      {label} {value}
    </Badge>
  );
}

function UsageSummary({ stat }: { stat: ThreadStat }) {
  const totalTokens = stat.promptTokens + stat.completionTokens;
  return (
    <div className="text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
      <span>
        tokens{" "}
        <span className="text-foreground font-semibold tabular-nums">
          {formatCompactNumber(totalTokens)}
        </span>
      </span>
      <span className="text-border">|</span>
      <span>
        KV{" "}
        <span className="text-foreground font-semibold tabular-nums">
          {Math.round(stat.cumulativeHitRate * 100)}%
        </span>
      </span>
    </div>
  );
}

function formatCompactNumber(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

function ModeControl({
  mode,
  onMode,
  disabled,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
      <span className="text-muted-foreground text-xs font-medium">Mode</span>
      <div className="grid h-9 grid-cols-2 overflow-hidden rounded-md border">
        {(["mock", "live"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onMode(m)}
            disabled={disabled}
            className={`px-3 text-sm capitalize transition ${
              mode === m
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </div>
  );
}

function CacheBadge({
  label,
  stat,
  active = false,
  onClick,
}: {
  label: string;
  stat: ThreadStat;
  active?: boolean;
  onClick?: () => void;
}) {
  if (stat.promptTokens === 0) return null;
  const pct = Math.round(stat.cumulativeHitRate * 100);
  const className = `gap-1 font-mono text-[11px] ${
    onClick ? "cursor-pointer hover:bg-primary/15" : ""
  } ${active ? "bg-primary/15 text-primary" : ""}`;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="rounded-full">
        <Badge variant="secondary" className={className}>
          <Gauge className="size-3" /> {label} {pct}%
        </Badge>
      </button>
    );
  }
  return (
    <Badge variant="secondary" className={className}>
      <Gauge className="size-3" /> {label} {pct}%
    </Badge>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

function ResultCard({ result }: { result: MatchResult }) {
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Full time{result.abandoned ? " (abandoned)" : ""}</span>
          <Badge variant="outline" className="capitalize">
            {result.mode}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="text-center text-xl font-bold tabular-nums sm:text-2xl">
          {result.homeName} {result.score.home} – {result.score.away}{" "}
          {result.awayName}
        </div>
        {result.scorers.length > 0 && (
          <div>
            <span className="font-medium">Scorers: </span>
            {result.scorers.map((s) => `${s.player} ${s.minute}'`).join(", ")}
          </div>
        )}
        {result.cards.length > 0 && (
          <div className="text-muted-foreground">
            <span className="font-medium">Cards: </span>
            {result.cards
              .map(
                (c) =>
                  `${c.card === "red" ? "🟥" : "🟨"} ${c.player} ${c.minute}'`,
              )
              .join(", ")}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Played {result.minutesPlayed}&apos; · stored for the standings below.
        </p>
        {result.assistants && result.assistants.length > 0 && (
          <AssistantResultList assistants={result.assistants} />
        )}
      </CardContent>
    </Card>
  );
}

function AssistantResultList({
  assistants,
}: {
  assistants: AssistantSummary[];
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        Assistant activity
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {assistants.map((assistant) => (
          <div
            key={assistant.thread}
            className="bg-muted/40 rounded-lg px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{assistant.label}</span>
              <Badge variant="outline" className="font-mono text-[11px]">
                {assistant.turns} {assistant.turns === 1 ? "turn" : "turns"}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <UsageBadge label="prompt" value={assistant.promptTokens} />
              <UsageBadge
                label="completion"
                value={assistant.completionTokens}
              />
              <UsageBadge
                label="cache"
                value={`${Math.round(assistant.cumulativeCacheHitRate * 100)}%`}
              />
              <UsageBadge
                label="latency"
                value={formatLatency(assistant.totalLatencyMs)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StandingsView({
  standings,
  resultCount,
}: {
  standings: GroupStanding[];
  resultCount: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Standings{" "}
          <span className="text-muted-foreground">
            ({resultCount} matches played)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {standings.map((g) => (
          <div key={g.group}>
            <h3 className="mb-2 text-sm font-semibold">{g.group}</h3>
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[24rem] text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr className="text-left">
                    <th className="py-1 font-medium">Team</th>
                    <th className="py-1 text-center font-medium">P</th>
                    <th className="py-1 text-center font-medium">W</th>
                    <th className="py-1 text-center font-medium">D</th>
                    <th className="py-1 text-center font-medium">L</th>
                    <th className="py-1 text-center font-medium">GD</th>
                    <th className="py-1 text-center font-medium">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r) => {
                    const team = getTeam(r.teamId);
                    return (
                      <tr key={r.teamId} className="border-t">
                        <td className="max-w-40 truncate py-1">
                          {team.flag} {team.name}
                        </td>
                        <td className="py-1 text-center tabular-nums">
                          {r.played}
                        </td>
                        <td className="py-1 text-center tabular-nums">
                          {r.won}
                        </td>
                        <td className="py-1 text-center tabular-nums">
                          {r.drawn}
                        </td>
                        <td className="py-1 text-center tabular-nums">
                          {r.lost}
                        </td>
                        <td className="py-1 text-center tabular-nums">
                          {r.goalsFor - r.goalsAgainst}
                        </td>
                        <td className="py-1 text-center font-semibold tabular-nums">
                          {r.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
