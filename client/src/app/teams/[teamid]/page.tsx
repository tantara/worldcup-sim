import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, MapPin, Users } from "lucide-react";

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
  return TEAMS.map((t) => ({ teamid: t.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const team = findTeam(teamid);
  return {
    title: team
      ? `${team.name} · World Cup Simulator`
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
  params: Promise<{ teamid: string }>;
}) {
  const { teamid } = await params;
  const team = findTeam(teamid);
  if (!team) notFound();

  const roster = getRoster(team.id);
  const fixtures = teamFixtures(team.name);

  return (
    <main className="flex-1">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <Link
          href="/"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
              <span className="text-6xl drop-shadow">{team.flag}</span>
              <div className="min-w-0">
                <CardTitle className="text-3xl">{team.name}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Manager: {team.manager}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
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
                <span className="text-sm font-normal text-muted-foreground">
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
                    <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
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
              <CardTitle className="text-lg">Group {team.group} fixtures</CardTitle>
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
                    className="group flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors hover:border-primary/50 hover:bg-accent/40"
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                      {homeAway}
                    </span>
                    <span className="text-xl">{opponent?.flag ?? "🏟️"}</span>
                    <span className="flex-1 truncate font-medium">
                      {opponent?.name ?? "TBD"}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
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
    <li className="flex items-center gap-3 rounded-md px-1.5 py-1.5 text-sm hover:bg-muted/50">
      <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">
        {player.number ?? "–"}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{player.name}</span>
      <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:flex sm:items-center sm:gap-1">
        <MapPin className="size-3 shrink-0" />
        {player.club ?? "—"}
      </span>
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">
        {player.caps ?? "–"} caps
      </span>
      <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">
        {player.age ?? "–"}y
      </span>
    </li>
  );
}
