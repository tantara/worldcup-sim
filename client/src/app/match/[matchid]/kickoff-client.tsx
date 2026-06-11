"use client";

import { useRouter } from "next/navigation";
import { PlayIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";

import { LoginDialog } from "~/components/auth-nav";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import type { Team } from "~/lib/teams";

export function MatchKickoff({
  matchId,
  home,
  away,
  signedIn,
}: {
  matchId: number;
  home: Team;
  away: Team;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kickoff = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/simulations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ matchId }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
        url?: string;
      } | null;

      if (!res.ok || !payload?.url) {
        throw new Error(payload?.error ?? `Request failed (${res.status})`);
      }

      router.push(payload.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <TeamPanel team={home} align="left" />

        <div className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary">Persistent simulation</Badge>
            <Badge variant="outline">Match {matchId}</Badge>
          </div>
          <div className="text-muted-foreground text-sm">vs</div>
          {signedIn ? (
            <Button
              type="button"
              size="lg"
              className="min-w-40"
              disabled={loading}
              onClick={kickoff}
            >
              <PlayIcon />
              {loading ? "Creating..." : "Kick off"}
            </Button>
          ) : (
            <LoginDialog
              callbackUrl={`/match/${matchId}`}
              triggerClassName="bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground h-11 min-w-40 border-transparent px-8 text-base shadow-xs"
            >
              <PlayIcon className="size-4" />
              <span>Kick off</span>
            </LoginDialog>
          )}
          {error && (
            <p className="text-destructive max-w-72 text-center text-sm">
              {error}
            </p>
          )}
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ShieldCheckIcon className="size-3.5" />
            Saved simulations can be replayed or resumed from their URL.
          </div>
        </div>

        <TeamPanel team={away} align="right" />
      </CardContent>
    </Card>
  );
}

function TeamPanel({
  team,
  align,
}: {
  team: Team;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex items-center gap-4 ${
        align === "right" ? "justify-start lg:flex-row-reverse" : ""
      }`}
    >
      <span className="bg-muted flex size-14 items-center justify-center rounded-lg border text-4xl">
        {team.flag}
      </span>
      <div className={align === "right" ? "lg:text-right" : ""}>
        <div className="text-2xl font-extrabold tracking-tight">
          {team.name}
        </div>
        <div className="text-muted-foreground text-sm">
          {team.rating} rating
        </div>
      </div>
    </div>
  );
}
