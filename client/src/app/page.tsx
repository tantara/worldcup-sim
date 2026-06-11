import Link from "next/link";
import type { ReactNode } from "react";
import {
  CalendarDays,
  ChevronRight,
  CirclePlay,
  Globe2,
  MapPin,
  Trophy,
} from "lucide-react";

import { Bracket } from "~/app/_components/bracket";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { getServerTranslations } from "~/lib/i18n/server";
import type { MessageKey } from "~/lib/i18n/messages";
import { GROUP_LETTERS, teamsInGroup, type Team } from "~/lib/teams";
import {
  groupStageSchedule,
  HOSTS,
  knockoutSchedule,
  matchId,
  resolveMatch,
  venueGoogleMapsUrl,
  type Match,
} from "~/lib/tournament";

type MatchDayHighlight = "today" | "tomorrow" | null;
type Translate = (
  key: MessageKey,
  values?: Record<string, string | number>,
) => string;

export default async function Home() {
  const { t } = await getServerTranslations();
  const groupSections = groupStageSchedule();
  const knockoutSections = knockoutSchedule();
  const groupFixtureCount = groupSections.reduce(
    (sum, section) => sum + section.matches.length,
    0,
  );
  const knockoutFixtureCount = knockoutSections.reduce(
    (sum, section) => sum + section.matches.length,
    0,
  );
  const now = new Date();
  const todayDateKey = dateKeyFromLocalDate(now);
  const tomorrowDateKey = dateKeyFromLocalDate(addLocalDays(now, 1));
  const opener = groupSections[0]?.matches[0];

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-3 py-6 sm:gap-8 sm:px-4 sm:py-8">
        <header className="min-w-0 overflow-hidden rounded-xl border bg-card/90 shadow-sm backdrop-blur">
          <div className="grid min-w-0 gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="pitch-stripes relative flex min-h-[18rem] min-w-0 flex-col justify-between overflow-hidden p-5 sm:p-7">
              <div className="pitch-center-line absolute inset-0" />
              <div className="relative min-w-0 max-w-3xl">
                <div className="mb-4 flex size-14 items-center justify-center rounded-lg border border-primary/40 bg-background/75 text-primary shadow-sm">
                  <Trophy className="size-7" />
                </div>
                <h1 className="max-w-full text-3xl leading-tight font-black tracking-tight break-words text-white sm:text-5xl sm:leading-tight lg:text-6xl">
                  {t("home.heroTitle")}
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 break-words text-white/78 sm:text-base">
                  {t("home.heroDescription")}
                </p>
              </div>
              <div className="relative mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center">
                {opener && (
                  <Link
                    href={`/match/${matchId(opener)}`}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-fit"
                  >
                    <CirclePlay className="size-4" />
                    {t("home.simulateOpener")}
                  </Link>
                )}
                <Link
                  href="/simulator"
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/20 bg-background/45 px-4 text-sm font-semibold text-white transition-colors hover:bg-background/65 sm:w-fit"
                >
                  {t("home.openSimulator")}
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </div>
            <div className="grid min-w-0 content-between gap-4 border-t bg-background/75 p-5 sm:p-6 lg:border-t-0 lg:border-l">
              <div className="min-w-0">
                <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                  {t("home.tournamentMap")}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight break-words">
                  {HOSTS.join(" · ")}
                </h2>
                <p className="mt-2 text-sm leading-6 break-words text-muted-foreground">
                  {t("home.tournamentMapDescription")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <MetricPill
                  icon={<Globe2 className="size-4" />}
                  label={t("home.metric.nations")}
                  value="48"
                />
                <MetricPill
                  icon={<Trophy className="size-4" />}
                  label={t("home.metric.groups")}
                  value={String(GROUP_LETTERS.length)}
                />
                <MetricPill
                  icon={<CalendarDays className="size-4" />}
                  label={t("home.metric.groupFixtures")}
                  value={String(groupFixtureCount)}
                />
                <MetricPill
                  icon={<ChevronRight className="size-4" />}
                  label={t("home.metric.knockout")}
                  value={String(knockoutFixtureCount)}
                />
              </div>
            </div>
          </div>
        </header>

        <Tabs defaultValue="schedule" className="gap-6">
          <TabsList className="grid h-auto w-full grid-cols-3 border bg-card/85 shadow-sm sm:inline-flex sm:w-fit">
            <TabsTrigger
              value="groups"
              className="h-8 data-active:bg-primary data-active:text-primary-foreground data-active:ring-1 data-active:ring-primary/35"
            >
              {t("home.tab.groups")}
            </TabsTrigger>
            <TabsTrigger
              value="schedule"
              className="h-8 data-active:bg-primary data-active:text-primary-foreground data-active:ring-1 data-active:ring-primary/35"
            >
              {t("home.tab.schedule")}
            </TabsTrigger>
            <TabsTrigger
              value="tournament"
              className="h-8 data-active:bg-primary data-active:text-primary-foreground data-active:ring-1 data-active:ring-primary/35"
            >
              {t("home.tab.tournament")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="groups">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {GROUP_LETTERS.map((letter) => (
                <GroupCard
                  key={letter}
                  letter={letter}
                  teams={teamsInGroup(letter)}
                  t={t}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="schedule" className="flex flex-col gap-8">
            {groupSections.map(({ group, matches }) => (
              <ScheduleSection
                key={group}
                title={`${t("common.group")} ${group}`}
                matches={matches}
                todayDateKey={todayDateKey}
                tomorrowDateKey={tomorrowDateKey}
                t={t}
              />
            ))}
            {knockoutSections.map(({ round, matches }) => (
              <ScheduleSection
                key={round}
                title={round}
                matches={matches}
                todayDateKey={todayDateKey}
                tomorrowDateKey={tomorrowDateKey}
                t={t}
              />
            ))}
          </TabsContent>

          <TabsContent value="tournament">
            <Bracket />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKeyFromLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function matchDayHighlight(
  match: Match,
  todayDateKey: string,
  tomorrowDateKey: string,
): MatchDayHighlight {
  if (match.date === todayDateKey) return "today";
  if (match.date === tomorrowDateKey) return "tomorrow";
  return null;
}

function MetricPill({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card/75 p-3">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-bold tracking-wide uppercase">
          {label}
        </span>
      </div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function GroupCard({
  letter,
  teams,
  t,
}: {
  letter: string;
  teams: Team[];
  t: Translate;
}) {
  return (
    <Card className="gap-0 border-primary/10 bg-card/90 shadow-sm backdrop-blur">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/15 text-sm font-black text-primary ring-1 ring-primary/25">
            {letter}
          </span>
          {t("common.group")} {letter}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col">
        {teams.map((team) => (
          <Link
            key={team.id}
            href={`/team/${team.id}`}
            className="group border-border/60 hover:bg-accent/40 -mx-2 flex items-center gap-2.5 rounded-md border-t px-2 py-2 text-sm transition-colors first:border-t-0"
          >
            <span className="text-xl">{team.flag}</span>
            <span className="group-hover:text-primary flex-1 truncate font-medium">
              {team.name}
            </span>
            <Badge
              variant="outline"
              className="h-5 shrink-0 px-1.5 text-[10px] font-bold"
              title={`${team.groupTier.label} ${t("common.group")} ${team.group}`}
            >
              T{team.groupTier.tier}
            </Badge>
            <span
              className="text-muted-foreground shrink-0 text-xs font-semibold tabular-nums"
              title={t("team.fifaRank")}
            >
              #{team.fifaRanking}
            </span>
            <span className="text-muted-foreground hidden text-xs sm:inline">
              {team.confederation}
            </span>
            <ChevronRight className="text-muted-foreground/50 group-hover:text-primary size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ScheduleSection({
  title,
  matches,
  todayDateKey,
  tomorrowDateKey,
  t,
}: {
  title: string;
  matches: Match[];
  todayDateKey: string;
  tomorrowDateKey: string;
  t: Translate;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <Badge variant="secondary" className="tabular-nums">
          {matches.length}
        </Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {matches.map((m) => (
          <MatchCard
            key={m.match}
            match={m}
            highlight={matchDayHighlight(m, todayDateKey, tomorrowDateKey)}
            t={t}
          />
        ))}
      </div>
    </section>
  );
}

function MatchCard({
  match,
  highlight,
  t,
}: {
  match: Match;
  highlight: MatchDayHighlight;
  t: Translate;
}) {
  const { home, away, playable } = resolveMatch(match);
  const venueUrl = venueGoogleMapsUrl(match);
  const highlightLabel =
    highlight === "today"
      ? t("common.today")
      : highlight === "tomorrow"
        ? t("common.tomorrow")
        : null;

  const body = (
    <Card
      data-highlight={highlight ?? undefined}
      className={`relative gap-0 border-primary/10 bg-card/90 p-4 shadow-sm backdrop-blur transition-colors data-[highlight=today]:border-primary/70 data-[highlight=today]:bg-primary/10 data-[highlight=today]:shadow-[0_0_0_1px_oklch(0.74_0.17_152/45%),0_16px_42px_oklch(0.74_0.17_152/12%)] data-[highlight=tomorrow]:border-accent/70 data-[highlight=tomorrow]:bg-accent/10 data-[highlight=tomorrow]:shadow-[0_0_0_1px_oklch(0.57_0.11_84/35%)] ${
        playable
          ? "group hover:border-primary/50 hover:bg-secondary/70"
          : "opacity-70"
      }`}
    >
      {playable && (
        <Link
          href={`/match/${matchId(match)}`}
          className="absolute inset-0 z-10 rounded-xl"
          aria-label={`${t("common.match")} ${match.match}`}
        />
      )}
      <div className="text-muted-foreground mb-3 flex items-start justify-between gap-2 text-xs">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <CalendarDays className="size-3.5" />
          {highlightLabel && (
            <Badge
              className={`h-5 rounded-md px-1.5 text-[10px] font-black tracking-wide uppercase ${
                highlight === "today"
                  ? "bg-primary text-primary-foreground"
                  : "bg-accent text-accent-foreground"
              }`}
            >
              {highlightLabel}
            </Badge>
          )}
          {match.date}
          {match.kickoff_local ? ` · ${match.kickoff_local}` : ""}
        </span>
        {playable ? (
          <ChevronRight className="group-hover:text-primary size-4 transition-transform group-hover:translate-x-0.5" />
        ) : (
          <span className="text-[10px] font-semibold tracking-wide uppercase">
            {t("common.tbd")}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <span className="text-2xl">{home?.flag ?? "🏟️"}</span>
          <span className="truncate font-semibold">{match.home}</span>
        </div>
        <span className="text-muted-foreground shrink-0 text-xs font-bold">
          {t("common.vs").toUpperCase()}
        </span>
        <div className="flex flex-1 items-center justify-end gap-2">
          <span className="truncate text-right font-semibold">
            {match.away}
          </span>
          <span className="text-2xl">{away?.flag ?? "🏟️"}</span>
        </div>
      </div>

      <div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
        <MapPin className="size-3.5" />
        <a
          href={venueUrl}
          target="_blank"
          rel="noreferrer"
          className="relative z-20 hover:text-primary hover:underline"
        >
          {match.venue}, {match.city}
        </a>
      </div>
    </Card>
  );

  return body;
}
