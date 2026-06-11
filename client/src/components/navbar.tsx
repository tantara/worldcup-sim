import Link from "next/link";
import { Trophy } from "lucide-react";

import { ModeToggle } from "~/components/mode-toggle";

export function Navbar() {
  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50 w-full border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 font-bold">
          <span className="bg-primary/15 text-primary ring-primary/30 flex size-8 items-center justify-center rounded-lg ring-1">
            <Trophy className="size-4" />
          </span>
          <span className="truncate">
            World Cup <span className="text-primary">Simulator</span>
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-1">
          <Link
            href="/playground"
            className="text-muted-foreground hover:text-foreground rounded-md px-2 py-1.5 text-sm font-medium transition-colors sm:px-3"
          >
            Playground
          </Link>
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}
