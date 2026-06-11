import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { getMatch, resolveMatch } from "~/lib/tournament";
import { auth } from "~/server/auth";
import { getSimulation } from "~/server/simulations/store";
import { SimulationClient } from "./simulation-client";

export default async function SimulationPage({
  params,
}: {
  params: Promise<{ matchid: string; simulationid: string }>;
}) {
  const { matchid, simulationid } = await params;
  const match = getMatch(matchid);
  if (!match) notFound();

  const simulation = await getSimulation(simulationid);
  if (simulation?.matchId !== match.match) {
    notFound();
  }

  if (simulation.status !== "completed") {
    const session = await auth();
    if (!session?.user?.id) {
      redirect(`/match/${match.match}`);
    }
    if (simulation.userId !== session.user.id) {
      notFound();
    }
  }

  const { home, away, playable } = resolveMatch(match);
  if (!playable || !home || !away) {
    notFound();
  }

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8">
        <div className="flex flex-col gap-3">
          <Link
            href={`/match/${match.match}`}
            className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeftIcon className="size-4" />
            Match {match.match}
          </Link>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                {home.name} vs {away.name}
              </h1>
              <p className="text-muted-foreground text-sm">
                Simulation {simulation.id}
              </p>
            </div>
            <Badge variant="secondary">{simulation.status}</Badge>
          </div>
        </div>

        <SimulationClient
          simulationId={simulation.id}
          home={home}
          away={away}
        />
      </div>
    </main>
  );
}
