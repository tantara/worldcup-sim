import type { ComponentProps, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowRight, Trophy } from "lucide-react";
import { FaDiscord } from "react-icons/fa";
import { FcGoogle } from "react-icons/fc";

import {
  formatReplayDate,
  replayScore,
} from "~/app/match/[matchid]/replays";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import type { Locale } from "~/lib/i18n/config";
import { getServerTranslations } from "~/lib/i18n/server";
import { getTeam } from "~/lib/teams";
import { getMatch, matchId } from "~/lib/tournament";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { accounts } from "~/server/db/schema";
import { listSimulationsForUser } from "~/server/simulations/store";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return { title: t("account.title") };
}

type Simulation = Awaited<ReturnType<typeof listSimulationsForUser>>[number];

const PROVIDER_META: Record<string, { label: string; icon: ReactNode }> = {
  google: { label: "Google", icon: <FcGoogle className="size-3.5" /> },
  discord: {
    label: "Discord",
    icon: <FaDiscord className="size-3.5 text-[#5865F2]" />,
  },
};

const STATUS_VARIANT: Record<
  Simulation["status"],
  ComponentProps<typeof Badge>["variant"]
> = {
  completed: "secondary",
  running: "default",
  queued: "outline",
  created: "outline",
  failed: "destructive",
};

export default async function AccountPage() {
  const { locale, t } = await getServerTranslations();
  const session = await auth();
  if (!session?.user?.id) {
    // Nothing to show without an identity; the navbar offers sign-in on "/".
    redirect("/");
  }
  const user = session.user;

  const [simulations, linkedAccounts] = await Promise.all([
    listSimulationsForUser(user.id),
    db
      .select({ provider: accounts.provider })
      .from(accounts)
      .where(eq(accounts.userId, user.id)),
  ]);

  const providers = [...new Set(linkedAccounts.map((a) => a.provider))];
  const completed = simulations.filter((s) => s.status === "completed").length;
  const label = user.name ?? user.email ?? t("account.yourAccount");

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8">
        {/* Account details */}
        <Card>
          <CardContent className="flex flex-col gap-4 py-6 sm:flex-row sm:items-center">
            <Avatar className="size-16">
              {user.image ? <AvatarImage src={user.image} alt="" /> : null}
              <AvatarFallback className="text-xl font-semibold">
                {label.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-extrabold tracking-tight">
                {label}
              </h1>
              {user.email && (
                <p className="text-muted-foreground truncate text-sm">
                  {user.email}
                </p>
              )}
              {providers.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {providers.map((p) => {
                    const meta = PROVIDER_META[p];
                    return (
                      <Badge key={p} variant="outline" className="gap-1.5">
                        {meta?.icon}
                        {meta?.label ?? p}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-6 sm:flex-col sm:gap-1 sm:text-right">
              <div>
                <div className="text-2xl font-bold tabular-nums">
                  {simulations.length}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t("account.simulations")}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold tabular-nums">
                  {completed}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t("account.completed")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Simulations the user has kicked off */}
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t("account.yourSimulations")}</CardTitle>
          </CardHeader>
          <CardContent>
            {simulations.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm">
                <Trophy className="size-6 opacity-60" />
                <p>{t("account.empty")}</p>
                <Link
                  href="/"
                  className="text-primary inline-flex items-center gap-1 font-medium hover:underline"
                >
                  {t("account.pickFixture")}
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {simulations.map((simulation) => (
                  <SimulationCard
                    key={simulation.id}
                    simulation={simulation}
                    locale={locale}
                    completedLabel={t("common.completed")}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function SimulationCard({
  simulation,
  locale,
  completedLabel,
}: {
  simulation: Simulation;
  locale: Locale;
  completedLabel: string;
}) {
  const home = safeTeam(simulation.homeId);
  const away = safeTeam(simulation.awayId);
  const scoreline = simulation.result
    ? replayScore(simulation.result)
    : `${home?.name ?? simulation.homeId} ${simulation.scoreHome}-${simulation.scoreAway} ${away?.name ?? simulation.awayId}`;

  // Prefer the canonical "{num}-{home}-vs-{away}" slug; fall back to the bare
  // match number for any row whose fixture no longer resolves.
  const match = getMatch(String(simulation.matchId));
  const matchSlug = match ? matchId(match) : String(simulation.matchId);

  return (
    <Link
      href={`/match/${matchSlug}/s/${simulation.id}`}
      className="hover:bg-muted/55 focus-visible:ring-ring/50 flex flex-col gap-2 rounded-lg border p-3 transition outline-none focus-visible:ring-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 font-semibold">
          <span>{home?.flag}</span>
          <span className="tabular-nums">
            {simulation.scoreHome}-{simulation.scoreAway}
          </span>
          <span>{away?.flag}</span>
        </div>
        <Badge variant={STATUS_VARIANT[simulation.status]}>
          {simulation.status}
        </Badge>
      </div>
      <div className="text-muted-foreground truncate text-xs">{scoreline}</div>
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span className="uppercase">{simulation.mode}</span>
        <span>
          {formatReplayDate(
            simulation.completedAt ?? simulation.createdAt,
            locale,
            completedLabel,
          )}
        </span>
      </div>
    </Link>
  );
}

/** getTeam throws on unknown ids; tolerate any legacy/bad rows on the account page. */
function safeTeam(id: string) {
  try {
    return getTeam(id);
  } catch {
    return null;
  }
}
