"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleDot,
  CircleStop,
  Flag,
  FlaskConical,
  Gauge,
  Goal,
  Hand,
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Trophy,
  TriangleAlert,
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
import type {
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
import { getTeam, type Player, type Team, TEAMS } from "~/lib/teams";

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
}

const ZERO_STAT: ThreadStat = {
  lastHitRate: 0,
  cumulativeHitRate: 0,
  promptTokens: 0,
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
  };
}

function reduce(state: MatchState, event: OrchestratorEvent): MatchState {
  switch (event.type) {
    case "phase":
      return { ...state, phase: event.phase };
    case "lineup":
      return event.thread === "home-manager"
        ? { ...state, homeLineup: event.lineup }
        : { ...state, awayLineup: event.lineup };
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
        referee: [...state.referee, { minute: event.minute, verdict: event.verdict }],
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
          },
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
  const [homeId, setHomeId] = useState("bra");
  const [awayId, setAwayId] = useState("fra");
  const [mode, setMode] = useState<Mode>("mock");
  const [maxMinutes, setMaxMinutes] = useState(90);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<MatchState>(initialState);
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const kickoff = useCallback(async () => {
    if (homeId === awayId || running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState(initialState());
    setRunning(true);

    try {
      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ homeId, awayId, mode, maxMinutes }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const detail = (await res.json().catch(() => null)) as { error?: string } | null;
        setState((s) => ({ ...s, error: detail?.error ?? `Request failed (${res.status})` }));
        return;
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
    } catch (err) {
      if (!controller.signal.aborted) {
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
      }
    } finally {
      setRunning(false);
      void loadStandings();
    }
  }, [homeId, awayId, mode, maxMinutes, running, loadStandings]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Keep the commentary feed pinned to the latest line.
  useEffect(() => {
    const vp = scrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    vp?.scrollTo({ top: vp.scrollHeight, behavior: "smooth" });
  }, [state.minutes.length, state.referee.length]);

  const home = getTeam(homeId);
  const away = getTeam(awayId);
  const finished = state.phase === "fulltime" || state.phase === "stopped";
  const abandoned = state.result?.abandoned ?? state.phase === "stopped";
  const clock = state.minutes.at(-1)?.minute ?? 0;
  const started = state.minutes.length > 0 || state.phase !== "idle";

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <FlaskConical className="size-5" />
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight">
              Agent <span className="text-primary">Playground</span>
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Four sim-agent sessions play out a match — each manager picks a
            lineup, the match agent decides every minute, and the referee can
            stop play. Every thread keeps its own cache-stable prefix.
          </p>
        </header>

        {state.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
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
          />

          <Card className="overflow-hidden pt-0">
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
                homeId={homeId}
                awayId={awayId}
                onHome={setHomeId}
                onAway={setAwayId}
                mode={mode}
                onMode={setMode}
                maxMinutes={maxMinutes}
                onMaxMinutes={setMaxMinutes}
                running={running}
                started={started}
                onKickoff={() => void kickoff()}
                matchStat={state.cache.match}
                refStat={state.cache.referee}
              />

              {mode === "live" && (
                <p className="text-xs text-muted-foreground">
                  Live mode calls DeepSeek once per minute — keep the minute count
                  low and set{" "}
                  <code className="rounded bg-muted px-1">DEEPSEEK_API_KEY</code>.
                </p>
              )}

              <Commentary
                scrollRef={scrollRef}
                minutes={state.minutes}
                referee={state.referee}
                finished={finished}
                abandoned={abandoned}
                home={home}
                away={away}
              />
            </CardContent>
          </Card>

          <ManagerPanel
            team={away}
            side="away"
            lineup={state.awayLineup}
            stat={state.cache["away-manager"]}
            minutes={state.minutes}
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
    <CardHeader className="pitch-stripes border-b py-5 [.border-b]:pb-5">
      <div className="flex items-center justify-between gap-2">
        <TeamBadge team={home} />
        <div className="flex flex-col items-center px-2">
          <div className="text-5xl font-extrabold tabular-nums tracking-tight drop-shadow">
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
      <span className="text-4xl drop-shadow-md">{team.flag}</span>
      <span className="truncate text-sm font-semibold text-white">{team.name}</span>
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
  homeId,
  awayId,
  onHome,
  onAway,
  mode,
  onMode,
  maxMinutes,
  onMaxMinutes,
  running,
  started,
  onKickoff,
  matchStat,
  refStat,
}: {
  homeId: string;
  awayId: string;
  onHome: (id: string) => void;
  onAway: (id: string) => void;
  mode: Mode;
  onMode: (m: Mode) => void;
  maxMinutes: number;
  onMaxMinutes: (n: number) => void;
  running: boolean;
  started: boolean;
  onKickoff: () => void;
  matchStat: ThreadStat;
  refStat: ThreadStat;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <TeamPicker label="Home" value={homeId} exclude={awayId} onChange={onHome} disabled={running} />
        <TeamPicker label="Away" value={awayId} exclude={homeId} onChange={onAway} disabled={running} />

        <Field label="Mode">
          <div className="flex h-9 overflow-hidden rounded-md border">
            {(["mock", "live"] as const).map((m) => (
              <button
                key={m}
                onClick={() => onMode(m)}
                disabled={running}
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
        </Field>

        <Field label="Minutes">
          <input
            type="number"
            min={1}
            max={90}
            value={maxMinutes}
            disabled={running}
            onChange={(e) => onMaxMinutes(Math.min(90, Math.max(1, Number(e.target.value) || 1)))}
            className="h-9 w-16 rounded-md border bg-background px-2 text-sm"
          />
        </Field>

        <Button onClick={onKickoff} disabled={running || homeId === awayId} className="ml-auto font-semibold">
          {started ? <RotateCcw className="size-4" /> : <Play className="size-4" />}
          {running ? "Playing…" : started ? "Replay" : "Kick Off"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Threads:</span>
        <CacheBadge label="match" stat={matchStat} />
        <CacheBadge label="referee" stat={refStat} />
      </div>
    </div>
  );
}

// --- commentary feed (match minutes + referee, woven together) --------------

type FeedItem =
  | { kind: "marker"; minute: number; text: string; icon: React.ReactNode; emphasis: string }
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
    icon: <Flag className="size-4 text-muted-foreground" />,
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
        <CircleStop className="size-4 text-destructive" />
      ) : (
        <Trophy className="size-4 text-primary" />
      ),
      emphasis: "bg-muted/60 font-medium",
    });
  }
  return items;
}

const EVENT_ICON: Record<MinuteOutcome["event"], React.ReactNode> = {
  none: <CircleDot className="size-4 text-muted-foreground" />,
  goal: <Goal className="size-4 text-primary" />,
  save: <Hand className="size-4 text-sky-400" />,
  miss: <CircleDot className="size-4 text-muted-foreground" />,
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
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  minutes: MinuteRow[];
  referee: { minute: number; verdict: RefereeVerdict }[];
  finished: boolean;
  abandoned: boolean;
  home: Team;
  away: Team;
}) {
  const items = buildFeed(minutes, referee, finished, abandoned, home, away);
  const empty = minutes.length === 0 && referee.length === 0;

  return (
    <ScrollArea ref={scrollRef} className="h-[26rem] rounded-xl border bg-background/40">
      <div className="flex flex-col gap-1.5 p-3">
        {empty ? (
          <p className="py-32 text-center text-sm text-muted-foreground">
            Pick a fixture and hit{" "}
            <span className="font-semibold text-foreground">Kick Off</span> to
            watch the agents play.
          </p>
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
      <CircleStop className="size-4 text-destructive" />
    ) : (
      <ShieldCheck className="size-4 text-emerald-500" />
    );
    text = `Referee — ${item.verdict.reason}`;
    emphasis = stop ? "bg-destructive/10 ring-1 ring-destructive/30" : "text-muted-foreground hover:bg-muted/40";
  } else {
    icon = EVENT_ICON[item.outcome.event];
    text = item.outcome.text;
    emphasis = item.outcome.event === "goal" ? "bg-primary/15 ring-1 ring-primary/30 font-semibold" : "hover:bg-muted/40";
  }

  return (
    <div className={`flex items-start gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${emphasis}`}>
      <span className="w-7 shrink-0 pt-0.5 text-right text-xs font-medium tabular-nums text-muted-foreground">
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
}: {
  team: Team;
  side: "home" | "away";
  lineup: Lineup | null;
  stat: ThreadStat;
  minutes: MinuteRow[];
}) {
  const positions: Player["position"][] = ["GK", "DF", "MF", "FW"];
  const sideEvents = minutes.filter((m) => m.outcome.side === side);
  const shots = sideEvents.filter(
    (m) => m.outcome.event === "goal" || m.outcome.event === "save" || m.outcome.event === "miss",
  ).length;
  const onTarget = sideEvents.filter(
    (m) => m.outcome.event === "goal" || m.outcome.event === "save",
  ).length;

  return (
    <Card className="overflow-hidden pt-0">
      <div className="h-1.5 w-full" style={{ backgroundColor: team.colors.primary }} />
      <CardHeader className="pt-5">
        <div className="flex items-center gap-3">
          <span className="text-5xl drop-shadow">{team.flag}</span>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-xl">{team.name}</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">{team.manager}</p>
          </div>
          <CacheBadge label="mgr" stat={stat} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge>Rating {team.rating}</Badge>
          <Badge variant="secondary">{lineup?.formation ?? team.formation}</Badge>
          {lineup ? (
            <Badge variant="outline" className="capitalize">
              {lineup.tactic}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              selecting…
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Shots" value={shots} />
          <Stat label="On Target" value={onTarget} />
        </div>

        <Separator />

        <div>
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Starting XI
            {lineup && (
              <span className="font-medium normal-case text-primary">★ {lineup.keyPlayer}</span>
            )}
          </h3>
          <ul className="flex flex-col gap-0.5">
            {positions.flatMap((pos) =>
              team.squad
                .filter((p) => p.position === pos)
                .map((p) => {
                  const isKey = lineup?.keyPlayer === p.name;
                  return (
                    <li
                      key={`${team.id}-${p.number}`}
                      className={`flex items-center gap-3 rounded-md px-1.5 py-1 text-sm ${
                        isKey ? "bg-primary/10" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums">
                        {p.number}
                      </span>
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-xs font-medium text-muted-foreground">{p.position}</span>
                    </li>
                  );
                }),
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

// --- shared bits ------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function TeamPicker({
  label,
  value,
  exclude,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  exclude: string;
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <Field label={label}>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
      >
        <SelectTrigger className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TEAMS.map((t) => (
            <SelectItem key={t.id} value={t.id} disabled={t.id === exclude}>
              {t.flag} {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function CacheBadge({ label, stat }: { label: string; stat: ThreadStat }) {
  if (stat.promptTokens === 0) return null;
  const pct = Math.round(stat.cumulativeHitRate * 100);
  return (
    <Badge variant="secondary" className="gap-1 font-mono text-[11px]">
      <Gauge className="size-3" /> {label} {pct}%
    </Badge>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
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
        <div className="text-center text-2xl font-bold tabular-nums">
          {result.homeName} {result.score.home} – {result.score.away} {result.awayName}
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
              .map((c) => `${c.card === "red" ? "🟥" : "🟨"} ${c.player} ${c.minute}'`)
              .join(", ")}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Played {result.minutesPlayed}&apos; · stored for the standings below.
        </p>
      </CardContent>
    </Card>
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
          <span className="text-muted-foreground">({resultCount} matches played)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        {standings.map((g) => (
          <div key={g.group}>
            <h3 className="mb-2 text-sm font-semibold">{g.group}</h3>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
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
                      <td className="py-1">
                        {team.flag} {team.name}
                      </td>
                      <td className="py-1 text-center tabular-nums">{r.played}</td>
                      <td className="py-1 text-center tabular-nums">{r.won}</td>
                      <td className="py-1 text-center tabular-nums">{r.drawn}</td>
                      <td className="py-1 text-center tabular-nums">{r.lost}</td>
                      <td className="py-1 text-center tabular-nums">{r.goalsFor - r.goalsAgainst}</td>
                      <td className="py-1 text-center font-semibold tabular-nums">{r.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
