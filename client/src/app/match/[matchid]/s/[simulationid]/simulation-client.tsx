"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BotIcon,
  CircleStopIcon,
  ClockIcon,
  GoalIcon,
  PlayIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ScrollArea } from "~/components/ui/scroll-area";
import type {
  MatchResult,
  MinuteOutcome,
  OrchestratorEvent,
  Thread,
} from "~/lib/playground-types";
import type { Team } from "~/lib/teams";

interface MinuteRow {
  minute: number;
  outcome: MinuteOutcome;
  score: { home: number; away: number };
}

interface AssistantTurn {
  thread: Thread;
  prompt: string;
  response: string;
}

interface SimulationState {
  phase: string;
  score: { home: number; away: number };
  minutes: MinuteRow[];
  assistants: AssistantTurn[];
  result: MatchResult | null;
  error: string | null;
}

const INITIAL_STATE: SimulationState = {
  phase: "idle",
  score: { home: 0, away: 0 },
  minutes: [],
  assistants: [],
  result: null,
  error: null,
};

function reduceSimulation(
  state: SimulationState,
  event: OrchestratorEvent,
): SimulationState {
  switch (event.type) {
    case "phase":
      return { ...state, phase: event.phase };
    case "agent_prompt":
      return {
        ...state,
        assistants: [
          ...state.assistants,
          { thread: event.thread, prompt: event.prompt, response: "" },
        ],
      };
    case "agent_delta":
      return {
        ...state,
        assistants: state.assistants.map((turn, index) =>
          index === state.assistants.length - 1 &&
          turn.thread === event.thread
            ? { ...turn, response: turn.response + event.delta }
            : turn,
        ),
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
    case "result":
      return { ...state, result: event.result, score: event.result.score };
    case "error":
      return { ...state, error: event.message };
    default:
      return state;
  }
}

export function SimulationClient({
  simulationId,
  home,
  away,
}: {
  simulationId: string;
  home: Team;
  away: Team;
}) {
  const [state, setState] = useState(INITIAL_STATE);
  const [running, setRunning] = useState(true);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const controller = new AbortController();

    async function run() {
      setRunning(true);
      setState(INITIAL_STATE);
      try {
        const res = await fetch(`/api/simulations/${simulationId}/stream`, {
          method: "POST",
          signal: controller.signal,
        });
        await readEventStream(res, (event) => {
          setState((current) => reduceSimulation(current, event));
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          setState((current) => ({
            ...current,
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setRunning(false);
        }
      }
    }

    void run();
    return () => controller.abort();
  }, [simulationId]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [state.minutes.length, state.assistants.length]);

  const lastMinute = state.minutes.at(-1)?.minute ?? 0;
  const status = useMemo(() => {
    if (state.result) return state.result.abandoned ? "Stopped" : "Full time";
    if (state.error) return "Error";
    if (running) return state.phase === "idle" ? "Starting" : state.phase;
    return "Ready";
  }, [running, state.error, state.phase, state.result]);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="grid gap-4 p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant={state.error ? "destructive" : "secondary"}>
                {status}
              </Badge>
              <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <ClockIcon className="size-4" />
                {lastMinute} min
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <ScoreTeam team={home} />
              <div className="flex items-center gap-3 text-4xl font-black tabular-nums sm:text-5xl">
                <span>{state.score.home}</span>
                <span className="text-muted-foreground text-2xl">-</span>
                <span>{state.score.away}</span>
              </div>
              <ScoreTeam team={away} align="right" />
            </div>

            {state.error && (
              <div className="border-destructive/40 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                {state.error}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <GoalIcon className="size-4" />
              Match feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea ref={scrollRef} className="h-[440px] pr-3">
              <div className="space-y-3">
                {state.minutes.length === 0 ? (
                  <EmptyLine
                    icon={running ? PlayIcon : CircleStopIcon}
                    text={running ? "Waiting for kickoff..." : "No events yet."}
                  />
                ) : (
                  state.minutes.map((row) => (
                    <div
                      key={row.minute}
                      className="border-border/70 rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant="outline">{row.minute} min</Badge>
                        <span className="text-sm font-semibold tabular-nums">
                          {row.score.home}-{row.score.away}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6">{row.outcome.text}</p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BotIcon className="size-4" />
            Assistants
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[590px] pr-3">
            <div className="space-y-3">
              {state.assistants.length === 0 ? (
                <EmptyLine icon={BotIcon} text="Assistant activity will appear here." />
              ) : (
                state.assistants.slice(-24).map((turn, index) => (
                  <div
                    key={`${turn.thread}-${index}`}
                    className="bg-muted/35 rounded-lg p-3"
                  >
                    <Badge variant="outline" className="mb-2">
                      {turn.thread}
                    </Badge>
                    <p className="text-muted-foreground line-clamp-2 text-xs">
                      {turn.prompt}
                    </p>
                    <p className="mt-2 text-sm leading-6">
                      {turn.response || "..."}
                    </p>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {state.result && (
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Result archive</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              {state.result.homeName} {state.result.score.home} -{" "}
              {state.result.score.away} {state.result.awayName}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => location.reload()}
            >
              <RotateCcwIcon />
              Replay
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function readEventStream(
  res: Response,
  onEvent: (event: OrchestratorEvent) => void,
) {
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
    let frameEnd: number;
    while ((frameEnd = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, frameEnd);
      buffer = buffer.slice(frameEnd + 2);
      const line = frame.trim();
      if (!line.startsWith("data:")) continue;
      onEvent(JSON.parse(line.slice(5).trim()) as OrchestratorEvent);
    }
  }
}

function ScoreTeam({
  team,
  align = "left",
}: {
  team: Team;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`flex min-w-0 items-center gap-3 ${
        align === "right" ? "justify-end text-right" : ""
      }`}
    >
      {align === "left" && (
        <span className="bg-muted hidden size-10 items-center justify-center rounded-lg border text-2xl sm:flex">
          {team.flag}
        </span>
      )}
      <div className="min-w-0">
        <div className="truncate text-lg font-bold sm:text-2xl">{team.name}</div>
        <div className="text-muted-foreground text-xs sm:text-sm">
          {team.rating}
        </div>
      </div>
      {align === "right" && (
        <span className="bg-muted hidden size-10 items-center justify-center rounded-lg border text-2xl sm:flex">
          {team.flag}
        </span>
      )}
    </div>
  );
}

function EmptyLine({
  icon: Icon,
  text,
}: {
  icon: typeof PlayIcon;
  text: string;
}) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
      <Icon className="size-4" />
      {text}
    </div>
  );
}
