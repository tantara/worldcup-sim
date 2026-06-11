import Link from "next/link";
import type { CSSProperties } from "react";

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
      className="group block min-h-18 rounded-lg border bg-card/95 p-2.5 shadow-sm transition-colors hover:border-primary/50 hover:bg-secondary/70"
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
  const baseCount = columns[0]?.matches.length ?? 1;

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-3 overflow-x-auto px-3 pb-2 sm:-mx-4 sm:px-4">
        <div className="flex min-w-max items-start">
          {columns.map((col, colIndex) => (
            <div key={col.round} className="flex items-start">
              <BracketColumn
                baseCount={baseCount}
                label={ROUND_LABEL[col.round] ?? col.round}
                matches={col.matches}
              />
              {colIndex < columns.length - 1 && (
                <BracketConnectorLane
                  baseCount={baseCount}
                  sourceCount={col.matches.length}
                />
              )}
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

function BracketColumn({
  baseCount,
  label,
  matches,
}: {
  baseCount: number;
  label: string;
  matches: Match[];
}) {
  const span = Math.max(1, baseCount / matches.length);

  return (
    <div className="w-36 shrink-0 sm:w-44">
      <h3 className="mb-3 h-8 text-center text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </h3>
      <div
        className="grid"
        style={
          {
            "--bracket-row-height": "5.5rem",
            gridTemplateRows: `repeat(${baseCount}, var(--bracket-row-height))`,
          } as CSSProperties
        }
      >
        {matches.map((match, index) => (
          <div
            key={match.match}
            className="flex items-center"
            style={{ gridRow: `${Math.floor(index * span) + 1} / span ${span}` }}
          >
            <BracketMatch match={match} />
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketConnectorLane({
  baseCount,
  sourceCount,
}: {
  baseCount: number;
  sourceCount: number;
}) {
  const sourceSpan = Math.max(1, baseCount / sourceCount);
  const pairCount = Math.floor(sourceCount / 2);

  return (
    <div className="w-10 shrink-0 sm:w-14">
      <div className="mb-3 h-8" />
      <div
        className="grid"
        aria-hidden="true"
        style={
          {
            "--bracket-row-height": "5.5rem",
            gridTemplateRows: `repeat(${baseCount}, var(--bracket-row-height))`,
          } as CSSProperties
        }
      >
        {Array.from({ length: pairCount }, (_, pairIndex) => (
          <div
            key={pairIndex}
            className="relative"
            style={{
              gridRow: `${Math.floor(pairIndex * sourceSpan * 2) + 1} / span ${
                sourceSpan * 2
              }`,
            }}
          >
            <span className="absolute top-1/4 right-1/2 left-0 border-t border-primary/45" />
            <span className="absolute top-3/4 right-1/2 left-0 border-t border-primary/45" />
            <span className="absolute top-1/4 bottom-1/4 left-1/2 border-l border-primary/45" />
            <span className="absolute top-1/2 right-0 left-1/2 border-t border-primary/45" />
          </div>
        ))}
      </div>
    </div>
  );
}
