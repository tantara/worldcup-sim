import Link from "next/link";

import { Badge } from "~/components/ui/badge";
import { DEFAULT_LOCALE, type Locale } from "~/lib/i18n/config";
import { formatReplayDate as formatLocaleReplayDate } from "~/lib/i18n/format";
import type { MatchResult } from "~/lib/simulator-types";
import type { listCompletedSimulationsForMatch } from "~/server/simulations/store";

export type Replay = Awaited<
  ReturnType<typeof listCompletedSimulationsForMatch>
>[number];

export function ReplayCard({
  simulation,
  canonicalId,
  locale = DEFAULT_LOCALE,
  completedLabel = "Completed",
}: {
  simulation: Replay;
  canonicalId: string;
  locale?: Locale;
  completedLabel?: string;
}) {
  return (
    <Link
      href={`/match/${canonicalId}/s/${simulation.id}`}
      className="hover:bg-muted/55 focus-visible:ring-ring/50 rounded-lg border p-3 transition outline-none focus-visible:ring-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold tabular-nums">
            {simulation.result
              ? replayScore(simulation.result)
              : `${simulation.scoreHome}-${simulation.scoreAway}`}
          </div>
          <div className="text-muted-foreground mt-1 truncate text-xs">
            {formatReplayDate(
              simulation.completedAt ?? simulation.createdAt,
              locale,
              completedLabel,
            )}
          </div>
        </div>
        <Badge variant="outline">Replay</Badge>
      </div>
    </Link>
  );
}

export function replayScore(result: MatchResult): string {
  return `${result.homeName} ${result.score.home}-${result.score.away} ${result.awayName}`;
}

export function formatReplayDate(
  value: Date | null,
  locale: Locale = DEFAULT_LOCALE,
  completedLabel = "Completed",
): string {
  return value ? formatLocaleReplayDate(value, locale) : completedLabel;
}
