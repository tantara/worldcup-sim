import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, Clock, MapPin } from "lucide-react";

import { SimulatorExperience } from "~/app/simulator/simulator-experience";
import { auth } from "~/server/auth";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ReplayCard, type Replay } from "~/app/match/[matchid]/replays";
import {
  getMatch,
  matchId,
  MATCHES,
  resolveMatch,
  venueGoogleMapsUrl,
} from "~/lib/tournament";
import {
  countCompletedSimulationsForMatch,
  listCompletedSimulationsForMatch,
} from "~/server/simulations/store";

export function generateStaticParams() {
  return MATCHES.map((m) => ({ matchid: matchId(m) }));
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
  const canonicalId = matchId(match);
  if (matchid !== canonicalId) redirect(`/match/${canonicalId}`);

  const session = await auth();
  const { home, away, playable } = resolveMatch(match);
  const venueUrl = venueGoogleMapsUrl(match);
  const PREVIEW_LIMIT = 4;
  const previousSimulations = playable
    ? await listCompletedSimulationsForMatch(match.match, PREVIEW_LIMIT)
    : [];
  const totalSimulations = playable
    ? await countCompletedSimulationsForMatch(match.match)
    : 0;
  const matchHeader = (
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
          <a
            href={venueUrl}
            target="_blank"
            rel="noreferrer"
            className="hover:text-primary hover:underline"
          >
            {match.venue}, {match.city}
          </a>
        </span>
      </div>
    </div>
  );

  if (playable && home && away) {
    return (
      <main className="flex-1">
        <SimulatorExperience
          initialGroup={match.group ?? undefined}
          initialMatchNumber={match.match}
          fixtureLocked
          requireAuth
          isAuthenticated={Boolean(session?.user)}
          afterHeader={
            previousSimulations.length > 0 ? (
              <PreviousSimulations
                simulations={previousSimulations}
                canonicalId={canonicalId}
                total={totalSimulations}
              />
            ) : undefined
          }
          title={
            <>
              {home.name} <span className="text-primary">vs</span> {away.name}
            </>
          }
        />
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8">
        {matchHeader}
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-2xl font-bold sm:text-3xl">
              {match.home} <span className="text-muted-foreground mx-2">vs</span>{" "}
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
      </div>
    </main>
  );
}

function PreviousSimulations({
  simulations,
  canonicalId,
  total,
}: {
  simulations: Replay[];
  canonicalId: string;
  total: number;
}) {
  const hasMore = total > simulations.length;
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Previous simulations</CardTitle>
        {hasMore && (
          <Link
            href={`/match/${canonicalId}/history`}
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
          >
            View all {total}
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {simulations.map((simulation) => (
            <ReplayCard
              key={simulation.id}
              simulation={simulation}
              canonicalId={canonicalId}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
