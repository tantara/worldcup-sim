import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin } from "lucide-react";

import { MatchSimulator } from "~/app/_components/match-simulator";
import { Badge } from "~/components/ui/badge";
import { getTeam } from "~/lib/teams";
import { getMatch, TOURNAMENT } from "~/lib/tournament";

export function generateStaticParams() {
  return TOURNAMENT.map((m) => ({ matchid: m.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchid: string }>;
}) {
  const { matchid } = await params;
  const match = getMatch(matchid);
  if (!match) return { title: "Match not found" };
  const home = getTeam(match.homeId);
  const away = getTeam(match.awayId);
  return { title: `${home.name} vs ${away.name} · World Cup Simulator` };
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ matchid: string }>;
}) {
  const { matchid } = await params;
  const match = getMatch(matchid);
  if (!match) notFound();

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            All fixtures
          </Link>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{match.stage}</Badge>
            <Badge variant="outline">Matchday {match.matchday}</Badge>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {match.kickoff}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {match.venue}
            </span>
          </div>
        </div>

        <MatchSimulator homeId={match.homeId} awayId={match.awayId} />
      </div>
    </main>
  );
}
