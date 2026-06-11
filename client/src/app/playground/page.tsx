"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  CircleStop,
  Flag,
  FlaskConical,
  Gauge,
  Play,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
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
import { getTeam, TEAMS } from "~/lib/teams";

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
        minutes: [...state.minutes, { minute: event.minute, outcome: event.outcome, score: event.score }],
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

  const home = getTeam(homeId);
  const away = getTeam(awayId);

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <header className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <FlaskConical className="size-6" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Agent <span className="text-primary">Playground</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Four sim-agent sessions play out a match: two managers pick lineups,
            the match agent decides every minute, and the referee can stop play.
            Each thread keeps its own cache-stable prefix.
          </p>
        </header>

        {/* controls */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-4 pt-6">
            <TeamPicker label="Home" value={homeId} onChange={setHomeId} />
            <span className="pb-2 text-muted-foreground">vs</span>
            <TeamPicker label="Away" value={awayId} onChange={setAwayId} />

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Mode</label>
              <div className="flex overflow-hidden rounded-md border">
                {(["mock", "live"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    disabled={running}
                    className={`px-3 py-1.5 text-sm capitalize transition ${
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

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Minutes</label>
              <input
                type="number"
                min={1}
                max={90}
                value={maxMinutes}
                disabled={running}
                onChange={(e) =>
                  setMaxMinutes(Math.min(90, Math.max(1, Number(e.target.value) || 1)))
                }
                className="h-9 w-20 rounded-md border bg-background px-2 text-sm"
              />
            </div>

            <Button onClick={() => void kickoff()} disabled={running || homeId === awayId}>
              <Play className="size-4" />
              {running ? "Playing…" : "Kick off"}
            </Button>
          </CardContent>
        </Card>

        {mode === "live" && (
          <p className="-mt-3 text-center text-xs text-muted-foreground">
            Live mode calls DeepSeek once per minute — set a low minute count and
            ensure <code className="rounded bg-muted px-1">DEEPSEEK_API_KEY</code> is set.
          </p>
        )}

        {state.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {state.error}
          </div>
        )}

        {/* four threads */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* main: match feed */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-primary" /> Match
              </CardTitle>
              <CacheBadge stat={state.cache.match} />
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center justify-center gap-4 text-2xl font-bold">
                <span>{home.flag} {home.name}</span>
                <span className="rounded-md bg-muted px-3 py-1 tabular-nums">
                  {state.score.home} – {state.score.away}
                </span>
                <span>{away.name} {away.flag}</span>
              </div>
              <PhasePill phase={state.phase} running={running} />
              <Separator className="my-3" />
              <ScrollArea className="h-72 pr-3">
                <MatchFeed minutes={state.minutes} />
              </ScrollArea>
            </CardContent>
          </Card>

          {/* referee */}
          <ThreadCard
            title="Referee"
            icon={<Flag className="size-4 text-amber-500" />}
            stat={state.cache.referee}
          >
            {state.referee.length === 0 ? (
              <Empty>No referee checks yet.</Empty>
            ) : (
              <ScrollArea className="h-72 pr-3">
                <ul className="flex flex-col gap-2 text-sm">
                  {state.referee.map((r, i) => (
                    <li key={i} className="flex items-start gap-2">
                      {r.verdict.decision === "stop" ? (
                        <CircleStop className="mt-0.5 size-4 shrink-0 text-destructive" />
                      ) : (
                        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                      )}
                      <span>
                        <span className="font-medium tabular-nums">{r.minute}&apos;</span>{" "}
                        {r.verdict.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </ThreadCard>
        </div>

        {/* managers */}
        <div className="grid gap-4 md:grid-cols-2">
          <ManagerCard
            teamLabel={`${home.flag} ${home.name}`}
            lineup={state.homeLineup}
            stat={state.cache["home-manager"]}
          />
          <ManagerCard
            teamLabel={`${away.flag} ${away.name}`}
            lineup={state.awayLineup}
            stat={state.cache["away-manager"]}
          />
        </div>

        {/* result */}
        {state.result && <ResultCard result={state.result} />}

        {/* standings fed by completed matches */}
        {standings && standings.results.length > 0 && (
          <StandingsView standings={standings.standings} resultCount={standings.results.length} />
        )}
      </div>
    </main>
  );
}

// --- sub-components ----------------------------------------------------------

function TeamPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v) onChange(v);
        }}
      >
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TEAMS.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.flag} {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CacheBadge({ stat }: { stat: ThreadStat }) {
  if (stat.promptTokens === 0) return null;
  const pct = Math.round(stat.cumulativeHitRate * 100);
  return (
    <Badge variant="secondary" className="gap-1 font-mono">
      <Gauge className="size-3" /> {pct}% cache
    </Badge>
  );
}

function PhasePill({ phase, running }: { phase: string; running: boolean }) {
  const label =
    phase === "idle"
      ? "Ready"
      : phase === "play"
        ? running
          ? "In play"
          : "Paused"
        : phase.charAt(0).toUpperCase() + phase.slice(1);
  return (
    <div className="flex justify-center">
      <Badge variant="outline" className="capitalize">{label}</Badge>
    </div>
  );
}

function MatchFeed({ minutes }: { minutes: MinuteRow[] }) {
  const notable = minutes.filter((m) => m.outcome.event !== "none");
  if (notable.length === 0) {
    return <Empty>Kick off to see the match unfold.</Empty>;
  }
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {notable.map((m, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="w-8 shrink-0 text-right font-mono text-muted-foreground tabular-nums">
            {m.minute}&apos;
          </span>
          <span className={m.outcome.event === "goal" ? "font-semibold" : ""}>
            {m.outcome.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ThreadCard({
  title,
  icon,
  stat,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  stat: ThreadStat;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">{icon} {title}</CardTitle>
        <CacheBadge stat={stat} />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ManagerCard({
  teamLabel,
  lineup,
  stat,
}: {
  teamLabel: string;
  lineup: Lineup | null;
  stat: ThreadStat;
}) {
  return (
    <ThreadCard
      title={`${teamLabel} — manager`}
      icon={<Users className="size-4 text-sky-500" />}
      stat={stat}
    >
      {!lineup ? (
        <Empty>Waiting for team selection…</Empty>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{lineup.formation}</Badge>
            <Badge variant="secondary" className="capitalize">{lineup.tactic}</Badge>
            <Badge className="gap-1">★ {lineup.keyPlayer}</Badge>
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
            {lineup.lineup.map((p, i) => (
              <li key={i} className="truncate">{p}</li>
            ))}
          </ul>
        </div>
      )}
    </ThreadCard>
  );
}

function ResultCard({ result }: { result: MatchResult }) {
  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Full time{result.abandoned ? " (abandoned)" : ""}</span>
          <Badge variant="outline" className="capitalize">{result.mode}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="text-center text-2xl font-bold tabular-nums">
          {result.homeName} {result.score.home} – {result.score.away} {result.awayName}
        </div>
        {result.scorers.length > 0 && (
          <div>
            <span className="font-medium">Scorers: </span>
            {result.scorers
              .map((s) => `${s.player} ${s.minute}'`)
              .join(", ")}
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
          Standings <span className="text-muted-foreground">({resultCount} matches played)</span>
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
                      <td className="py-1">{team.flag} {team.name}</td>
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

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>
  );
}
