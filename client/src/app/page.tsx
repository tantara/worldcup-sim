import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Trophy } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { GROUP_LETTERS, teamsInGroup, type Team } from "~/lib/teams";
import {
  groupStageSchedule,
  HOSTS,
  knockoutSchedule,
  matchId,
  resolveMatch,
  TOURNAMENT_DATES,
  type Match,
} from "~/lib/tournament";

export default function Home() {
  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10">
        <header className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Trophy className="size-6" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            2026 World Cup{" "}
            <span className="text-primary">Simulator</span>
          </h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            48 nations · 12 groups · hosted by {HOSTS.join(", ")} · {" "}
            {TOURNAMENT_DATES}. Pick any group-stage fixture and simulate it
            minute by minute.
          </p>
        </header>

        <Tabs defaultValue="groups" className="gap-6">
          <TabsList className="mx-auto">
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          <TabsContent value="groups">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {GROUP_LETTERS.map((letter) => (
                <GroupCard
                  key={letter}
                  letter={letter}
                  teams={teamsInGroup(letter)}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="flex flex-col gap-8">
            {groupStageSchedule().map(({ group, matches }) => (
              <ScheduleSection key={group} title={`Group ${group}`} matches={matches} />
            ))}
            {knockoutSchedule().map(({ round, matches }) => (
              <ScheduleSection key={round} title={round} matches={matches} />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function GroupCard({ letter, teams }: { letter: string; teams: Team[] }) {
  return (
    <Card className="gap-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-sm font-bold text-primary">
            {letter}
          </span>
          Group {letter}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {teams.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 border-t border-border/60 py-2 first:border-t-0 text-sm"
          >
            <span className="text-xl">{t.flag}</span>
            <span className="flex-1 truncate font-medium">{t.name}</span>
            <span className="text-xs text-muted-foreground">
              {t.confederation}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ScheduleSection({
  title,
  matches,
}: {
  title: string;
  matches: Match[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <Badge variant="secondary">{matches.length}</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {matches.map((m) => (
          <MatchCard key={m.match} match={m} />
        ))}
      </div>
    </section>
  );
}

function MatchCard({ match }: { match: Match }) {
  const { home, away, playable } = resolveMatch(match);

  const body = (
    <Card
      className={`gap-0 p-4 transition-colors ${
        playable
          ? "group hover:border-primary/50 hover:bg-accent/40"
          : "opacity-70"
      }`}
    >
      <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5" />
          {match.date}
          {match.kickoff_local ? ` · ${match.kickoff_local}` : ""}
        </span>
        {playable ? (
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        ) : (
          <span className="text-[10px] font-semibold tracking-wide uppercase">
            TBD
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <span className="text-2xl">{home?.flag ?? "🏟️"}</span>
          <span className="truncate font-semibold">{match.home}</span>
        </div>
        <span className="shrink-0 text-xs font-bold text-muted-foreground">
          VS
        </span>
        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="truncate text-right font-semibold">{match.away}</span>
          <span className="text-2xl">{away?.flag ?? "🏟️"}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="size-3.5" />
        {match.venue}, {match.city}
      </div>
    </Card>
  );

  if (!playable) return body;
  return (
    <Link href={`/match/${matchId(match)}`} className="block">
      {body}
    </Link>
  );
}
