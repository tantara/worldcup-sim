import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  findTeam,
  getRoster,
  TEAMS,
  type Player,
  type RosterPlayer,
} from "~/lib/teams";
import { matchId, resolveMatch, teamFixtures } from "~/lib/tournament";

export function generateStaticParams() {
  return TEAMS.map((t) => ({ slug: t.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = findTeam(slug);
  return {
    title: team
      ? `${team.name} (FIFA #${team.fifaRanking}) · World Cup Simulator`
      : "Team not found",
  };
}

const POSITION_GROUPS: { label: string; pos: Player["position"] }[] = [
  { label: "Goalkeepers", pos: "GK" },
  { label: "Defenders", pos: "DF" },
  { label: "Midfielders", pos: "MF" },
  { label: "Forwards", pos: "FW" },
];

export default async function TeamPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = findTeam(slug);
  if (!team) notFound();

  const roster = getRoster(team.id);
  const fixtures = teamFixtures(team.name);

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-3 py-6 sm:px-4 sm:py-8">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-4" />
          All teams
        </Link>

        {/* Header */}
        <Card className="overflow-hidden pt-0">
          <div
            className="h-2 w-full"
            style={{ backgroundColor: team.colors.primary }}
          />
          <CardHeader className="pt-5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-5xl drop-shadow sm:text-6xl">
                {team.flag}
              </span>
              <div className="min-w-0 flex-1">
                <CardTitle className="truncate text-2xl sm:text-3xl">
                  {team.name}
                </CardTitle>
                <p className="text-muted-foreground mt-1 text-sm">
                  Manager: {team.manager}
                </p>
              </div>

              {/* FIFA world ranking */}
              <div className="bg-primary/10 ring-primary/25 flex flex-1 flex-col items-center rounded-xl px-4 py-2 text-center ring-1 sm:flex-none">
                <span className="text-muted-foreground flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase">
                  <TrendingUp className="size-3" />
                  FIFA Rank
                </span>
                <span className="text-primary text-2xl font-extrabold tabular-nums">
                  #{team.fifaRanking}
                </span>
              </div>

              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Badge>Group {team.group}</Badge>
                <Badge variant="secondary">{team.confederation}</Badge>
                <Badge variant="outline">Rating {team.rating}</Badge>
                <Badge variant="outline">{team.formation}</Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* Squad */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="size-5" />
                Squad
                <span className="text-muted-foreground text-sm font-normal">
                  ({roster.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {POSITION_GROUPS.map(({ label, pos }) => {
                const players = roster.filter((p) => p.position === pos);
                if (players.length === 0) return null;
                return (
                  <div key={pos}>
                    <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                      {label}
                    </h3>
                    <ul className="flex flex-col">
                      {players.map((p, i) => (
                        <RosterRow key={`${pos}-${i}`} player={p} />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Group fixtures */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="text-lg">
                Group {team.group} fixtures
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {fixtures.map((m) => {
                const { home, away } = resolveMatch(m);
                const opponent = m.home === team.name ? away : home;
                const homeAway = m.home === team.name ? "H" : "A";
                return (
                  <Link
                    key={m.match}
                    href={`/match/${matchId(m)}`}
                    className="group hover:border-primary/50 hover:bg-accent/40 flex min-w-0 items-center gap-3 rounded-lg border p-3 text-sm transition-colors"
                  >
                    <span className="bg-muted flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                      {homeAway}
                    </span>
                    <span className="text-xl">{opponent?.flag ?? "🏟️"}</span>
                    <span className="flex-1 truncate font-medium">
                      {opponent?.name ?? "TBD"}
                    </span>
                    {opponent ? (
                      <span className="text-muted-foreground shrink-0 text-[10px] font-semibold tabular-nums">
                        #{opponent.fifaRanking}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
                      <CalendarDays className="size-3.5" />
                      {m.date.slice(5)}
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function RosterRow({ player }: { player: RosterPlayer }) {
  return (
    <li className="hover:bg-muted/50 flex items-center gap-3 rounded-md px-1.5 py-1.5 text-sm">
      <span className="text-muted-foreground w-6 shrink-0 text-right text-xs font-semibold tabular-nums">
        {player.number ?? "–"}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{player.name}</span>
      <span className="text-muted-foreground hidden min-w-0 flex-1 truncate text-xs sm:flex sm:items-center sm:gap-1">
        <MapPin className="size-3 shrink-0" />
        {player.club ?? "—"}
      </span>
      <span className="text-muted-foreground hidden w-14 shrink-0 text-right text-xs min-[420px]:inline">
        {player.caps ?? "–"} caps
      </span>
      <span className="text-muted-foreground hidden w-10 shrink-0 text-right text-xs min-[420px]:inline">
        {player.age ?? "–"}y
      </span>
    </li>
  );
}
