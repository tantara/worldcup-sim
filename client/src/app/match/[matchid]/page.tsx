import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, Clock, MapPin } from "lucide-react";

import { MatchSimulator } from "~/app/_components/match-simulator";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { getMatch, MATCHES, resolveMatch } from "~/lib/tournament";

export function generateStaticParams() {
  return MATCHES.map((m) => ({ matchid: String(m.match) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchid: string }>;
}) {
  const { matchid } = await params;
  const match = getMatch(matchid);
  if (!match) return { title: "Match not found" };
  return { title: `${match.home} vs ${match.away} · World Cup Simulator` };
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ matchid: string }>;
}) {
  const { matchid } = await params;
  const match = getMatch(matchid);
  if (!match) notFound();

  const { home, away, playable } = resolveMatch(match);

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8">
        <div className="flex flex-col gap-3">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" />
            All fixtures
          </Link>
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Badge variant="secondary">
              {match.group ? `Group ${match.group}` : match.round}
            </Badge>
            <Badge variant="outline">Match {match.match}</Badge>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {match.date}
            </span>
            {match.kickoff_local && (
              <span className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {match.kickoff_local}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {match.venue}, {match.city}
            </span>
          </div>
        </div>

        {playable && home && away ? (
          <MatchSimulator home={home} away={away} />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="text-2xl font-bold sm:text-3xl">
                {match.home}{" "}
                <span className="text-muted-foreground mx-2">vs</span>{" "}
                {match.away}
              </div>
              <p className="text-muted-foreground max-w-md text-sm">
                This {match.round} fixture isn&apos;t playable yet — the
                qualifying teams are decided once the earlier rounds are
                simulated.
              </p>
              <Link
                href="/"
                className="text-primary text-sm font-medium hover:underline"
              >
                Back to fixtures
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
