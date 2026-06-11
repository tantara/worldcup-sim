import Link from "next/link";
import { Trophy } from "lucide-react";

import { ModeToggle } from "~/components/mode-toggle";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Trophy className="size-4" />
          </span>
          <span>
            World Cup <span className="text-primary">Simulator</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/playground"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Playground
          </Link>
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}
