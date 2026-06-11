import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { ReplayCard } from "~/app/match/[matchid]/replays";
import { Card, CardContent } from "~/components/ui/card";
import { ScrollArea } from "~/components/ui/scroll-area";
import { getServerTranslations } from "~/lib/i18n/server";
import { getMatch, matchId, MATCHES, resolveMatch } from "~/lib/tournament";
import { listCompletedSimulationsForMatch } from "~/server/simulations/store";

export function generateStaticParams() {
  return MATCHES.map((m) => ({ matchid: matchId(m) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ matchid: string }>;
}) {
  const { matchid } = await params;
  const { t } = await getServerTranslations();
  const match = getMatch(matchid);
  if (!match) return { title: t("common.notFound.match") };
  return {
    title: `${match.home} vs ${match.away} · ${t("match.historyTitle")}`,
  };
}

export default async function MatchHistoryPage({
  params,
}: {
  params: Promise<{ matchid: string }>;
}) {
  const { matchid } = await params;
  const { locale, t } = await getServerTranslations();
  const match = getMatch(matchid);
  if (!match) notFound();
  const canonicalId = matchId(match);
  if (matchid !== canonicalId) redirect(`/match/${canonicalId}/history`);

  const { home, away, playable } = resolveMatch(match);
  const simulations = playable
    ? await listCompletedSimulationsForMatch(match.match, 500)
    : [];

  const homeName = home?.name ?? match.home;
  const awayName = away?.name ?? match.away;

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8 lg:h-[calc(100vh-6rem)] lg:overflow-hidden">
        <div className="flex flex-col gap-3">
          <Link
            href={`/match/${canonicalId}`}
            className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" />
            {t("common.backToMatch")}
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              {t("match.historyTitle")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {homeName} <span className="text-primary">vs</span> {awayName} ·{" "}
              {simulations.length}{" "}
              {simulations.length === 1
                ? t("common.replay")
                : t("common.replays")}
            </p>
          </div>
        </div>

        {simulations.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-16 text-center text-sm">
              {t("match.noReplays")}
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="lg:-mx-1 lg:min-h-0 lg:flex-1 lg:px-1">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {simulations.map((simulation) => (
                <ReplayCard
                  key={simulation.id}
                  simulation={simulation}
                  canonicalId={canonicalId}
                  locale={locale}
                  completedLabel={t("common.completed")}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </main>
  );
}
