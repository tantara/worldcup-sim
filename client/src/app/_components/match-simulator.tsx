"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleDot,
  Flag,
  Goal,
  Hand,
  Play,
  RotateCcw,
  ShieldX,
  Timer,
  TriangleAlert,
  Trophy,
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
import {
  simulateMatch,
  type MatchEvent,
  type MatchEventType,
  type Side,
} from "~/lib/match-engine";
import type { Player, Team } from "~/lib/teams";

const SPEEDS = {
  slow: { label: "Slow", ms: 1100 },
  normal: { label: "Normal", ms: 650 },
  fast: { label: "Fast", ms: 300 },
} as const;
type SpeedKey = keyof typeof SPEEDS;

export function MatchSimulator({ home, away }: { home: Team; away: Team }) {
  const [speed, setSpeed] = useState<SpeedKey>("normal");

  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [revealed, setRevealed] = useState(0);
  const [playing, setPlaying] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Reveal one event at a time while playing.
  useEffect(() => {
    if (!playing) return;
    if (revealed >= events.length) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setRevealed((n) => n + 1), SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [playing, revealed, events.length, speed]);

  // Keep the commentary feed pinned to the latest line.
  useEffect(() => {
    const vp = scrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    vp?.scrollTo({ top: vp.scrollHeight, behavior: "smooth" });
  }, [revealed]);

  const shown = events.slice(0, revealed);
  const last = shown[shown.length - 1];
  const score = last?.score ?? { home: 0, away: 0 };
  const clock = last?.minute ?? 0;
  const finished = revealed >= events.length && events.length > 0;

  const kickOff = () => {
    const result = simulateMatch(home, away);
    setEvents(result.events);
    setRevealed(0);
    setPlaying(true);
  };

  return (
    <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)_minmax(0,1fr)]">
      <TeamPanel team={home} side="home" shown={shown} />

      <Card className="order-first overflow-hidden pt-0 lg:order-none">
        <Scoreboard
          home={home}
          away={away}
          score={score}
          clock={clock}
          playing={playing}
          finished={finished}
        />

        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:flex sm:flex-wrap">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium">
                Speed
              </span>
              <Select
                value={speed}
                onValueChange={(v) => {
                  if (v) setSpeed(v);
                }}
              >
                <SelectTrigger className="w-full sm:w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SPEEDS).map(([key, s]) => (
                    <SelectItem key={key} value={key}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={kickOff}
              disabled={playing}
              className="w-full font-semibold sm:ml-auto sm:w-auto"
            >
              {events.length === 0 ? (
                <>
                  <Play className="size-4" /> Kick Off
                </>
              ) : (
                <>
                  <RotateCcw className="size-4" /> Replay
                </>
              )}
            </Button>
          </div>

          <Commentary scrollRef={scrollRef} events={shown} />
        </CardContent>
      </Card>

      <TeamPanel team={away} side="away" shown={shown} />
    </div>
  );
}

function Scoreboard({
  home,
  away,
  score,
  clock,
  playing,
  finished,
}: {
  home: Team;
  away: Team;
  score: { home: number; away: number };
  clock: number;
  playing: boolean;
  finished: boolean;
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
          <ClockPill clock={clock} playing={playing} finished={finished} />
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
}: {
  clock: number;
  playing: boolean;
  finished: boolean;
}) {
  const label = finished ? "FULL TIME" : clock > 0 ? `${clock}'` : "—";
  return (
    <div className="mt-1.5 flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1 text-xs font-semibold text-white">
      {playing && !finished && (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
        </span>
      )}
      <span className="tabular-nums">{label}</span>
    </div>
  );
}

const EVENT_ICON: Record<MatchEventType, React.ReactNode> = {
  goal: <Goal className="text-primary size-4" />,
  save: <Hand className="size-4 text-sky-400" />,
  miss: <CircleDot className="text-muted-foreground size-4" />,
  chance: <CircleDot className="text-muted-foreground size-4" />,
  foul: <TriangleAlert className="size-4 text-amber-400" />,
  yellow: <span className="block h-3.5 w-2.5 rounded-[2px] bg-yellow-400" />,
  red: <ShieldX className="size-4 text-red-500" />,
  kickoff: <Flag className="text-muted-foreground size-4" />,
  halftime: <Timer className="text-muted-foreground size-4" />,
  fulltime: <Trophy className="text-primary size-4" />,
  info: <CircleDot className="text-muted-foreground size-4" />,
};

function Commentary({
  events,
  scrollRef,
}: {
  events: MatchEvent[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <ScrollArea
      ref={scrollRef}
      className="bg-background/40 h-[22rem] rounded-xl border sm:h-[26rem]"
    >
      <div className="flex flex-col gap-1.5 p-3">
        {events.length === 0 ? (
          <p className="text-muted-foreground py-24 text-center text-sm sm:py-32">
            Pick two nations and hit{" "}
            <span className="text-foreground font-semibold">Kick Off</span> to
            start the match.
          </p>
        ) : (
          events.map((e) => <CommentaryLine key={e.id} event={e} />)
        )}
      </div>
    </ScrollArea>
  );
}

function CommentaryLine({ event }: { event: MatchEvent }) {
  const emphasis =
    event.type === "goal"
      ? "bg-primary/15 ring-1 ring-primary/30"
      : event.type === "fulltime" ||
          event.type === "halftime" ||
          event.type === "kickoff"
        ? "bg-muted/60 font-medium"
        : "hover:bg-muted/40";

  return (
    <div
      className={`flex items-start gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors ${emphasis}`}
    >
      <span className="text-muted-foreground w-7 shrink-0 pt-0.5 text-right text-xs font-medium tabular-nums">
        {event.minute}&apos;
      </span>
      <span className="mt-0.5 shrink-0">{EVENT_ICON[event.type]}</span>
      <span className="leading-snug">{event.text}</span>
    </div>
  );
}

function TeamPanel({
  team,
  side,
  shown,
}: {
  team: Team;
  side: Side;
  shown: MatchEvent[];
}) {
  const positions: Player["position"][] = ["GK", "DF", "MF", "FW"];
  const shots = shown.filter(
    (e) =>
      e.side === side &&
      (e.type === "goal" ||
        e.type === "save" ||
        e.type === "miss" ||
        e.type === "chance"),
  ).length;
  const onTarget = shown.filter(
    (e) => e.side === side && (e.type === "goal" || e.type === "save"),
  ).length;

  return (
    <Card className="overflow-hidden pt-0">
      <div
        className="h-1.5 w-full"
        style={{ backgroundColor: team.colors.primary }}
      />
      <CardHeader className="pt-5">
        <div className="flex items-center gap-3">
          <span className="text-4xl drop-shadow sm:text-5xl">{team.flag}</span>
          <div className="min-w-0">
            <CardTitle className="truncate text-xl">{team.name}</CardTitle>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {team.manager}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge>Rating {team.rating}</Badge>
          <Badge variant="secondary">{team.formation}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Shots" value={shots} />
          <Stat label="On Target" value={onTarget} />
        </div>

        <Separator />

        <div>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Starting XI
          </h3>
          <ul className="flex flex-col gap-0.5">
            {positions.flatMap((pos) =>
              team.squad
                .filter((p) => p.position === pos)
                .map((p) => (
                  <li
                    key={`${team.id}-${p.number}`}
                    className="hover:bg-muted/50 flex items-center gap-3 rounded-md px-1.5 py-1 text-sm"
                  >
                    <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold tabular-nums">
                      {p.number}
                    </span>
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="text-muted-foreground text-xs font-medium">
                      {p.position}
                    </span>
                  </li>
                )),
            )}
          </ul>
        </div>
      </CardContent>
    </Card>
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
