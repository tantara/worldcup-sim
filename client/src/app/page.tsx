import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Trophy } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Card } from "~/components/ui/card";
import { getTeam } from "~/lib/teams";
import { getSchedule, type Match } from "~/lib/tournament";

export default function Home() {
  const schedule = getSchedule();

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 py-10">
        <header className="flex flex-col items-center text-center">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
            <Trophy className="size-6" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            World Cup <span className="text-primary">Simulator</span>
          </h1>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Choose a fixture to simulate the match, minute by minute, with live
            text commentary.
          </p>
        </header>

        {schedule.map(({ stage, matches }) => (
          <section key={stage} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{stage}</h2>
              <Badge variant="secondary">{matches.length} matches</Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {matches.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function MatchCard({ match }: { match: Match }) {
  const home = getTeam(match.homeId);
  const away = getTeam(match.awayId);

  return (
    <Link href={`/match/${match.id}`} className="group block">
      <Card className="gap-0 p-4 transition-colors hover:border-primary/50 hover:bg-accent/40">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            Matchday {match.matchday} · {match.kickoff}
          </span>
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-1 items-center gap-2">
            <span className="text-2xl">{home.flag}</span>
            <span className="truncate font-semibold">{home.name}</span>
          </div>
          <span className="shrink-0 text-xs font-bold text-muted-foreground">
            VS
          </span>
          <div className="flex flex-1 items-center justify-end gap-2">
            <span className="truncate text-right font-semibold">
              {away.name}
            </span>
            <span className="text-2xl">{away.flag}</span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="size-3.5" />
          {match.venue}
        </div>
      </Card>
    </Link>
  );
}
