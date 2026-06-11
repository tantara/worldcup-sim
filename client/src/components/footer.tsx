import { Trophy } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-background/50">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <Trophy className="size-4 text-primary" />
          <span>World Cup Simulator</span>
        </div>
        <p>Matches are simulated for fun — no results are official.</p>
      </div>
    </footer>
  );
}
