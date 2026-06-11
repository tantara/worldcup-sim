import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { SimulatorExperience } from "~/app/simulator/simulator-experience";
import { Badge } from "~/components/ui/badge";
import { getMatch, matchId, resolveMatch } from "~/lib/tournament";
import { getSimulation } from "~/server/simulations/store";

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

  // Simulations are public — anyone can open any simulation to replay it,
  // regardless of who created it or its status.

  const { home, away, playable } = resolveMatch(match);
  if (!playable || !home || !away) {
    notFound();
  }

  const canonicalId = matchId(match);

  return (
    <main className="flex-1">
      <SimulatorExperience
        initialGroup={match.group ?? undefined}
        initialMatchNumber={match.match}
        fixtureLocked
        replay={{ simulationId: simulation.id }}
        title={
          <>
            {home.name} <span className="text-primary">vs</span> {away.name}
          </>
        }
        beforeHeader={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href={`/match/${canonicalId}`}
              className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors"
            >
              <ArrowLeftIcon className="size-4" />
              Match {match.match}
            </Link>
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <span className="font-mono text-xs">Simulation {simulation.id}</span>
              <Badge variant="secondary">{simulation.status}</Badge>
            </div>
          </div>
        }
      />
    </main>
  );
}
