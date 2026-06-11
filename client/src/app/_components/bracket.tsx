import Link from "next/link";

import { bracket, matchId, type Match } from "~/lib/tournament";

const ROUND_LABEL: Record<string, string> = {
  "Round of 32": "Round of 32",
  "Round of 16": "Round of 16",
  "Quarter-final": "Quarter-finals",
  "Semi-final": "Semi-finals",
  Final: "Final",
};

// Compact label for a bracket slot placeholder.
function slotLabel(slot: string): string {
  let m;
  if ((m = /^Winner Group ([A-L])$/.exec(slot))) return `Winner Grp ${m[1]}`;
  if ((m = /^Runner-up Group ([A-L])$/.exec(slot))) return `2nd Grp ${m[1]}`;
  if ((m = /^3rd Group (.+)$/.exec(slot))) return `3rd: ${m[1]}`;
  if ((m = /^Winner Match (\d+)$/.exec(slot))) return `Winner #${m[1]}`;
  if ((m = /^Loser Match (\d+)$/.exec(slot))) return `Loser #${m[1]}`;
  return slot;
}

function BracketMatch({ match }: { match: Match }) {
  return (
    <Link
      href={`/match/${matchId(match)}`}
      className="group bg-card hover:border-primary/50 hover:bg-accent/40 block rounded-lg border p-2.5 transition-colors"
    >
      <div className="text-muted-foreground mb-1.5 flex items-center justify-between text-[10px]">
        <span>#{match.match}</span>
        <span>{match.date.slice(5)}</span>
      </div>
      <div className="flex flex-col gap-1">
        <Slot text={match.home} />
        <div className="bg-border h-px" />
        <Slot text={match.away} />
      </div>
    </Link>
  );
}

function Slot({ text }: { text: string }) {
  return (
    <span className="truncate text-xs font-medium" title={text}>
      {slotLabel(text)}
    </span>
  );
}

export function Bracket() {
  const { columns, thirdPlace } = bracket();

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-3 overflow-x-auto px-3 pb-2 sm:-mx-4 sm:px-4">
        <div className="flex min-w-max gap-3 sm:gap-4">
          {columns.map((col) => (
            <div key={col.round} className="flex w-36 flex-col sm:w-44">
              <h3 className="text-muted-foreground mb-3 text-center text-xs font-semibold tracking-wide uppercase">
                {ROUND_LABEL[col.round] ?? col.round}
              </h3>
              <div className="flex flex-1 flex-col justify-around gap-3">
                {col.matches.map((m) => (
                  <BracketMatch key={m.match} match={m} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {thirdPlace && (
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            Third-place play-off
          </h3>
          <div className="w-full sm:w-44">
            <BracketMatch match={thirdPlace} />
          </div>
        </div>
      )}
    </div>
  );
}
